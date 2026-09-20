## ADDED Requirements

### Requirement: The document model defines a CONTENT_GROUP node

The system SHALL define a `CONTENT_GROUP` node type representing a numbered group of content (an
*Absatz* with its sub-items) as it exists in the Demokratis document model. The node SHALL carry
`id`, `number`, `contents`, `format` and `children`. It SHALL be structurally a container — it
holds no text of its own — but SHALL carry `contents` and `format` fields because the platform's
envelope parser requires them on every node that is not `DOCUMENT`, `LIST` or `LIST_ITEM`.

#### Scenario: A well-formed group validates

- **WHEN** `isValidNode` is given a `CONTENT_GROUP` with `number: '1'`, `contents: {}`,
  `format: 'TEXT'`, and one `CONTENT` child
- **THEN** it returns `true`

#### Scenario: A group without contents is invalid

- **WHEN** `isValidNode` is given a `CONTENT_GROUP` with no `contents` field
- **THEN** it returns `false` — the platform's importer rejects such a node, so StructEdit must
  not produce one

#### Scenario: A group without a format is invalid

- **WHEN** `isValidNode` is given a `CONTENT_GROUP` with no `format` field
- **THEN** it returns `false`

#### Scenario: A group accepts a null number

- **WHEN** `isValidNode` is given a `CONTENT_GROUP` with `number: null`
- **THEN** it returns `true` — every node type's number is nullable in the platform model

### Requirement: Group placement mirrors the platform's child rules

The system SHALL allow a `CONTENT_GROUP` only where `DocNodeType::getAllowedChildTypes()` allows
it — directly under `DOCUMENT` and under `HEADING` — and SHALL restrict its own children to
`CONTENT`, `LIST` and `IMAGE`. A group SHALL NOT be valid under a `LIST_ITEM` and SHALL NOT be
valid inside another group. The runtime child table and the typed `children` unions SHALL be kept
in sync by the existing compile-time guard.

#### Scenario: A group under a heading is valid

- **WHEN** `isValidNode` is given a `HEADING` whose children include a `CONTENT_GROUP`
- **THEN** it returns `true`

#### Scenario: A group under a list item is rejected

- **WHEN** `isValidNode` is given a `LIST_ITEM` whose children include a `CONTENT_GROUP`
- **THEN** it returns `false`

#### Scenario: A nested group is rejected

- **WHEN** `isValidNode` is given a `CONTENT_GROUP` whose children include another
  `CONTENT_GROUP`
- **THEN** it returns `false`

#### Scenario: Disallowed children are rejected

- **WHEN** `isValidNode` is given a `CONTENT_GROUP` whose children include a `HEADING` or a
  `FOOTNOTE`
- **THEN** it returns `false`, while `CONTENT`, `LIST` and `IMAGE` children are accepted

#### Scenario: The child table and the types cannot drift

- **WHEN** a child type is added to `ALLOWED_CHILDREN.CONTENT_GROUP` without being added to the
  node's typed `children` union (or vice versa)
- **THEN** the type-check step fails

### Requirement: Documents containing groups round-trip through the envelope

A DocTree envelope containing `CONTENT_GROUP` nodes SHALL load — over file upload and over the
`loadFile` URL flow alike — and SHALL export unchanged where the user made no edit. The group's
`contents` value SHALL be preserved verbatim even though the editor never displays or edits it.

#### Scenario: A platform export with grouped Absätze opens

- **WHEN** a DocTree envelope produced by the Demokratis platform contains a heading with a
  `CONTENT_GROUP` holding a `CONTENT` node and a lettered `LIST`
- **THEN** the document opens in the editor with that structure intact, instead of being rejected
  as an unsupported format

#### Scenario: An unedited group exports byte-identically

- **WHEN** such a document is exported without editing the group
- **THEN** the exported node carries the same `id`, `number`, `type`, `contents`, `format` and
  children as the imported one

#### Scenario: A non-empty contents value survives

- **WHEN** an imported group carries a non-empty `contents` value
- **THEN** the exported group carries the same value — the field is carried, not consumed

### Requirement: A group's number renders where the platform renders it

The rendered preview SHALL place a group's number according to the platform's rule
(`DocNode::rendersNumberInline()`): inline, as the leading badge of the group's first child, when
that first child is a `CONTENT` node; on its own line above the children in every other case
(first child is a `LIST` or `IMAGE`, or the group is empty). The group itself SHALL render no
heading and no text. Numbers SHALL render through the same MARKDOWN_MINIMAL path as every other
node number.

#### Scenario: Number travels inline with a first CONTENT child

- **WHEN** the preview renders a `CONTENT_GROUP` with `number: '1'` whose first child is a
  `CONTENT` node with text "Wer Risotto rührt …"
- **THEN** the number appears at the start of that paragraph and no separate number line is
  rendered for the group

#### Scenario: Number renders above a first LIST child

- **WHEN** the preview renders a `CONTENT_GROUP` with `number: '2'` whose first child is a `LIST`
- **THEN** the number is rendered on its own line above the list

#### Scenario: Inherited and own numbers both render

- **WHEN** a group with `number: '1'` has a first `CONTENT` child that itself has
  `number: 'bis'`
- **THEN** both are rendered at the start of the paragraph, the inherited group number first

#### Scenario: A numberless group renders no badge

- **WHEN** the preview renders a `CONTENT_GROUP` with `number: null`
- **THEN** no number is rendered for the group, inline or above, and its children render normally

#### Scenario: The tree view leaves numbers where they are

- **WHEN** the tree (left) pane renders the same group
- **THEN** the group shows its own number on its own row and the child shows its own — the inline
  rule applies to the rendered document, not to the structural view

### Requirement: The editor can create and dissolve a group

The system SHALL offer a group operation that wraps a selected `CONTENT` node — together with any
contiguous following `LIST` or `IMAGE` siblings included in the selection — in a new
`CONTENT_GROUP` at the same position, transferring the content node's `number` to the group. It
SHALL offer an ungroup operation that replaces a `CONTENT_GROUP` with its children in place,
transferring the group's number to a first `CONTENT` child that has none. Each operation SHALL
commit exactly one history entry. The group SHALL NOT be reachable through the type selector. The
editor SHALL offer number editing on a group — in the tree pane and via `Enter` on a selected
group — and SHALL NOT offer text editing on it, even though the node carries a `contents` field.

#### Scenario: Grouping transfers the number

- **WHEN** the user groups a `CONTENT` node with `number: '1'`
- **THEN** the new `CONTENT_GROUP` has `number: '1'`, the content node's own `number` is `null`,
  and the content node is the group's only child

#### Scenario: Grouping takes contiguous following siblings

- **WHEN** the user selects a `CONTENT` node and the `LIST` immediately following it and groups
  them
- **THEN** both become children of the new group, in their original order

#### Scenario: Grouping is refused where a group cannot live

- **WHEN** the user attempts to group a `CONTENT` node that sits inside a `LIST_ITEM`
- **THEN** the document is unchanged, no history entry is committed, and the action is not offered

#### Scenario: Ungrouping restores the children in place

- **WHEN** the user ungroups a `CONTENT_GROUP` holding a `CONTENT` node and a `LIST`
- **THEN** both children take the group's position among its former siblings, in order, and the
  group is gone

#### Scenario: Ungrouping hands the number back

- **WHEN** the ungrouped group had `number: '1'` and its first `CONTENT` child had no number
- **THEN** that child ends up with `number: '1'`

#### Scenario: Ungrouping does not overwrite a child number

- **WHEN** the ungrouped group had `number: '1'` and its first `CONTENT` child had
  `number: 'bis'`
- **THEN** the child keeps `'bis'` and the group's number is dropped with the group

#### Scenario: A group's number is editable and its text is not

- **WHEN** a `CONTENT_GROUP` row is shown in the tree pane
- **THEN** it renders an editable number badge and no text-editing surface, and double-clicking or
  pressing `Enter` on the selected group opens number edit

#### Scenario: Group and ungroup are single history entries

- **WHEN** the user groups a node and then presses undo
- **THEN** the tree is exactly what it was before the grouping, in one step

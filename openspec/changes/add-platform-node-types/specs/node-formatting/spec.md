# Spec Delta

## MODIFIED Requirements

### Requirement: Every content-bearing node carries a required format field
The system SHALL require a `format: NodeFormat` field on every node whose type can hold `contents` (`heading`, `content`, `footnote`, `image`, `table`, `definition_list`, `content_group`). Container-only nodes (`document`, `list`, `list_item`) SHALL NOT carry a format. `isValidNode` and `isValidDocument` SHALL reject any tree that violates these rules. A `content_group` carries the field for wire fidelity with the platform; it is never shown or edited.

#### Scenario: Content node without format is invalid
- **WHEN** `isValidNode` is given a node of type `content` that has no `format` field
- **THEN** it returns `false`

#### Scenario: Container node with format is invalid
- **WHEN** `isValidNode` is given a node of type `list` that has a `format` field
- **THEN** it returns `false`

#### Scenario: Heading with allowed format is valid
- **WHEN** `isValidNode` is given a `heading` node with `format: 'MARKDOWN_MINIMAL'`
- **THEN** it returns `true`

#### Scenario: Table without format is invalid
- **WHEN** `isValidNode` is given a `table` node with `contents` but no `format` field
- **THEN** it returns `false`

#### Scenario: Content group without format is invalid
- **WHEN** `isValidNode` is given a `content_group` node with `contents` and `children` but no `format` field
- **THEN** it returns `false`

### Requirement: Per-type allowed-format restrictions are enforced
The system SHALL restrict each content-bearing node type to a fixed set of allowed formats and SHALL expose `canHaveFormat(nodeType, format)` as the single source of truth used by validation, the renderer, and the UI. The allow-lists are: `content` → `TEXT|NEWLINES|MARKDOWN`; `heading` → `TEXT|NEWLINES|MARKDOWN_MINIMAL`; `footnote` → `TEXT|NEWLINES|MARKDOWN`; `image` → `TEXT|NEWLINES`; `table` → `MARKDOWN`; `definition_list` → `MARKDOWN`; `content_group` → `TEXT|NEWLINES`.

#### Scenario: Heading with MARKDOWN is rejected
- **WHEN** `isValidNode` is given a `heading` node with `format: 'MARKDOWN'`
- **THEN** it returns `false` because `MARKDOWN` is not in the heading allow-list

#### Scenario: Content node with MARKDOWN_MINIMAL is rejected
- **WHEN** `isValidNode` is given a `content` node with `format: 'MARKDOWN_MINIMAL'`
- **THEN** it returns `false`

#### Scenario: canHaveFormat reflects the allow-lists
- **WHEN** any consumer calls `canHaveFormat('image', 'MARKDOWN')`
- **THEN** it returns `false`, and `canHaveFormat('content', 'MARKDOWN')` returns `true`

#### Scenario: Table with a non-Markdown format is rejected
- **WHEN** `isValidNode` is given a `table` or `definition_list` node with `format: 'TEXT'`
- **THEN** it returns `false`, and `canHaveFormat('TABLE', 'MARKDOWN')` returns `true`

#### Scenario: Content group with a Markdown format is rejected
- **WHEN** `isValidNode` is given a `content_group` node with `format: 'MARKDOWN'`
- **THEN** it returns `false`, while `format: 'NEWLINES'` is accepted

### Requirement: New nodes receive a sensible default format
The system SHALL assign each newly created content-bearing node a default format equal to `TEXT` for `heading`, `content`, `footnote`, `image` and `content_group`, and `MARKDOWN` for `table` and `definition_list`. Tree-construction helpers (`addNodeAfter`, `addNodeBefore`, type-change operations) SHALL populate the field at creation; no code path SHALL produce a content-bearing node with `format` undefined.

#### Scenario: addNodeAfter creates a content node with default format TEXT
- **WHEN** the user invokes `addNodeAfter` next to a `content` node
- **THEN** the new node has `format: 'TEXT'`

#### Scenario: changeNodeTypes preserves an allowed format and resets an incompatible one
- **WHEN** a `content` node with `format: 'MARKDOWN'` is converted to `heading`
- **THEN** the resulting `heading` node has `format: 'TEXT'` (the default), because `MARKDOWN` is not allowed on headings

#### Scenario: changeNodeTypes preserves a still-allowed format
- **WHEN** a `content` node with `format: 'NEWLINES'` is converted to `footnote`
- **THEN** the resulting `footnote` node retains `format: 'NEWLINES'`

#### Scenario: Converting to a table yields the MARKDOWN default
- **WHEN** a `content` node with `format: 'TEXT'` is converted to `table`
- **THEN** the resulting `table` node has `format: 'MARKDOWN'`

#### Scenario: Wrapping into a content group yields the TEXT default
- **WHEN** a `content` node is wrapped into a `content_group`
- **THEN** the new `content_group` has `format: 'TEXT'`

### Requirement: User can change a node's format from the floating toolbar
When the selection is exactly one content-bearing node **other than `image` or `content_group`**, the system SHALL display a format selector in the `FloatingToolbar` populated only with formats from `ALLOWED_FORMATS[node.type]`. Choosing a value SHALL invoke `useTreeOperations.changeNodeFormat(id, format)`, which commits a single history entry. The selector SHALL NOT appear when the selection is empty, multiple, or a container-only node.

Although `ALLOWED_FORMATS.image` permits `TEXT` and `NEWLINES` at the data-model level (validation and import), the UI does not offer a format selector for image nodes — an image keeps the format assigned at import or creation. A `content_group`'s format exists only for wire fidelity, so it is likewise never offered.

#### Scenario: Selector lists only allowed formats for the selected type
- **WHEN** a single `heading` node is selected
- **THEN** the format selector offers exactly `TEXT`, `NEWLINES`, `MARKDOWN_MINIMAL` and no other values

#### Scenario: Selector is hidden for container-only selection
- **WHEN** a single `list` node is selected
- **THEN** no format selector is rendered

#### Scenario: Selector is hidden for multi-selection
- **WHEN** two or more nodes are selected
- **THEN** no format selector is rendered

#### Scenario: Selector is hidden for a selected image node
- **WHEN** a single `image` node is selected
- **THEN** no format selector is rendered, even though `image` is content-bearing and has a non-empty allow-list

#### Scenario: Selector is hidden for a selected content group
- **WHEN** a single `content_group` node is selected
- **THEN** no format selector is rendered

#### Scenario: Selector offers only MARKDOWN for a table
- **WHEN** a single `table` or `definition_list` node is selected
- **THEN** the format selector offers exactly `MARKDOWN`

#### Scenario: Choosing a format commits one history entry
- **WHEN** the user changes the selected node's format from `TEXT` to `MARKDOWN`
- **THEN** the document state has the new `format` value and exactly one new entry has been added to the undo history; pressing undo restores `format: 'TEXT'` without altering `contents`

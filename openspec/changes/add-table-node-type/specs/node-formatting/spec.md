## MODIFIED Requirements

### Requirement: Every content-bearing node carries a required format field
The system SHALL require a `format: NodeFormat` field on every node whose type can hold `contents`
(`heading`, `content`, `footnote`, `image`, `content_group`, `table`). Container-only nodes
(`document`, `list`, `list_item`) SHALL NOT carry a format. `content_group` is the one type that is
structurally a container yet carries `contents`/`format`: the Demokratis envelope parser requires
the fields on every node outside its own container list, so a group without them is refused on
upload. `isValidNode` and `isValidDocument` SHALL reject any tree that violates these rules.

#### Scenario: Content node without format is invalid
- **WHEN** `isValidNode` is given a node of type `content` that has no `format` field
- **THEN** it returns `false`

#### Scenario: Container node with format is invalid
- **WHEN** `isValidNode` is given a node of type `list` that has a `format` field
- **THEN** it returns `false`

#### Scenario: Content group without format is invalid
- **WHEN** `isValidNode` is given a node of type `content_group` that has no `format` field
- **THEN** it returns `false`

#### Scenario: Table without format is invalid
- **WHEN** `isValidNode` is given a node of type `table` that has no `format` field
- **THEN** it returns `false`

#### Scenario: Heading with allowed format is valid
- **WHEN** `isValidNode` is given a `heading` node with `format: 'MARKDOWN_MINIMAL'`
- **THEN** it returns `true`

### Requirement: Per-type allowed-format restrictions are enforced
The system SHALL restrict each content-bearing node type to a fixed set of allowed formats and
SHALL expose `canHaveFormat(nodeType, format)` as the single source of truth used by validation,
the renderer, and the UI. The allow-lists SHALL mirror the format allow-list the Demokratis
platform applies when importing a DocTree envelope (`JsonEnvelopeV1Parser::allowedFormats()`), so
that no document StructEdit can produce is rejected by the platform on upload: `content` →
`TEXT|NEWLINES|MARKDOWN_INLINE|MARKDOWN`; `heading` → `TEXT|NEWLINES|MARKDOWN_MINIMAL`;
`footnote` → `TEXT|NEWLINES`; `image` → `TEXT|NEWLINES`; `content_group` → `TEXT|NEWLINES`;
`table` → `MARKDOWN`.

#### Scenario: Heading with MARKDOWN is rejected
- **WHEN** `isValidNode` is given a `heading` node with `format: 'MARKDOWN'`
- **THEN** it returns `false` because `MARKDOWN` is not in the heading allow-list

#### Scenario: Content node with MARKDOWN_INLINE is valid
- **WHEN** `isValidNode` is given a `content` node with `format: 'MARKDOWN_INLINE'`
- **THEN** it returns `true`

#### Scenario: Content node with MARKDOWN_MINIMAL is rejected
- **WHEN** `isValidNode` is given a `content` node with `format: 'MARKDOWN_MINIMAL'`
- **THEN** it returns `false`

#### Scenario: Footnote with MARKDOWN is rejected
- **WHEN** `isValidNode` is given a `footnote` node with `format: 'MARKDOWN'`
- **THEN** it returns `false`

#### Scenario: Table with a non-Markdown format is rejected
- **WHEN** `isValidNode` is given a `table` node with `format: 'TEXT'` or `'MARKDOWN_INLINE'`
- **THEN** it returns `false` — a structured block is always full Markdown

#### Scenario: A footnote converted from Markdown content falls back to the default
- **WHEN** a `content` node with `format: 'MARKDOWN_INLINE'` and contents `'see *this*'` is
  converted to `footnote`
- **THEN** the resulting node has `format: 'TEXT'` and contents still `'see *this*'` — the format
  is reset to the type's default, the source is untouched

#### Scenario: canHaveFormat reflects the allow-lists
- **WHEN** any consumer calls `canHaveFormat('image', 'MARKDOWN')`
- **THEN** it returns `false`, `canHaveFormat('content', 'MARKDOWN_INLINE')` returns `true`, and
  `canHaveFormat('table', 'MARKDOWN')` returns `true`

### Requirement: New nodes receive a sensible default format
The system SHALL assign each newly created content-bearing node a default format equal to `TEXT`
for `heading`, `content`, `footnote`, `image` and `content_group`, and `MARKDOWN` for `table` —
the only format a structured block may carry. Tree-construction helpers (`addNodeAfter`,
`addNodeBefore`, type-change operations) SHALL populate the field at creation; no code path SHALL
produce a content-bearing node with `format` undefined.

#### Scenario: addNodeAfter creates a content node with default format TEXT
- **WHEN** the user invokes `addNodeAfter` next to a `content` node
- **THEN** the new node has `format: 'TEXT'`

#### Scenario: changeNodeTypes preserves an allowed format and resets an incompatible one
- **WHEN** a `content` node with `format: 'MARKDOWN'` is converted to `heading`
- **THEN** the resulting `heading` node has `format: 'TEXT'` (the default), because `MARKDOWN` is
  not allowed on headings

#### Scenario: changeNodeTypes preserves a still-allowed format
- **WHEN** a `content` node with `format: 'NEWLINES'` is converted to `footnote`
- **THEN** the resulting `footnote` node retains `format: 'NEWLINES'`

#### Scenario: A node converted to a table becomes MARKDOWN
- **WHEN** a `content` node with `format: 'TEXT'` is converted to `table`
- **THEN** the resulting `table` node has `format: 'MARKDOWN'` and the same `contents`

### Requirement: User can change a node's format from the floating toolbar
When the selection is exactly one content-bearing node **other than `image`, `content_group` or
`table`**, the system SHALL display a format selector in the `FloatingToolbar` populated only with
formats from `ALLOWED_FORMATS[node.type]`. Choosing a value SHALL invoke
`useTreeOperations.changeNodeFormat(id, format)`, which commits a single history entry. The
selector SHALL NOT appear when the selection is empty, multiple, or a container-only node.

Although `ALLOWED_FORMATS` permits formats on `image`, `content_group` and `table` at the
data-model level (validation and import), the UI offers a format selector for none of them — an
image keeps the format assigned at import or creation, a group has no text whose formatting could
matter, and a table has exactly one legal format.

#### Scenario: Selector lists only allowed formats for the selected type
- **WHEN** a single `heading` node is selected
- **THEN** the format selector offers exactly `TEXT`, `NEWLINES`, `MARKDOWN_MINIMAL` and no other
  values

#### Scenario: Selector is hidden for container-only selection
- **WHEN** a single `list` node is selected
- **THEN** no format selector is rendered

#### Scenario: Selector is hidden for a selected content group
- **WHEN** a single `content_group` node is selected
- **THEN** no format selector is rendered, even though the group carries a `format` field

#### Scenario: Selector is hidden for a selected table
- **WHEN** a single `table` node is selected
- **THEN** no format selector is rendered — its allow-list has exactly one entry

#### Scenario: Selector is hidden for multi-selection
- **WHEN** two or more nodes are selected
- **THEN** no format selector is rendered

#### Scenario: Selector is hidden for a selected image node
- **WHEN** a single `image` node is selected
- **THEN** no format selector is rendered, even though `image` is content-bearing and has a
  non-empty allow-list

#### Scenario: Choosing a format commits one history entry
- **WHEN** the user changes the selected node's format from `TEXT` to `MARKDOWN`
- **THEN** the document state has the new `format` value and exactly one new entry has been added
  to the undo history; pressing undo restores `format: 'TEXT'` without altering `contents`

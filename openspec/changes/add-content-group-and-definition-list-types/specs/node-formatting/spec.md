## MODIFIED Requirements

### Requirement: Every content-bearing node carries a required format field
The system SHALL require a `format: NodeFormat` field on every node whose type can hold `contents` (`heading`, `content`, `footnote`, `image`, `definition_list`, `content_group`). Container-only nodes (`document`, `list`, `list_item`) SHALL NOT carry a format. `isValidNode` and `isValidDocument` SHALL reject any tree that violates these rules.

#### Scenario: Content node without format is invalid
- **WHEN** `isValidNode` is given a node of type `content` that has no `format` field
- **THEN** it returns `false`

#### Scenario: Container node with format is invalid
- **WHEN** `isValidNode` is given a node of type `list` that has a `format` field
- **THEN** it returns `false`

#### Scenario: Heading with allowed format is valid
- **WHEN** `isValidNode` is given a `heading` node with `format: 'MARKDOWN_MINIMAL'`
- **THEN** it returns `true`

### Requirement: Per-type allowed-format restrictions are enforced
The system SHALL restrict each content-bearing node type to a fixed set of allowed formats and SHALL expose `canHaveFormat(nodeType, format)` as the single source of truth used by validation, the renderer, and the UI. The allow-lists are: `content` → `TEXT|NEWLINES|MARKDOWN`; `heading` → `TEXT|NEWLINES|MARKDOWN_MINIMAL`; `footnote` → `TEXT|NEWLINES|MARKDOWN`; `image` → `TEXT|NEWLINES`; `definition_list` → `MARKDOWN`; `content_group` → `TEXT|NEWLINES`.

#### Scenario: Heading with MARKDOWN is rejected
- **WHEN** `isValidNode` is given a `heading` node with `format: 'MARKDOWN'`
- **THEN** it returns `false` because `MARKDOWN` is not in the heading allow-list

#### Scenario: Content node with MARKDOWN_MINIMAL is rejected
- **WHEN** `isValidNode` is given a `content` node with `format: 'MARKDOWN_MINIMAL'`
- **THEN** it returns `false`

#### Scenario: canHaveFormat reflects the allow-lists
- **WHEN** any consumer calls `canHaveFormat('image', 'MARKDOWN')`
- **THEN** it returns `false`, and `canHaveFormat('content', 'MARKDOWN')` returns `true`

### Requirement: New nodes receive a sensible default format
The system SHALL assign each newly created content-bearing node a default format equal to `TEXT` for `heading`, `content`, `footnote`, `image` and `content_group`, and `MARKDOWN` for `definition_list`. Tree-construction helpers (`addNodeAfter`, `addNodeBefore`, type-change operations) SHALL populate the field at creation; no code path SHALL produce a content-bearing node with `format` undefined.

#### Scenario: addNodeAfter creates a content node with default format TEXT
- **WHEN** the user invokes `addNodeAfter` next to a `content` node
- **THEN** the new node has `format: 'TEXT'`

#### Scenario: changeNodeTypes preserves an allowed format and resets an incompatible one
- **WHEN** a `content` node with `format: 'MARKDOWN'` is converted to `heading`
- **THEN** the resulting `heading` node has `format: 'TEXT'` (the default), because `MARKDOWN` is not allowed on headings

#### Scenario: changeNodeTypes preserves a still-allowed format
- **WHEN** a `content` node with `format: 'NEWLINES'` is converted to `footnote`
- **THEN** the resulting `footnote` node retains `format: 'NEWLINES'`

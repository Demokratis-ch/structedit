## ADDED Requirements

### Requirement: A number is offered only where the platform keeps one

The editor SHALL offer number editing only on node types whose number the Demokratis platform
stores and displays (`DocNodeType::hasNumber()`): `heading`, `content`, `footnote` and `list_item`
today, with every later node type declaring its own numbering in its own capability. A `list`
SHALL offer no number badge and no number editing, because the platform's envelope importer
creates no content row — the number's only home — for a list, and discards whatever the field
carries. The `number` field SHALL remain on every non-root node type, nullable, because the
envelope format requires it; a value already stored on a list SHALL be preserved and exported
verbatim rather than rewritten.

#### Scenario: A list row shows no number badge

- **WHEN** the tree pane renders a `list` node
- **THEN** no number badge and no number input are rendered for it, even when the node carries a
  stored `number`

#### Scenario: List items keep their number

- **WHEN** the tree pane renders a `list_item` node
- **THEN** it renders the editable number badge exactly as before

#### Scenario: Content-bearing types keep their number

- **WHEN** the tree pane renders a `heading`, `content` or `footnote` node
- **THEN** it renders the editable number badge exactly as before

#### Scenario: A stored list number is neither shown nor rewritten

- **WHEN** a document containing a `list` with `number: '3'` is opened and exported without edits
- **THEN** the exported list still carries `number: '3'`, and `isValidNode` still requires the
  field to be present

#### Scenario: Images stay unnumbered in the editor

- **WHEN** the tree pane renders an `image` node
- **THEN** no number badge is rendered — unchanged, and matching the platform, which offers no
  number on an image

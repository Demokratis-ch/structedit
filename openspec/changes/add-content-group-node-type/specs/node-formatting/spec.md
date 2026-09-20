## MODIFIED Requirements

### Requirement: Every content-bearing node carries a required format field
The system SHALL require a `format: NodeFormat` field on every node whose type can hold `contents`
(`heading`, `content`, `footnote`, `image`, `content_group`). Container-only nodes (`document`,
`list`, `list_item`) SHALL NOT carry a format. `content_group` is the one type that is structurally
a container yet carries `contents`/`format`: the Demokratis envelope parser requires the fields on
every node outside its own container list, so a group without them is refused on upload.
`isValidNode` and `isValidDocument` SHALL reject any tree that violates these rules.

#### Scenario: Content node without format is invalid
- **WHEN** `isValidNode` is given a node of type `content` that has no `format` field
- **THEN** it returns `false`

#### Scenario: Container node with format is invalid
- **WHEN** `isValidNode` is given a node of type `list` that has a `format` field
- **THEN** it returns `false`

#### Scenario: Content group without format is invalid
- **WHEN** `isValidNode` is given a node of type `content_group` that has no `format` field
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
`footnote` → `TEXT|NEWLINES`; `image` → `TEXT|NEWLINES`; `content_group` → `TEXT|NEWLINES`.

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

#### Scenario: Content group with a Markdown format is rejected
- **WHEN** `isValidNode` is given a `content_group` node with `format: 'MARKDOWN'`
- **THEN** it returns `false` — a group carries no text, and the platform allows it only
  `TEXT`/`NEWLINES`

#### Scenario: A footnote converted from Markdown content falls back to the default
- **WHEN** a `content` node with `format: 'MARKDOWN_INLINE'` and contents `'see *this*'` is
  converted to `footnote`
- **THEN** the resulting node has `format: 'TEXT'` and contents still `'see *this*'` — the format
  is reset to the type's default, the source is untouched

#### Scenario: canHaveFormat reflects the allow-lists
- **WHEN** any consumer calls `canHaveFormat('image', 'MARKDOWN')`
- **THEN** it returns `false`, `canHaveFormat('content', 'MARKDOWN_INLINE')` returns `true`, and
  `canHaveFormat('content_group', 'TEXT')` returns `true`

### Requirement: User can change a node's format from the floating toolbar
When the selection is exactly one content-bearing node **other than `image` or `content_group`**,
the system SHALL display a format selector in the `FloatingToolbar` populated only with formats
from `ALLOWED_FORMATS[node.type]`. Choosing a value SHALL invoke
`useTreeOperations.changeNodeFormat(id, format)`, which commits a single history entry. The
selector SHALL NOT appear when the selection is empty, multiple, or a container-only node.

Although `ALLOWED_FORMATS` permits `TEXT` and `NEWLINES` on `image` and `content_group` at the
data-model level (validation and import), the UI offers no format selector for either — an image
keeps the format assigned at import or creation, and a group has no text whose formatting could
matter.

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

### Requirement: Enter in edit mode never creates a sibling node
The system SHALL NOT create a sibling node when the user presses `Enter` while editing the contents of a node. Behaviour SHALL depend on the edited node's format:
- `TEXT` → `Enter` submits: edit mode exits, the node stays selected, and no character is inserted into the source
- `MARKDOWN_MINIMAL` → `Enter` submits identically (single-line format)
- `NEWLINES`, `MARKDOWN_INLINE`, `MARKDOWN` → `Enter` inserts a literal `\n` into the source at the cursor position

`Shift+Enter` SHALL behave identically to `Enter` for all formats.

`Cmd+Enter` (macOS) / `Ctrl+Enter` SHALL submit — exit edit mode keeping the node selected — for **all** formats, providing the explicit submit for the newline-capable formats where a bare `Enter` inserts a break.

`Enter` while a node is selected but NOT in edit mode SHALL enter edit mode on that node (text edit for content-bearing nodes; number edit for `list_item` and `content_group` containers — a group carries `contents` on the wire but holds no text, so the decision SHALL be made by node type, not by the presence of a `contents` field), collapsing the selection to it — it SHALL NOT create a sibling. A `list` offers nothing to edit (the platform keeps no number on a list, see the node-numbering spec), so `Enter` on a selected `list` SHALL open no edit mode. Sibling creation is available through the add-node buttons only.

#### Scenario: Enter in TEXT-format edit mode submits
- **WHEN** the user is editing a `content` node with `format: 'TEXT'` and presses `Enter`
- **THEN** no sibling node is created, no character is inserted into the source, edit mode exits with the node still selected, and `preventDefault` is called

#### Scenario: Enter in MARKDOWN_MINIMAL edit mode submits
- **WHEN** the user is editing a `heading` node with `format: 'MARKDOWN_MINIMAL'` and presses `Enter`
- **THEN** no sibling node is created, no character is inserted into the source, edit mode exits with the node still selected, and `preventDefault` is called

#### Scenario: Enter in NEWLINES edit mode inserts \n
- **WHEN** the user is editing a `content` node with `format: 'NEWLINES'` and presses `Enter` between two characters
- **THEN** a single `\n` is inserted at the cursor position in `contents[language]` and no sibling is created

#### Scenario: Enter in MARKDOWN edit mode inserts \n
- **WHEN** the user is editing a `content` node with `format: 'MARKDOWN'` and presses `Enter`
- **THEN** a `\n` is inserted at the cursor and no sibling is created

#### Scenario: Cmd/Ctrl+Enter submits any format
- **WHEN** the user is editing a `content` node with `format: 'MARKDOWN'` and presses `Cmd+Enter` (or `Ctrl+Enter`)
- **THEN** no `\n` is inserted, edit mode exits, and the node remains selected

#### Scenario: Enter on selected (non-editing) node enters edit mode
- **WHEN** a node is selected (not in edit mode) and the user presses `Enter`
- **THEN** no sibling is created; the selection collapses to the focused node and edit mode opens on it — text edit with the caret at the end for a content-bearing node, number edit for a `list_item` or `content_group` container

#### Scenario: Enter on a selected list opens nothing
- **WHEN** a `list` node is selected (not in edit mode) and the user presses `Enter`
- **THEN** no sibling is created and no edit mode — text or number — opens

#### Scenario: Enter on a selected content group opens number edit
- **WHEN** a `content_group` node is selected (not in edit mode) and the user presses `Enter`
- **THEN** number edit opens on the group; no text edit opens, even though the node carries a `contents` field

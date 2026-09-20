## MODIFIED Requirements

### Requirement: Per-type allowed-format restrictions are enforced
The system SHALL restrict each content-bearing node type to a fixed set of allowed formats and
SHALL expose `canHaveFormat(nodeType, format)` as the single source of truth used by validation,
the renderer, and the UI. The allow-lists SHALL mirror the format allow-list the Demokratis
platform applies when importing a DocTree envelope (`JsonEnvelopeV1Parser::allowedFormats()`), so
that no document StructEdit can produce is rejected by the platform on upload: `content` →
`TEXT|NEWLINES|MARKDOWN_INLINE|MARKDOWN`; `heading` → `TEXT|NEWLINES|MARKDOWN_MINIMAL`;
`footnote` → `TEXT|NEWLINES`; `image` → `TEXT|NEWLINES`.

#### Scenario: Heading with MARKDOWN is rejected
- **WHEN** `isValidNode` is given a `heading` node with `format: 'MARKDOWN'`
- **THEN** it returns `false` because `MARKDOWN` is not in the heading allow-list

#### Scenario: Content node with MARKDOWN_INLINE is valid
- **WHEN** `isValidNode` is given a `content` node with `format: 'MARKDOWN_INLINE'`
- **THEN** it returns `true` — the format the platform uses for captions and superscript-rewritten
  paragraphs is representable without folding it to block-level `MARKDOWN`

#### Scenario: Content node with MARKDOWN_MINIMAL is rejected
- **WHEN** `isValidNode` is given a `content` node with `format: 'MARKDOWN_MINIMAL'`
- **THEN** it returns `false`

#### Scenario: Footnote with MARKDOWN is rejected
- **WHEN** `isValidNode` is given a `footnote` node with `format: 'MARKDOWN'`
- **THEN** it returns `false` — the platform accepts only `TEXT` and `NEWLINES` on a footnote, and
  a document carrying one is refused in full on upload

#### Scenario: A footnote converted from Markdown content falls back to the default
- **WHEN** a `content` node with `format: 'MARKDOWN_INLINE'` and contents `'see *this*'` is
  converted to `footnote`
- **THEN** the resulting node has `format: 'TEXT'` and contents still `'see *this*'` — the format
  is reset to the type's default, the source is untouched

#### Scenario: canHaveFormat reflects the allow-lists
- **WHEN** any consumer calls `canHaveFormat('image', 'MARKDOWN')`
- **THEN** it returns `false`, `canHaveFormat('content', 'MARKDOWN_INLINE')` returns `true`, and
  `canHaveFormat('footnote', 'MARKDOWN')` returns `false`

### Requirement: Enter in edit mode never creates a sibling node
The system SHALL NOT create a sibling node when the user presses `Enter` while editing the contents of a node. Behaviour SHALL depend on the edited node's format:
- `TEXT` → `Enter` submits: edit mode exits, the node stays selected, and no character is inserted into the source
- `MARKDOWN_MINIMAL` → `Enter` submits identically (single-line format)
- `NEWLINES`, `MARKDOWN_INLINE`, `MARKDOWN` → `Enter` inserts a literal `\n` into the source at the cursor position

`Shift+Enter` SHALL behave identically to `Enter` for all formats.

`Cmd+Enter` (macOS) / `Ctrl+Enter` SHALL submit — exit edit mode keeping the node selected — for **all** formats, providing the explicit submit for the newline-capable formats where a bare `Enter` inserts a break.

`Enter` while a node is selected but NOT in edit mode SHALL enter edit mode on that node (text edit for content-bearing nodes; number edit for `list_item` containers), collapsing the selection to it — it SHALL NOT create a sibling. A `list` offers nothing to edit (the platform keeps no number on a list, see the node-numbering spec), so `Enter` on a selected `list` SHALL open no edit mode. Sibling creation is available through the add-node buttons only.

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
- **THEN** no sibling is created; the selection collapses to the focused node and edit mode opens on it — text edit with the caret at the end for a content-bearing node, number edit for a `list_item` container

#### Scenario: Enter on a selected list opens nothing
- **WHEN** a `list` node is selected (not in edit mode) and the user presses `Enter`
- **THEN** no sibling is created and no edit mode — text or number — opens

## ADDED Requirements

### Requirement: Importer assigns an inline-level format per node
`parseHtmlToTree` SHALL choose a per-node default format on import based on the source HTML, and
SHALL preserve inline marks (`<strong>/<b>`, `<em>/<i>`, `<s>/<strike>`, `<sup>`, `<sub>`) by
converting them to their Markdown equivalents when the chosen format permits them. When the
chosen format is `TEXT` or `NEWLINES`, the existing strip-everything behaviour SHALL apply.

The importer SHALL NOT assign a block-level format to prose: for `content` nodes it SHALL choose
`MARKDOWN_INLINE` — never `MARKDOWN` — when the source carries inline marks or a link, because the
importer flattens block tags before choosing and because a block-level node is remark-only once it
reaches the platform. A `content` node whose only mark is a `<br>` SHALL be `NEWLINES`, matching
the rule headings already follow. A `<br>` inside marked prose SHALL be encoded as a CommonMark
hard break (a backslash before the newline) under both Markdown levels, so that it renders as a
line break in StructEdit and in the platform's CommonMark converters alike — a bare `\n` is a
soft break on the platform and would be lost there. A `<br>` at the start or end of a fragment
SHALL be dropped, not encoded, since a trailing hard break renders as a literal backslash. The
importer creates no `footnote` nodes; the rule for footnotes is the allow-list, applied when a node
is converted to one.

#### Scenario: Plain heading imports as TEXT format
- **WHEN** `parseHtmlToTree('<h1>Intro</h1>')` runs
- **THEN** the resulting heading node has `format: 'TEXT'` and `contents` equal to `'Intro'`

#### Scenario: Heading with bold imports as MARKDOWN_MINIMAL
- **WHEN** `parseHtmlToTree('<h1>The <strong>big</strong> intro</h1>')` runs
- **THEN** the resulting heading node has `format: 'MARKDOWN_MINIMAL'` and `contents` equal to
  `'The **big** intro'`

#### Scenario: Heading with `<br>` only imports as NEWLINES
- **WHEN** `parseHtmlToTree('<h1>top<br>bottom</h1>')` runs
- **THEN** the resulting heading node has `format: 'NEWLINES'` (NOT `MARKDOWN_MINIMAL`, which is
  single-line) and `contents` equal to `'top\nbottom'`

#### Scenario: Heading with marks AND `<br>` imports as MARKDOWN_MINIMAL with the break dropped
- **WHEN** `parseHtmlToTree('<h1><strong>big</strong> top<br>bottom</h1>')` runs
- **THEN** the heading node has `format: 'MARKDOWN_MINIMAL'` and `contents` equal to
  `'**big** top bottom'` — the importer prefers preserving the marks and drops the line break
  (MARKDOWN_MINIMAL has no newline rule)

#### Scenario: Paragraph with inline marks imports as MARKDOWN_INLINE
- **WHEN** `parseHtmlToTree('<p>see <em>this</em> and <s>that</s></p>')` runs
- **THEN** the resulting `content` node has `format: 'MARKDOWN_INLINE'` and `contents` equal to
  `'see *this* and ~~that~~'` — the stored source is identical to what the old `MARKDOWN` choice
  produced; only the declared level changes

#### Scenario: Paragraph with a link imports as MARKDOWN_INLINE
- **WHEN** `parseHtmlToTree('<p>see <a href="https://example.org">this</a></p>')` runs
- **THEN** the resulting `content` node has `format: 'MARKDOWN_INLINE'` and `contents` equal to
  `'see [this](https://example.org)'`

#### Scenario: Paragraph with `<br>` only imports as NEWLINES
- **WHEN** `parseHtmlToTree('<p>top<br>bottom</p>')` runs
- **THEN** the resulting `content` node has `format: 'NEWLINES'` and `contents` equal to
  `'top\nbottom'`

#### Scenario: Paragraph with marks and a `<br>` keeps the break as a hard break
- **WHEN** `parseHtmlToTree('<p><em>top</em><br>bottom</p>')` runs
- **THEN** the resulting `content` node has `format: 'MARKDOWN_INLINE'` and `contents` equal to
  `'*top*\\\nbottom'` (a backslash, then the newline), and `renderContent` of that source
  contains a `<br>`

#### Scenario: A trailing `<br>` is dropped rather than encoded
- **WHEN** `parseHtmlToTree('<p><em>top</em><br></p>')` runs
- **THEN** the resulting `content` node has `contents` equal to `'*top*'` — no trailing backslash
  or newline

#### Scenario: Plain paragraph keeps TEXT format
- **WHEN** `parseHtmlToTree('<p>just words</p>')` runs
- **THEN** the resulting `content` node has `format: 'TEXT'` and `contents` equal to
  `'just words'`

#### Scenario: Image always imports as TEXT
- **WHEN** an image node is created during import
- **THEN** its `format` equals `'TEXT'`

### Requirement: Merging inline-level nodes keeps the boundary visible
When `mergeNodes` joins `content` or `footnote` nodes whose merged format is `MARKDOWN_INLINE`, the
system SHALL join their sources with a CommonMark hard break (a backslash before the newline), not
with a blank line: inline Markdown has no paragraphs, so a blank line renders as nothing on either
side. `MARKDOWN` merges SHALL keep using a blank line and `NEWLINES` merges a single `\n`.

#### Scenario: Two inline-level paragraphs merge with a visible break
- **WHEN** two `content` nodes with `format: 'MARKDOWN_INLINE'` and contents `'*a*'` and `'b'`
  are merged
- **THEN** the merged node has `format: 'MARKDOWN_INLINE'`, contents `'*a*\\\nb'`, and its
  rendered output contains a `<br>` between `a` and `b`

#### Scenario: A plain and an inline-level paragraph merge the same way
- **WHEN** a `content` node with `format: 'TEXT'` is merged with one with
  `format: 'MARKDOWN_INLINE'`
- **THEN** the merged node is `MARKDOWN_INLINE` and the sources are joined with the hard break

#### Scenario: Block-level merges are unchanged
- **WHEN** two `content` nodes with `format: 'MARKDOWN'` are merged
- **THEN** their sources are joined with a blank line, as before

### Requirement: Stored documents migrate when an allow-list narrows
Narrowing a format allow-list SHALL NOT strand documents already persisted in IndexedDB. The
storage migration chain SHALL rewrite any node whose stored format is no longer allowed for its
type to the closest still-allowed format, and SHALL NOT alter the node's `contents`. Entries
SHALL remain usable in the recents picker rather than degrading to incompatible rows.

#### Scenario: A stored MARKDOWN footnote migrates to NEWLINES
- **WHEN** an entry persisted under schema v2 contains a `FOOTNOTE` node with
  `format: 'MARKDOWN'` and it is read back
- **THEN** the migrated entry is usable, that node's `format` is `'NEWLINES'`, and its `contents`
  are byte-for-byte what was stored

#### Scenario: Migration never edits content
- **WHEN** the footnote's stored source contains Markdown delimiters such as `'see *this*'`
- **THEN** the migrated node still holds `'see *this*'`; the delimiters render as literal
  characters under `NEWLINES` and are left for the user to remove

#### Scenario: A stored MARKDOWN content node is untouched
- **WHEN** the same entry also contains a `CONTENT` node with `format: 'MARKDOWN'`
- **THEN** that node keeps `format: 'MARKDOWN'`, which is still allowed for `content`

#### Scenario: The whole chain runs for the oldest entries
- **WHEN** an entry persisted under schema v1 (lowercase node types) is read back
- **THEN** it is migrated through every step to the current schema version and is usable

## REMOVED Requirements

### Requirement: Importer assigns format per node and preserves inline formatting when allowed

**Reason**: Replaced by "Importer assigns an inline-level format per node" above. The rule it
stated — elevate any marked `content` or `footnote` to `MARKDOWN` — is the rule this change
removes, so the requirement is restated under a name that says what the importer now does.

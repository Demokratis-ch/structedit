# node-formatting Specification

## Purpose
TBD - created by archiving change add-per-node-formatting-mode. Update Purpose after archive.
## Requirements
### Requirement: Format levels are defined and uniquely identified
The system SHALL define exactly five formatting levels — `TEXT`, `NEWLINES`, `MARKDOWN_MINIMAL`, `MARKDOWN_INLINE`, `MARKDOWN` — exposed as a `NodeFormat` string-literal union with `SCREAMING_SNAKE_CASE` values matching the Demokratis platform spec. Each level SHALL have a deterministic rendering contract (newline handling and allowed inline/block elements) used by every consumer.

#### Scenario: NodeFormat union exposes all five levels
- **WHEN** the type definitions are loaded
- **THEN** `NodeFormat` resolves to the union `'TEXT' | 'NEWLINES' | 'MARKDOWN_MINIMAL' | 'MARKDOWN_INLINE' | 'MARKDOWN'` and no other values are accepted

#### Scenario: Each level has a documented rendering contract
- **WHEN** the renderer is asked to render a string under any level
- **THEN** it follows the per-level contract: `TEXT` strips newlines and escapes; `NEWLINES` escapes and converts `\n` to `<br>`; `MARKDOWN_MINIMAL` is single-line and supports only bold/italic/strike/sup/sub (newlines are collapsed to a space, never preserved as `<br>`); `MARKDOWN_INLINE` supports CommonMark inline plus strike/sup/sub with no block elements **and no bare HTML**; `MARKDOWN` supports full CommonMark + GFM (paragraphs, lists, tables, strikethrough, autolinks) **with bare HTML disabled — raw `<tag>…</tag>` in source is dropped, not rendered**, and renders a single `\n` as a `<br>` line break (`marked` runs with `breaks: true` for MARKDOWN)

### Requirement: Every content-bearing node carries a required format field
The system SHALL require a `format: NodeFormat` field on every node whose type can hold `contents` (`heading`, `content`, `footnote`, `image`). Container-only nodes (`document`, `list`, `list_item`) SHALL NOT carry a format. `isValidNode` and `isValidDocument` SHALL reject any tree that violates these rules.

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
The system SHALL restrict each content-bearing node type to a fixed set of allowed formats and SHALL expose `canHaveFormat(nodeType, format)` as the single source of truth used by validation, the renderer, and the UI. The allow-lists are: `content` → `TEXT|NEWLINES|MARKDOWN`; `heading` → `TEXT|NEWLINES|MARKDOWN_MINIMAL`; `footnote` → `TEXT|NEWLINES|MARKDOWN`; `image` → `TEXT|NEWLINES`.

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
The system SHALL assign each newly created content-bearing node a default format equal to `TEXT` for `heading`, `content`, `footnote`, and `image`. Tree-construction helpers (`addNodeAfter`, `addNodeBefore`, type-change operations) SHALL populate the field at creation; no code path SHALL produce a content-bearing node with `format` undefined.

#### Scenario: addNodeAfter creates a content node with default format TEXT
- **WHEN** the user invokes `addNodeAfter` next to a `content` node
- **THEN** the new node has `format: 'TEXT'`

#### Scenario: changeNodeTypes preserves an allowed format and resets an incompatible one
- **WHEN** a `content` node with `format: 'MARKDOWN'` is converted to `heading`
- **THEN** the resulting `heading` node has `format: 'TEXT'` (the default), because `MARKDOWN` is not allowed on headings

#### Scenario: changeNodeTypes preserves a still-allowed format
- **WHEN** a `content` node with `format: 'NEWLINES'` is converted to `footnote`
- **THEN** the resulting `footnote` node retains `format: 'NEWLINES'`

### Requirement: Renderer produces deterministic, sanitized HTML per format
The system SHALL provide a pure function `renderContent(raw: string, format: NodeFormat): string` whose output is sanitized HTML safe to set via `dangerouslySetInnerHTML`. Output SHALL match the per-format contract from the first requirement and SHALL be free of `<script>`, event handlers, or any other XSS vector.

#### Scenario: TEXT format escapes HTML and strips newlines
- **WHEN** `renderContent('a <b>x</b>\nb', 'TEXT')` is called
- **THEN** the output equals `'a &lt;b&gt;x&lt;/b&gt; b'` (newline collapsed to a space, angle brackets escaped)

#### Scenario: NEWLINES format converts \n to <br>
- **WHEN** `renderContent('line1\nline2', 'NEWLINES')` is called
- **THEN** the output equals `'line1<br>line2'` and any HTML in `raw` is escaped

#### Scenario: MARKDOWN_MINIMAL renders only the five permitted marks
- **WHEN** `renderContent('**a** *b* ~~c~~ ^d^ ~e~ [link](x)', 'MARKDOWN_MINIMAL')` is called
- **THEN** the output contains `<strong>a</strong>`, `<em>b</em>`, `<s>c</s>` (or `<del>`), `<sup>d</sup>`, `<sub>e</sub>` and the literal text `[link](x)` (no anchor tag)

#### Scenario: MARKDOWN_MINIMAL collapses newlines (single-line per platform spec)
- **WHEN** `renderContent('first\nsecond', 'MARKDOWN_MINIMAL')` is called
- **THEN** the output contains no `<br>` and equals `'first second'` (the newline is collapsed to a space, since MARKDOWN_MINIMAL is a single-line inline-only format)

#### Scenario: MARKDOWN_INLINE forbids block elements
- **WHEN** `renderContent('# heading\n\npara', 'MARKDOWN_INLINE')` is called
- **THEN** the output contains no `<h1>`, `<p>`, `<ul>`, `<ol>`, or `<table>` tags; the markdown source is rendered as inline text

#### Scenario: MARKDOWN renders full CommonMark
- **WHEN** `renderContent('- a\n- b', 'MARKDOWN')` is called
- **THEN** the output contains `<ul>` with two `<li>` children

#### Scenario: MARKDOWN renders a single newline as a line break
- **WHEN** `renderContent('line one\nline two', 'MARKDOWN')` is called
- **THEN** the output contains a `<br>` between the lines (a single `\n` is a hard break — `marked` runs with `breaks: true`, so the editing view's literal newlines survive into the rendered preview)

#### Scenario: MARKDOWN does not render bare block HTML
- **WHEN** `renderContent('<div>raw</div>', 'MARKDOWN')` is called
- **THEN** the output contains no `<div>` element

#### Scenario: MARKDOWN does not render bare inline HTML
- **WHEN** `renderContent('hello <span class="x">there</span>', 'MARKDOWN')` is called
- **THEN** the output contains no `<span>` element; surrounding prose still renders

#### Scenario: MARKDOWN does not render bare HTML even for tags in the allow-list
- **WHEN** `renderContent('<strong>raw</strong>', 'MARKDOWN')` is called
- **THEN** the output contains no `<strong>` element — the source had to be `**raw**` to render bold; raw tags are stripped regardless of whether DOMPurify would otherwise allow them

#### Scenario: MARKDOWN_INLINE does not render bare HTML
- **WHEN** `renderContent('see <em>this</em>', 'MARKDOWN_INLINE')` is called
- **THEN** the output contains no `<em>` element produced by the raw tag — Markdown `*…*` is the only path to inline emphasis

#### Scenario: All formats sanitize XSS
- **WHEN** `renderContent('<img src=x onerror=alert(1)>', format)` is called for any format
- **THEN** the output contains no `onerror` attribute and no executable JavaScript

### Requirement: Editor stores Markdown source, not rendered HTML
When a node's format is `TEXT`, `NEWLINES`, `MARKDOWN_MINIMAL`, `MARKDOWN_INLINE`, or `MARKDOWN`, the system SHALL persist the user-typed source string in `contents[language]` and SHALL render it via `renderContent` only for non-editing display. Switching format SHALL NOT alter the stored source.

#### Scenario: Editing markdown shows raw source
- **WHEN** the user enters edit mode on a `content` node with `format: 'MARKDOWN'` whose stored content is `'**bold**'`
- **THEN** the editable surface shows the literal characters `**bold**`, not a bolded word

#### Scenario: Format switch is non-destructive
- **WHEN** a node's content is `'**hi**'` under `format: 'TEXT'` and the user switches it to `format: 'MARKDOWN'`
- **THEN** the stored content is still `'**hi**'`, and the rendered output now shows `<strong>hi</strong>`

#### Scenario: Switching back restores prior render
- **WHEN** the user toggles a node from `TEXT` → `MARKDOWN` → `TEXT`
- **THEN** the stored content is unchanged and the rendered output again shows `'**hi**'` literally

### Requirement: Enter in edit mode never creates a sibling node
The system SHALL NOT create a sibling node when the user presses `Enter` while editing the contents of a node. Behaviour SHALL depend on the edited node's format:
- `TEXT` → `Enter` is intercepted and ignored (no newline inserted, no sibling created)
- `MARKDOWN_MINIMAL` → `Enter` is intercepted and ignored (single-line format)
- `NEWLINES`, `MARKDOWN_INLINE`, `MARKDOWN` → `Enter` inserts a literal `\n` into the source at the cursor position

`Shift+Enter` SHALL behave identically to `Enter` for all formats.

`Enter` while a node is selected but NOT in edit mode SHALL continue to create a sibling node via `addNodeAfter` — the existing global handler is unchanged.

#### Scenario: Enter in TEXT-format edit mode does nothing
- **WHEN** the user is editing a `content` node with `format: 'TEXT'` and presses `Enter`
- **THEN** no sibling node is created, no character is inserted into the source, and `preventDefault` is called

#### Scenario: Enter in MARKDOWN_MINIMAL edit mode does nothing
- **WHEN** the user is editing a `heading` node with `format: 'MARKDOWN_MINIMAL'` and presses `Enter`
- **THEN** no sibling node is created, no character is inserted into the source, and `preventDefault` is called

#### Scenario: Enter in NEWLINES edit mode inserts \n
- **WHEN** the user is editing a `content` node with `format: 'NEWLINES'` and presses `Enter` between two characters
- **THEN** a single `\n` is inserted at the cursor position in `contents[language]` and no sibling is created

#### Scenario: Enter in MARKDOWN edit mode inserts \n
- **WHEN** the user is editing a `content` node with `format: 'MARKDOWN'` and presses `Enter`
- **THEN** a `\n` is inserted at the cursor and no sibling is created

#### Scenario: Enter on selected (non-editing) node still creates sibling
- **WHEN** a node is selected (not in edit mode) and the user presses `Enter`
- **THEN** the existing behaviour applies: `addNodeAfter` creates a new sibling

### Requirement: User can change a node's format from the floating toolbar
When the selection is exactly one content-bearing node, the system SHALL display a format selector in the `FloatingToolbar` populated only with formats from `ALLOWED_FORMATS[node.type]`. Choosing a value SHALL invoke `useTreeOperations.changeNodeFormat(id, format)`, which commits a single history entry. The selector SHALL NOT appear when the selection is empty, multiple, or a container-only node.

#### Scenario: Selector lists only allowed formats for the selected type
- **WHEN** a single `heading` node is selected
- **THEN** the format selector offers exactly `TEXT`, `NEWLINES`, `MARKDOWN_MINIMAL` and no other values

#### Scenario: Selector is hidden for container-only selection
- **WHEN** a single `list` node is selected
- **THEN** no format selector is rendered

#### Scenario: Selector is hidden for multi-selection
- **WHEN** two or more nodes are selected
- **THEN** no format selector is rendered

#### Scenario: Choosing a format commits one history entry
- **WHEN** the user changes the selected node's format from `TEXT` to `MARKDOWN`
- **THEN** the document state has the new `format` value and exactly one new entry has been added to the undo history; pressing undo restores `format: 'TEXT'` without altering `contents`

### Requirement: Importer assigns format per node and preserves inline formatting when allowed
`parseHtmlToTree` SHALL choose a per-node default format on import based on the source HTML, and SHALL preserve inline marks (`<strong>/<b>`, `<em>/<i>`, `<s>/<strike>`, `<sup>`, `<sub>`) by converting them to their Markdown equivalents when the chosen format permits them. When the chosen format is `TEXT`, the existing strip-everything behaviour SHALL apply.

#### Scenario: Plain heading imports as TEXT format
- **WHEN** `parseHtmlToTree('<h1>Intro</h1>')` runs
- **THEN** the resulting heading node has `format: 'TEXT'` and `contents` equal to `'Intro'`

#### Scenario: Heading with bold imports as MARKDOWN_MINIMAL
- **WHEN** `parseHtmlToTree('<h1>The <strong>big</strong> intro</h1>')` runs
- **THEN** the resulting heading node has `format: 'MARKDOWN_MINIMAL'` and `contents` equal to `'The **big** intro'`

#### Scenario: Heading with `<br>` only imports as NEWLINES
- **WHEN** `parseHtmlToTree('<h1>top<br>bottom</h1>')` runs
- **THEN** the resulting heading node has `format: 'NEWLINES'` (NOT `MARKDOWN_MINIMAL`, which is single-line) and `contents` equal to `'top\nbottom'`

#### Scenario: Heading with marks AND `<br>` imports as MARKDOWN_MINIMAL with the break dropped
- **WHEN** `parseHtmlToTree('<h1><strong>big</strong> top<br>bottom</h1>')` runs
- **THEN** the heading node has `format: 'MARKDOWN_MINIMAL'` and `contents` equal to `'**big** top bottom'` — the importer prefers preserving the marks and drops the line break (MARKDOWN_MINIMAL has no newline rule)

#### Scenario: Paragraph with inline marks imports as MARKDOWN
- **WHEN** `parseHtmlToTree('<p>see <em>this</em> and <s>that</s></p>')` runs
- **THEN** the resulting `content` node has `format: 'MARKDOWN'` and `contents` equal to `'see *this* and ~~that~~'`

#### Scenario: Plain paragraph keeps TEXT format
- **WHEN** `parseHtmlToTree('<p>just words</p>')` runs
- **THEN** the resulting `content` node has `format: 'TEXT'` and `contents` equal to `'just words'`

#### Scenario: Image always imports as TEXT
- **WHEN** an image node is created during import
- **THEN** its `format` equals `'TEXT'`


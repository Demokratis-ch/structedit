## ADDED Requirements

### Requirement: The document model defines a TABLE node

The system SHALL define a `TABLE` node type representing a tabular block as the Demokratis
document model does: a leaf node carrying `id`, `number`, `contents` and `format`, with no
`children` field. Its content SHALL be a GFM pipe table stored as text, and `MARKDOWN` SHALL be
its only allowed format — the platform's structured-block rule
(`DocNodeType::isStructuredBlock()`).

#### Scenario: A well-formed table validates

- **WHEN** `isValidNode` is given a `TABLE` with `contents` holding a pipe table and
  `format: 'MARKDOWN'`
- **THEN** it returns `true`

#### Scenario: A table with children is invalid

- **WHEN** `isValidNode` is given a `TABLE` that carries a `children` field
- **THEN** it returns `false` — the platform allows a table no child types, so the JSON form is a
  leaf

#### Scenario: A table with a non-Markdown format is invalid

- **WHEN** `isValidNode` is given a `TABLE` with `format: 'TEXT'`
- **THEN** it returns `false`

#### Scenario: Placement follows the platform's child rules

- **WHEN** a `TABLE` appears under `DOCUMENT`, `HEADING` or `LIST_ITEM`
- **THEN** validation accepts it; under `CONTENT_GROUP` or `CONTENT` it is rejected

### Requirement: HTML and DOCX tables import as TABLE nodes

`parseHtmlToTree` SHALL preserve tables instead of stripping them: the sanitizer SHALL allow the
table tags, and each `<table>` SHALL produce exactly one `TABLE` node whose content is the
equivalent GFM pipe table. Because Mammoth converts Word tables to HTML tables, this SHALL apply
to DOCX uploads without a separate code path. Table text SHALL NOT leak into surrounding
paragraphs.

#### Scenario: A simple HTML table becomes one node

- **WHEN** `parseHtmlToTree` runs over
  `<table><tr><th>Phase</th><th>U/min</th></tr><tr><td>Andämpfen</td><td>20</td></tr></table>`
- **THEN** the tree contains exactly one `TABLE` node, with `format: 'MARKDOWN'` and content whose
  first line is the header row, second line the delimiter row, and third line the data row

#### Scenario: A Word table survives the DOCX pipeline

- **WHEN** a DOCX fixture from `src/test/fixtures/realistic/docx/with_table/` is imported
- **THEN** each Word table appears as one `TABLE` node with the source's row and column counts,
  and none of its cell text appears as loose `CONTENT` nodes

#### Scenario: Cell formatting is preserved as inline Markdown

- **WHEN** a cell contains `<strong>20</strong>` or a link
- **THEN** the corresponding cell in the pipe table holds `**20**` or `[label](href)`

#### Scenario: A pipe inside cell text is escaped

- **WHEN** a cell's text contains a `|` character
- **THEN** the emitted cell contains `\|`, so the platform's parser reads one cell and not two

#### Scenario: A line break inside a cell collapses

- **WHEN** a cell contains `a<br>b`
- **THEN** the emitted cell holds `a b` — a pipe-table row is a single line

#### Scenario: Ragged rows are padded

- **WHEN** one row has three cells and another has two
- **THEN** every emitted row has three cells, the missing ones empty

#### Scenario: Merged cells keep the grid rectangular

- **WHEN** a cell carries `colspan="2"` or `rowspan="2"`
- **THEN** its text is emitted in the first position it covers and the remaining covered positions
  are emitted as empty cells, so every row has the same number of cells

#### Scenario: A nested table is flattened into its cell

- **WHEN** a `<td>` contains another `<table>`
- **THEN** the inner table's cell texts are joined into the containing cell's text and no second
  `TABLE` node is produced

#### Scenario: A caption becomes a content node before the table

- **WHEN** a table carries `<caption>Tabelle 1: Gebühren</caption>`
- **THEN** a `CONTENT` node holding that text is emitted immediately before the `TABLE` node

#### Scenario: An empty table produces nothing

- **WHEN** a `<table>` contains no rows
- **THEN** no `TABLE` node is created

### Requirement: Imported tables always carry a header row

Because neither GFM nor the platform's renderer has a header-less table — and the platform's own
table editor emits the delimiter row after row 0 unconditionally (`blockSerializers.table`) — the
importer SHALL emit the delimiter row in the second line of every table it produces. A source table whose header is
declared (`<thead>`, or a first row of `<th>`) SHALL use that row; a source table with neither
SHALL have its first row promoted to the header.

#### Scenario: A declared header is used

- **WHEN** the source table has a `<thead>` row
- **THEN** that row is the pipe table's first line and the delimiter row is its second

#### Scenario: A header-less table promotes its first row

- **WHEN** the source table has no `<thead>` and no `<th>` cells
- **THEN** its first data row becomes the header row, with the delimiter row beneath it, and no
  row is lost

#### Scenario: The result is grid-readable on the platform

- **WHEN** any table this importer produces is read by the platform's table parser
- **THEN** the delimiter row is in position 2, so the table is reported as having a header and
  stays editable as a grid rather than falling back to a plain textarea

### Requirement: Tables render as tables in the preview

The rendered preview SHALL render a `TABLE` node's content as an HTML table inside a horizontally
scrollable container, matching the platform's presentation. The node's number SHALL NOT be
rendered as a badge, mirroring `DocNodeType::hasNumber()`, which excludes `TABLE`.

#### Scenario: A table node renders a table element

- **WHEN** the preview renders a `TABLE` node whose content is a two-column, three-row pipe table
- **THEN** the output contains a `<table>` with the header cells and one row per data row

#### Scenario: Wide tables scroll instead of overflowing

- **WHEN** a table is wider than the preview pane
- **THEN** it is rendered inside a horizontally scrollable container rather than overflowing the
  layout

#### Scenario: No number badge is rendered

- **WHEN** the preview renders a `TABLE` node that carries a `number`
- **THEN** no number badge appears, and the stored `number` is unchanged

### Requirement: Table content is edited as its Markdown source

The editor SHALL edit a `TABLE` node as the raw pipe-table Markdown, under the existing `MARKDOWN`
editing rules (`Enter` inserts a newline; `Cmd/Ctrl+Enter` submits). The type selector SHALL be
able to convert between `CONTENT` and `TABLE`, carrying the text across and coercing the format to
the target type's default. The editor SHALL NOT offer number editing for a table.

#### Scenario: Editing shows the pipe table

- **WHEN** the user enters edit mode on a `TABLE` node
- **THEN** the editable surface shows the literal pipe-table source, one line per row

#### Scenario: Converting a content node to a table carries the text

- **WHEN** the user converts a `CONTENT` node with `format: 'TEXT'` to `TABLE`
- **THEN** the resulting node has `format: 'MARKDOWN'` and the same `contents` string

#### Scenario: Conversion is refused where a table cannot live

- **WHEN** the user attempts to convert a `CONTENT` node inside a `CONTENT_GROUP` to `TABLE`
- **THEN** the conversion is refused and the document is unchanged

### Requirement: Legal transforms leave tables alone

The Swiss-legal transform pipeline SHALL NOT reinterpret the contents of a `TABLE` node. Patterns
that promote prose to headings or rewrite list numbering SHALL skip table nodes entirely.

#### Scenario: A cell that looks like an article heading stays in the table

- **WHEN** a table's first cell reads `Art. 5` and the transform pipeline runs
- **THEN** the `TABLE` node is unchanged and no `HEADING` node is created from its content

#### Scenario: A cell that looks like a list marker stays in the table

- **WHEN** a table cell reads `a.` and the transform pipeline runs
- **THEN** no list restructuring is applied to the table node

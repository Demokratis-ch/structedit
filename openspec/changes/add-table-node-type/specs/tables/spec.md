## ADDED Requirements

### Requirement: TABLE is a leaf
A `TABLE` SHALL carry `id`, `number` and `contents` and no `children`, and SHALL be allowed under `DOCUMENT`, `HEADING` and `LIST_ITEM` only.

#### Scenario: Shape and placement
- **WHEN** a `TABLE` has `children` or a `CONTENT`/`LIST` parent
- **THEN** it is invalid

### Requirement: Converting to a table
Converting a `HEADING`, `CONTENT` or `FOOTNOTE` to `TABLE` (toolbar `Table (B)`, key `b`) SHALL replace it in place, keeping `id`, `number` and `contents`, and lift its children as following siblings. It SHALL be refused for `LIST`/`LIST_ITEM` and where the parent can't hold a `TABLE`.

#### Scenario: Content becomes a table
- **WHEN** a `CONTENT` with a `FOOTNOTE` child is converted to `TABLE`
- **THEN** a `TABLE` with the same `id`, `number` and `contents` stands in its place, followed by the footnote

### Requirement: Preview renders tables
The Preview SHALL render a `TABLE` after its number, scrolling horizontally when wider than the Preview.

#### Scenario: Pipe table
- **WHEN** a `TABLE` with a pipe table is previewed
- **THEN** an HTML `<table>` renders after the number

### Requirement: Platform exports with tables round-trip
A platform DocTree envelope containing a `TABLE` SHALL open, and exporting it unedited SHALL yield an identical `document`.

#### Scenario: Export round-trips
- **WHEN** a platform export with a table is opened and exported without edits
- **THEN** the exported `document` deep-equals the input

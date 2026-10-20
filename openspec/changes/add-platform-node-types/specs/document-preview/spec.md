# Spec Delta

## Purpose

Describes how the rendered Preview pane lays out node types: where numbers are placed, and how tables and definition lists are rendered from their Markdown source.

## ADDED Requirements

### Requirement: A content group's number renders inline with its first paragraph
The Preview SHALL render a `CONTENT_GROUP` as its children in order. When the group's first child is a `CONTENT`, the group's `number` SHALL be rendered inline before that child's text in place of the child's own (absent) number; otherwise the number SHALL be rendered on its own line above the children. A group's `contents` SHALL NOT be rendered.

#### Scenario: Number precedes the first paragraph
- **WHEN** a `CONTENT_GROUP` with `number: '2'` whose first child is a `CONTENT` reading `Der Bund…` is previewed
- **THEN** the paragraph renders as `2 Der Bund…` with the number inside the paragraph

#### Scenario: Number stands above when the first child is a list
- **WHEN** a `CONTENT_GROUP` with `number: '3'` whose first child is a `LIST` is previewed
- **THEN** `3` renders on its own line before the list

#### Scenario: Group contents are not rendered
- **WHEN** a `CONTENT_GROUP` whose `contents` is `{ de: 'hidden' }` is previewed
- **THEN** the text `hidden` does not appear

### Requirement: Tables render as HTML tables
The Preview SHALL render a `TABLE` node's `MARKDOWN` source through the Markdown renderer inside a horizontally scrollable block, so a GFM pipe table appears as a `<table>` with header and body cells.

#### Scenario: Pipe table renders as a table element
- **WHEN** a `TABLE` with contents `| a | b |\n| - | - |\n| 1 | 2 |` is previewed
- **THEN** a `<table>` with a header cell `a` and a body cell `2` is rendered

#### Scenario: Table number renders before the table
- **WHEN** a `TABLE` with `number: 'Tab. 1'` is previewed
- **THEN** `Tab. 1` is rendered before the table

### Requirement: Definition lists render as term/value pairs
The Preview SHALL parse a `DEFINITION_LIST` node's source line by line using the platform's separator rule — `::` surrounded by whitespace or a line boundary, split at the first separator, both sides non-empty — and render the pairs as a `<dl>` of `<dt>`/`<dd>` with inline Markdown. When any non-empty line is not a pair, the whole source SHALL fall back to the `MARKDOWN` block renderer.

#### Scenario: Well-formed lines render as a definition list
- **WHEN** a `DEFINITION_LIST` with contents `Bund :: Die Schweizerische Eidgenossenschaft\nKanton :: Ein Gliedstaat` is previewed
- **THEN** a `<dl>` with two `<dt>`/`<dd>` pairs is rendered, the first term reading `Bund`

#### Scenario: Inline Markdown inside a term or value renders
- **WHEN** a line reads `**Bund** :: Der *Staat*`
- **THEN** the term renders bold and the value's `Staat` renders in italics

#### Scenario: A separator without whitespace is plain text
- **WHEN** the only line reads `A::B`
- **THEN** no `<dl>` is rendered and the text `A::B` appears as Markdown output

#### Scenario: A line without a pair falls back to Markdown
- **WHEN** the contents are `Bund :: Staat\nkein Paar`
- **THEN** no `<dl>` is rendered and both lines appear as Markdown output

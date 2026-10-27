## ADDED Requirements

### Requirement: Converting to a definition list
Converting a `HEADING`, `CONTENT` or `FOOTNOTE` to `DEFINITION_LIST` (toolbar `Definition List (D)`, key `d`) SHALL replace it in place, keeping `id`, `number` and `contents`, and lift its children as following siblings. It SHALL be refused for `LIST`/`LIST_ITEM` and where the parent can't hold a `DEFINITION_LIST`.

#### Scenario: Content becomes a definition list
- **WHEN** a `CONTENT` with a `FOOTNOTE` child is converted to `DEFINITION_LIST`
- **THEN** a `DEFINITION_LIST` with the same `id`, `number` and `contents` stands in its place, followed by the footnote

### Requirement: MARKDOWN renders definition lists
MARKDOWN content SHALL render each paragraph whose every line holds a ` :: ` separator (whitespace on both sides) in plain text, with content on both sides, as a `<dl>`: one `dt`/`dd` pair per line, split at the first separator, as the platform's `DefinitionListProcessor` does. Other paragraphs SHALL render as before. This applies in the tree and the Preview, where a `DEFINITION_LIST` follows its number.

#### Scenario: Pairs
- **WHEN** a `DEFINITION_LIST` with `Bund :: Eidgenossenschaft` is previewed
- **THEN** a `<dl>` renders after the number with `Bund` as `dt` and `Eidgenossenschaft` as `dd`

#### Scenario: Not all pairs
- **WHEN** a paragraph has a line without separator, or the separator sits in code or emphasis
- **THEN** the paragraph renders as Markdown

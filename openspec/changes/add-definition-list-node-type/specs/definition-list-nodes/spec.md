## ADDED Requirements

### Requirement: The document model defines a DEFINITION_LIST node

The system SHALL define a `DEFINITION_LIST` node type representing term/value pairs as the
Demokratis document model does: a leaf node carrying `id`, `number`, `contents` and `format`, with
no `children` field, whose content is one `Term :: Value` line per pair and whose only allowed
format is `MARKDOWN` (the platform's structured-block rule). It SHALL be allowed under `DOCUMENT`,
`HEADING` and `LIST_ITEM` only.

#### Scenario: A well-formed definition list validates

- **WHEN** `isValidNode` is given a `DEFINITION_LIST` whose contents hold
  `'Begriff :: Bedeutung'` with `format: 'MARKDOWN'`
- **THEN** it returns `true`

#### Scenario: A definition list with children is invalid

- **WHEN** `isValidNode` is given a `DEFINITION_LIST` that carries a `children` field
- **THEN** it returns `false`

#### Scenario: A definition list with another format is invalid

- **WHEN** `isValidNode` is given a `DEFINITION_LIST` with `format: 'TEXT'`
- **THEN** it returns `false`

#### Scenario: Placement follows the platform's child rules

- **WHEN** a `DEFINITION_LIST` appears under `DOCUMENT`, `HEADING` or `LIST_ITEM`
- **THEN** validation accepts it; under `CONTENT_GROUP` or `CONTENT` it is rejected

### Requirement: One module owns the `::` syntax in both directions

The system SHALL implement the platform's definition-list syntax in a single module used by every
consumer. Reading follows `DefinitionListSyntax`: the separator is `::` with whitespace or a line
boundary on both sides; a line is a pair only if it holds exactly one separator; a source is a
definition list only if **every** line is a pair; a stored `&nbsp;` reads as a blank field. Writing
follows the platform's `blockSerializers.definition_list`: a blank field is stored as `&nbsp;`, a
separator inside a field is defused by closing the spaces around it, and a term that would open a
Markdown block is escaped at the line start.

#### Scenario: Whitespace is required around the separator

- **WHEN** `countSeparators` is called with `'A::B'`
- **THEN** it returns `0`, and with `'A :: B'` it returns `1`

#### Scenario: A line with two separators is not a pair

- **WHEN** `parseDefinitionList` is given `'A :: B :: C'`
- **THEN** it returns `null`

#### Scenario: Parsing is all-or-nothing

- **WHEN** `parseDefinitionList` is given a source whose first line is a pair and whose second line
  is ordinary prose
- **THEN** it returns `null` — matching the platform's processor, which declines the whole
  paragraph

#### Scenario: A blank field is stored as a non-breaking space

- **WHEN** `formatPair('Begriff', '')` is called
- **THEN** it returns `'Begriff :: &nbsp;'`, and `parseDefinitionList` of that line yields the pair
  `['Begriff', '']`

#### Scenario: An inner separator is defused the platform's way

- **WHEN** `formatPair('Begriff', 'a :: b')` is called
- **THEN** it returns `'Begriff :: a::b'`, a line the platform's parser reads as exactly one pair

#### Scenario: A term that would open a Markdown block is escaped

- **WHEN** `formatPair('- Begriff', 'Bedeutung')` and `formatPair('1. Begriff', 'Bedeutung')` are
  called
- **THEN** the emitted lines start with `\- Begriff` and `1\. Begriff`, so neither is parsed as a
  list item, and `splitPair` on each returns the original term

#### Scenario: Text that merely resembles a marker is left alone

- **WHEN** `formatPair('-5 Grad', 'kalt')` or `formatPair('10::30', 'Uhr')` is called
- **THEN** no escape is applied and no spaces are closed — `-5` is not followed by whitespace and
  `10::30` has none around the `::`

### Requirement: HTML definition lists import as DEFINITION_LIST nodes

`parseHtmlToTree` SHALL preserve `<dl>` structures: the sanitizer SHALL allow `dl`, `dt` and `dd`,
and every definition list SHALL become one `DEFINITION_LIST` node holding one `Term :: Value` line
per pair, in document order, written through the platform's storage rules. Field text SHALL be
converted to inline Markdown so emphasis and links survive, and newlines inside a field SHALL
collapse to a space. A missing or empty side SHALL be stored as `&nbsp;`; a `<dt>` followed by
several `<dd>`s SHALL contribute one pair whose value is the texts joined with a space.

#### Scenario: A simple definition list becomes one node

- **WHEN** `parseHtmlToTree('<dl><dt>Begriff</dt><dd>Bedeutung</dd></dl>')` runs
- **THEN** the tree contains one `DEFINITION_LIST` node with `format: 'MARKDOWN'` and content
  `'Begriff :: Bedeutung'`

#### Scenario: Field formatting is preserved

- **WHEN** a `<dd>` contains `<em>kursiv</em>`
- **THEN** the emitted value reads `*kursiv*`

#### Scenario: Several values for one term are joined

- **WHEN** a `<dt>` is followed by two `<dd>` elements
- **THEN** one line is emitted whose value is the two texts joined with a space

#### Scenario: A multi-line field collapses to one line

- **WHEN** a `<dd>` contains `a<br>b`
- **THEN** the emitted value reads `a b` — one pair is one line

#### Scenario: A term without a value is kept

- **WHEN** a `<dt>` has no following `<dd>`
- **THEN** the emitted line reads `'Begriff :: &nbsp;'` and the list is still one node

#### Scenario: A value without a term is kept

- **WHEN** a `<dl>` starts with a `<dd>` that has no preceding `<dt>`
- **THEN** the emitted line reads `'&nbsp; :: Bedeutung'`

#### Scenario: An inner separator does not split the pair

- **WHEN** a `<dd>`'s text reads `a :: b`
- **THEN** the emitted value reads `a::b`, and the line reads back as one pair

### Requirement: Definition lists render as `<dl>` in the preview

The rendered preview SHALL render a `DEFINITION_LIST` node as a `<dl>` with one `<dt>`/`<dd>` pair
per line, each field rendered through the inline-Markdown path, a stored `&nbsp;` rendering as
blank. When the node's content is not all pairs, the preview SHALL fall back to rendering the
source as Markdown rather than showing a partial list — the same all-or-nothing behaviour as the
platform's processor. No number badge SHALL be rendered.

#### Scenario: Pairs render as a definition list

- **WHEN** the preview renders a node whose content is two `Term :: Value` lines
- **THEN** the output contains one `<dl>` with two `<dt>`/`<dd>` pairs in order

#### Scenario: Field marks render

- **WHEN** a value reads `*kursiv*`
- **THEN** the rendered `<dd>` contains an `<em>` element

#### Scenario: A blank field renders blank

- **WHEN** a value is the stored `&nbsp;`
- **THEN** the rendered `<dd>` shows no visible text

#### Scenario: Non-pair content falls back to Markdown

- **WHEN** the node's content is `'Begriff :: Bedeutung\nnoch nicht fertig'`
- **THEN** no `<dl>` is rendered and the source is rendered as Markdown

#### Scenario: No number badge is rendered

- **WHEN** the preview renders a `DEFINITION_LIST` node carrying a `number`
- **THEN** no number badge appears and the stored `number` is unchanged

### Requirement: Definition lists are edited as their Markdown source

The editor SHALL edit a `DEFINITION_LIST` node as its raw `Term :: Value` source under the
`MARKDOWN` editing rules, and the type selector SHALL be able to convert between `CONTENT` and
`DEFINITION_LIST`, carrying the text across and coercing the format to `MARKDOWN`. The legal
transform pipeline SHALL leave definition-list content untouched.

#### Scenario: Editing shows the raw pairs

- **WHEN** the user enters edit mode on a `DEFINITION_LIST` node
- **THEN** the editable surface shows the literal `Term :: Value` lines

#### Scenario: Converting a content node carries the text

- **WHEN** the user converts a `CONTENT` node with `format: 'TEXT'` to `DEFINITION_LIST`
- **THEN** the resulting node has `format: 'MARKDOWN'` and the same `contents` string

#### Scenario: Transforms leave the node alone

- **WHEN** a definition list's term reads `Art. 5` and the transform pipeline runs
- **THEN** the node is unchanged and no heading is created from its content

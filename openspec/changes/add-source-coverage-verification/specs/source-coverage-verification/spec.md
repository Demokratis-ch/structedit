## ADDED Requirements

### Requirement: The tree can be checked against its source document

The system SHALL offer an on-demand check that compares the open document tree against the source
the entry was created from, and SHALL report which source paragraphs have no counterpart in the
tree, which tree paragraphs have no counterpart in the source, and which pairs differ. The check
SHALL NOT modify the document and SHALL NOT add a history entry. For entries whose source is the
tree itself (`source.kind: 'json-envelope'`), the check SHALL be unavailable and SHALL say why.

#### Scenario: A dropped paragraph is reported

- **WHEN** the operator runs the check on a document whose tree is missing one paragraph that the
  source contains
- **THEN** the result reports exactly one missing item carrying that paragraph's source text

#### Scenario: A faithful tree reports nothing missing

- **WHEN** the check runs on a tree that covers every source paragraph
- **THEN** the missing and added counts are zero

#### Scenario: The check is read-only

- **WHEN** the check runs
- **THEN** the document is unchanged and the undo history is exactly as it was

#### Scenario: A JSON-envelope entry cannot be checked

- **WHEN** the open document was imported from a DocTree envelope
- **THEN** the check is not offered, and the reason given is that such a document has no separate
  source to compare against

### Requirement: Both sides are normalised identically before comparison

The system SHALL normalise source and tree text with the same rules the platform applies
(`TextNormalizer`), so that typographic differences never surface as content differences: Unicode
NFC, ligature expansion, soft-hyphen removal and hyphenation joined across line breaks, curly
quotes and guillemets folded to straight quotes, en/em dashes and the minus sign folded to a
hyphen, non-breaking and zero-width characters handled, all whitespace collapsed to single spaces,
a leading bullet marker followed by whitespace dropped, and the ` :: ` definition-list separator
folded to a space.

#### Scenario: Typographic quotes do not cause a difference

- **WHEN** the source has `«Vernehmlassung»` and the tree has `"Vernehmlassung"`
- **THEN** the two paragraphs compare as equal

#### Scenario: Hyphenation across a line break is joined

- **WHEN** the source contains `ex-\nample` and the tree contains `example`
- **THEN** the two compare as equal

#### Scenario: A bullet marker does not cause a difference

- **WHEN** the source line reads `- Foo` and the tree node holds `Foo`
- **THEN** the two compare as equal

#### Scenario: A minus sign inside text is preserved

- **WHEN** a paragraph contains `−5 Grad` or `5-10`
- **THEN** normalisation leaves the number intact and does not treat the character as a bullet

### Requirement: Source paragraphs are extracted by document structure

The system SHALL extract source paragraphs from the entry's stored HTML — or, for a pasted
plain-text entry, one paragraph per non-empty line — by walking the HTML in document
order, buffering inline text and flushing a paragraph at every block boundary, so that nested
markup never splits a logical paragraph. Headings, table rows and images SHALL be extracted as
their own kinds, `<br>` SHALL be treated as a space rather than a boundary, and
`script`/`style`/`noscript`/`template`/`svg`/`nav`/`aside` content SHALL be dropped.

#### Scenario: Inline markup does not split a paragraph

- **WHEN** a source paragraph contains `<span>`, `<a>` and `<strong>` elements
- **THEN** it is extracted as one paragraph

#### Scenario: A block boundary starts a new paragraph

- **WHEN** two `<p>` elements follow each other
- **THEN** two paragraphs are extracted

#### Scenario: Table rows are their own paragraphs

- **WHEN** the source contains a table with three rows
- **THEN** three table-row paragraphs are extracted

#### Scenario: A plain-text source splits by line

- **WHEN** the entry's source is pasted plain text (`text/plain`)
- **THEN** each non-empty line is one paragraph, matching how the plain-text importer built the
  tree

#### Scenario: Page furniture is ignored

- **WHEN** the captured page contains `<nav>` and `<script>` content
- **THEN** none of it appears in the extracted paragraphs

### Requirement: Tree paragraphs mirror the platform's extraction

The system SHALL extract tree paragraphs in document order, in the document's active language,
combining each node's number with its text so that a numbered paragraph compares against the
source's rendered line. An `IMAGE` node SHALL contribute an image placeholder. A `CONTENT_GROUP`
whose number renders inline SHALL contribute no paragraph of its own, its number appearing on its
first `CONTENT` child instead. A node with no content in the active language SHALL contribute
nothing. Every extracted paragraph SHALL carry the id of the node it came from.

Two rules deliberately depart from the platform's `DocTreeParagraphExtractor`: structured blocks
SHALL contribute one table-row paragraph per row or pair (the platform flattens them to one
paragraph, which can never match the per-row paragraphs its own HTML extractor emits), and a
`LIST_ITEM` SHALL contribute nothing of its own (the platform emits its marker as a paragraph; in
StructEdit's sources the marker is presentation, not text).

#### Scenario: A number is combined with its text

- **WHEN** a `CONTENT` node has `number: '1'` and text `Dokumente`
- **THEN** the extracted paragraph reads `1 Dokumente`

#### Scenario: An inline group number lands on its child

- **WHEN** a `CONTENT_GROUP` with `number: '1'` has a first `CONTENT` child with no number
- **THEN** the group contributes no paragraph and the child's paragraph carries the number

#### Scenario: An image contributes a placeholder

- **WHEN** the tree contains an `IMAGE` node
- **THEN** one image-kind paragraph is extracted for it

#### Scenario: A table contributes one paragraph per row

- **WHEN** the tree contains a `TABLE` node with a header row and three data rows
- **THEN** four table-row paragraphs are extracted, so they can align with the source's rows

#### Scenario: An untranslated node contributes nothing

- **WHEN** the active language is `fr` and a node carries only `de` content
- **THEN** that node contributes no paragraph

#### Scenario: A list item's marker is not a paragraph

- **WHEN** the tree contains a `LIST_ITEM` with `number: 'a.'` whose `CONTENT` child reads `Foo`
- **THEN** exactly one paragraph, `Foo`, is extracted for the pair — no `a.` paragraph

### Requirement: Paragraphs are aligned by content, not by position

The system SHALL align the two paragraph sequences by content similarity — high-confidence anchors
first, then a fuzzy alignment within each range — using the platform's parameters, including a
`0.85` similarity threshold. A paragraph present on only one side SHALL be reported as missing or
added without shifting the alignment of everything after it.

#### Scenario: A watermark does not derail the comparison

- **WHEN** the source begins with a paragraph (a watermark or page number) that the tree does not
  contain
- **THEN** that paragraph alone is reported as missing and every following paragraph still aligns
  with its counterpart

#### Scenario: A reworded paragraph is a difference, not a missing pair

- **WHEN** a tree paragraph differs from its source counterpart above the similarity threshold
- **THEN** it is reported as a differing pair, with the differing words marked

#### Scenario: A rewritten paragraph is a missing/added pair

- **WHEN** a tree paragraph shares almost no content with any source paragraph
- **THEN** the source paragraph is reported as missing and the tree paragraph as added

#### Scenario: Equal counts are reported

- **WHEN** the check completes
- **THEN** the result carries counts of equal, differing, missing and added paragraphs

### Requirement: Findings lead to the node they concern

The result SHALL list findings in document order. An added or differing finding SHALL be able to
reveal and select the node it refers to in the tree. A missing finding SHALL show the source text
that has no counterpart, together with enough surrounding context to place it. Equal paragraphs
SHALL be counted but not listed.

#### Scenario: An added finding selects its node

- **WHEN** the operator activates an added finding
- **THEN** the corresponding node is revealed and selected in the tree pane

#### Scenario: A differing finding shows the word diff

- **WHEN** the operator views a differing finding
- **THEN** both texts are shown with the differing words marked

#### Scenario: A missing finding shows where it belongs

- **WHEN** the operator views a missing finding
- **THEN** the source text is shown along with its neighbouring matched paragraph

### Requirement: Large documents degrade honestly

The check SHALL run without blocking editing, and SHALL stop with an explicit "too large to verify"
result — never a partial one — when a document exceeds the platform's comparison or time budgets.

#### Scenario: The editor stays responsive

- **WHEN** a long check is running
- **THEN** the editor remains usable and the check can be abandoned by continuing to edit

#### Scenario: A budget overrun is reported, not guessed around

- **WHEN** the comparison or time budget is exhausted
- **THEN** the result states that the document is too large to verify and lists no findings

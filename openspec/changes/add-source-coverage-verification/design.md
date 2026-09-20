## Context

The platform's verification subsystem (`src/Domain/DocumentVerification/`) is a pipeline of four
pure steps plus a set of per-format extractors:

1. **Extract** — one `Paragraph { text, kind, anchor?, nodeUuid?, pageNumber? }` per logical
   paragraph, from the source (`HtmlParagraphExtractor`, `DocxParagraphExtractor`,
   `PdfParagraphExtractor`, …) and from the tree (`DocTreeParagraphExtractor`).
2. **Normalise** — `TextNormalizer` runs on both sides: NFC, ligatures, soft hyphens and
   hyphenation across line breaks, curly quotes and dashes folded, non-breaking and zero-width
   characters, whitespace collapsed, leading bullet markers dropped, the definition-list separator
   ` :: ` folded to a space.
3. **Align** — `ParagraphAligner`: find high-confidence anchors, then a fuzzy Needleman–Wunsch
   inside each range, with `similarityThreshold: 0.85`, `similarityCompareLength: 400`,
   `minAnchorLength: 12`, token-overlap prefilter (`5` tokens, `0.25`), and two budgets
   (`250_000` comparisons per range, `20s`) beyond which the run gives up rather than hanging.
4. **Report** — `VerificationResult` with `MATCH_EQUAL` / `MATCH_DIFFERS` (carrying a word diff) /
   `MISSING` / `ADDED` and their counts.

The design note in `ParagraphAligner` explains why alignment is content-based rather than
positional: "a leading watermark / page number in one of the inputs would shift the sequences out
of phase; positional alignment then turns the rest of the document into noise."

StructEdit has both inputs already: the tree, and the entry's stored `source.bytes` — which is the
captured HTML for a web import and the Mammoth conversion for a DOCX, i.e. exactly what the Original
pane renders.

This is change 8 of the platform-parity series. It depends on change 6 for the active language (the
comparison is per language) and reads better after the node-type changes, since a tree that cannot
represent tables would report every table row as missing.

## Goals / Non-Goals

**Goals:**

- The operator can ask "did I lose anything?" and get a specific, per-paragraph answer while still
  in the editor.
- StructEdit and Demokratis agree on the answer: same normalisation, same alignment parameters,
  same outcome vocabulary.
- Every finding leads somewhere — to the node it concerns, or to the source text that has no node.
- A large document degrades to an honest "too large" rather than a frozen tab.

**Non-Goals:**

- No verification against original DOCX or PDF bytes. StructEdit holds the converted HTML; what it
  can check is what the *tree building* lost, which is its own job. The platform's stricter check
  against the original file stays where it is (see Risks).
- No automatic repair, and no change to the importer.
- No continuous or background verification; it is an action with a result, not a linter.
- No page numbers: the `pageNumber` field of the platform's `Paragraph` is a PDF concern.

## Decisions

### D1. Port the pipeline, keep the parameters

Four pure modules under `src/utils/verification/`, one per platform class, with the platform's
constants copied as named exports and a comment naming their origin. Same thresholds, same
budgets. The point of the port is agreement: a paragraph the platform would call `MATCH_DIFFERS`
must not be `MISSING` here, or the two tools would send the operator looking for different
problems.

_Rejected: a simpler line-by-line diff._ It is the positional alignment the platform's docblock
explains it had to abandon: one extra paragraph at the top turns every later line into a false
finding.

### D2. Source paragraphs come from the stored HTML

`extract-html.ts` mirrors `HtmlParagraphExtractor` against the DOM the browser already has:
walk in document order, buffer inline text, flush at a block boundary, emit a heading kind for
`h1`–`h6`, a table-row kind per `<tr>`, an image placeholder per `<img>`, drop
`script`/`style`/`noscript`/`template`/`svg`/`nav`/`aside`, and treat `<br>` as a space rather than
a boundary.

A pasted plain-text entry (`source.mime: 'text/plain'`) has no DOM to walk; it is split into one
paragraph per non-empty line, which is exactly how `createPlainTextDocument` built its tree, so a
line the operator has since deleted or merged shows up as the finding it is.

`json-envelope` entries have no separate source — the JSON *is* the tree — so the action is
unavailable for them and says why, rather than comparing the tree against itself.

### D3. Tree paragraphs mirror `DocTreeParagraphExtractor`

Walk the tree in document order in the **active language** and emit one paragraph per
content-bearing node, combining the node's number and text (`'1' + ' ' + 'Dokumente'`) because the
source renders them as one line. Mirroring the platform's rules:

- an `IMAGE` node contributes the literal `[image]` with the image kind, so an image that exists in
  both sides matches and a missing one is reported;
- a `CONTENT_GROUP` whose number renders inline contributes nothing of its own, and that number is
  merged into its first `CONTENT` child instead;
- a node with no content for the active language contributes nothing;
- each emitted paragraph carries the `id` of the node it came from, which is what makes a finding
  clickable.

Two places depart from `DocTreeParagraphExtractor` on purpose, and both are worth reporting back
to the platform:

- **Structured blocks emit one paragraph per row / pair.** The platform's extractor strips a
  table's Markdown through a CommonMark parse and joins the cells with spaces into *one* paragraph
  (`plainTextOf`), while its own `HtmlParagraphExtractor` emits one `TABLE_ROW` paragraph per
  `<tr>` — so on the platform a table can never match its source rows. Emitting per row (and per
  definition-list pair) lets rows align; a flattened table would report N missing rows plus one
  added blob on every document with a table.
- **A list item's marker is not a paragraph.** The platform's `LIST_ITEM` content row holds the
  marker as its number with empty text, and the extractor emits it as a paragraph of its own
  (`'a.'`). In StructEdit's sources the marker is presentation — CSS list styles in captured HTML,
  numbering Mammoth does not emit for DOCX — so it would appear as an added paragraph on every
  list item. `LIST_ITEM` contributes nothing; its `CONTENT` child carries the text.

The normaliser and aligner stay a faithful port; these two are extraction choices, and the spec
names them so nobody mistakes them for drift.

### D4. Run off the main thread, with the platform's budgets

The aligner is O(n·m) inside a range; the platform bounds it with a comparison cap and a 20s
deadline and throws `DocumentVerificationTooLargeException` when it hits them. The same bounds
apply here, and the run happens in a Web Worker so a long check never blocks editing. Where workers
are unavailable (the test environment, an old browser), the same function runs on the main thread —
it is a pure function either way, which is what makes both paths trivially testable.

Exceeding a budget produces a "document too large to verify" result, not a partial one: a partial
alignment would report false findings for everything after the cut-off.

### D5. Findings are actionable, not a score

The result panel shows the four counts and a list of findings in document order:

| Kind            | What the operator sees                                                  |
| --------------- | ----------------------------------------------------------------------- |
| `MISSING`       | source text with no counterpart in the tree — the import lost it        |
| `ADDED`         | tree text with no counterpart in the source — an edit or a duplication  |
| `MATCH_DIFFERS` | both texts with the differing words highlighted                          |
| `MATCH_EQUAL`   | counted, not listed                                                      |

`ADDED` and `MATCH_DIFFERS` items reveal and select their node through the existing selection
store. `MISSING` items have no node by definition; they show the source text and the neighbouring
matched paragraph, which is where the operator has to put it back.

### D6. TDD ordering (bottom-up)

1. `text-normalizer.ts` — one case per rule, including the hyphenation join and the ` :: ` fold.
2. `extract-html.ts` — block flushing, headings, table rows, images, skipped furniture, `<br>`.
3. `extract-tree.ts` — number+text combination, image placeholder, inline-number group, missing
   language, table rows.
4. `align.ts` — equal sequences, a deleted paragraph, an added paragraph, a reworded paragraph, the
   leading-watermark case, budget exhaustion.
5. `verify.ts` + UI — counts and findings for a realistic fixture with a known deleted paragraph.

## Risks / Trade-offs

- **[Verifying against the converted HTML, not the original file]** → It cannot catch what Mammoth
  dropped, only what StructEdit dropped. That is the failure this change is for, and the platform's
  own check against the original file still runs later; the spec says so plainly rather than
  implying a stronger guarantee.
- **[A port can drift from its original]** → Mitigated by copying the constants with their origin
  named, and by testing the same cases the platform's tests cover; a follow-up could share fixtures
  across the two repositories. The two deliberate extraction differences (D3) are documented so
  that a divergence in findings between the tools can be traced to them rather than to drift.
- **[False findings on heavily edited documents]** → Expected and harmless: the operator asked for
  a comparison against the source, and a deliberate edit legitimately shows as `ADDED` or
  `MATCH_DIFFERS`.
- **[Worker adds build surface]** → One Vite-native worker entry point, with the main-thread path as
  the fallback the tests use.

## Migration Plan

Purely additive: a new action, new pure modules, no change to the model, the importer or the
storage schema. Nothing runs unless the operator asks for it. Rollback is a revert.

## Open Questions

- **Should the check run automatically right after an import?** That is when it is most useful and
  when a slow run is least welcome. A reasonable middle is an automatic run for documents under the
  budget with the result shown as a passive badge; worth deciding once there are timings from real
  documents.
- **Should findings be exportable?** An operator handing a document to a colleague may want the
  list. Cheap to add later; out of scope until someone asks.
- **Shared fixtures with the platform.** The strongest guarantee that the two implementations agree
  would be running both against the same source/tree pairs. It needs a home for the fixtures that
  both repositories can read.

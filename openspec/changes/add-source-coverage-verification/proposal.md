## Why

StructEdit's whole purpose is to turn a source document into a tree that faithfully represents it,
and it offers no way to check whether it did. The operator compares two panes by eye; a paragraph
the importer dropped — swallowed by a heading heuristic, lost in a list transform, stripped with a
tag — looks exactly like a paragraph that was never there. The evidence that this is a real failure
mode is in this repository: until the `TABLE`, `IMAGE` and structured-block changes in this series,
whole tables and every image vanished on import, and nothing anywhere said so.

Demokratis has the check StructEdit is missing. `DocumentVerifier` extracts the paragraphs of the
source document and of the doc tree, normalises both sides identically (`TextNormalizer`), aligns
them by content with a fuzzy Needleman–Wunsch (`ParagraphAligner`) and reports every paragraph as
equal, differing (with a word diff), missing or added. It runs on the platform, after the import —
which is the wrong end of the workflow: by then the operator is no longer in the editor where the
tree can be fixed.

## What Changes

- A "Check coverage" action compares the open tree against the document's stored source and reports
  what the tree is missing, what it has added, and which paragraphs differ.
- Normalisation and alignment are a port of the platform's, parameter for parameter: the same text
  normalisation, the same anchor-then-align strategy, the same `0.85` similarity threshold, and
  the same four outcomes (`MATCH_EQUAL`, `MATCH_DIFFERS`, `MISSING`, `ADDED`), so the two tools
  agree on what "the same paragraph" means.
- Source paragraphs come from the entry's stored HTML — which is the DOCX conversion for Word
  uploads and the captured page for HTML — extracted by the platform's rules: buffer inline text,
  flush at block boundaries, headings and table rows and images as their own kinds, `script`/`nav`
  furniture dropped.
- Tree paragraphs come from the document tree in the active language, combining each node's number
  with its text the way the platform does, so `1 Dokumente` is compared against `1 Dokumente` —
  with two deliberate departures from the platform's tree extractor, stated in the design: a table
  contributes one paragraph per row (the platform flattens it to one), and a list item's marker
  contributes nothing (the platform emits it as a paragraph of its own).
- Every reported item is actionable: a `MISSING` paragraph shows the source text that has no home in
  the tree; an `ADDED` or `MATCH_DIFFERS` item reveals and selects the node it refers to, with the
  word-level diff for a differing pair.
- The check runs on demand, off the main thread, and reports "too large to verify" rather than
  freezing when a document exceeds the platform's own comparison and time budgets.
- **Out of scope:** verifying against the original DOCX or PDF bytes (StructEdit holds the
  converted HTML), automatic repair, continuous background checking, and any change to the
  importer's behaviour — this change only makes the outcome visible.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `source-coverage-verification`: extracting comparable paragraphs from the source and the tree,
  normalising and aligning them, and reporting missing / added / differing content against the open
  document.

### Modified Capabilities

- _None._

## Impact

- **New pure modules** under `src/utils/verification/`: `text-normalizer.ts` (the port of
  `TextNormalizer`), `extract-html.ts` (the port of `HtmlParagraphExtractor`), `extract-tree.ts`
  (the port of `DocTreeParagraphExtractor`), `align.ts` (the port of `ParagraphAligner`), and
  `verify.ts` tying them together — all framework-free and unit-testable, like the rest of
  `utils/`.
- **Worker:** `src/workers/verify.worker.ts` running `verify.ts` off the main thread, with a
  main-thread fallback for environments without workers (including the test environment).
- **UI:** the action and its result panel — counts plus the per-item list, wired to the existing
  selection store so an item can reveal its node; a word diff renderer for differing pairs.
- **Source access:** [src/utils/document-storage.ts](src/utils/document-storage.ts) already keeps
  `source.bytes`; the check reads them from the active entry. Entries with `source.kind:
  'json-envelope'` have no separate source, so the action is unavailable for them, with a reason.
- **Sequencing:** last of the platform-parity series; needs the active language from
  `add-multilingual-document-support`, and reads best after the node-type changes, since a tree
  that cannot hold tables reports every table row as missing.
- **Tests:** one test file per pure module (normalisation cases, extraction cases, alignment cases
  including the watermark-shift case the platform's docblock calls out), plus an end-to-end case
  using an existing realistic fixture where a known paragraph is deleted from the tree.

## 1. Text normalisation

- [ ] 1.1 Red: add `src/utils/verification/text-normalizer.test.ts` — one case per rule of the
  platform's `TextNormalizer`: NFC normalisation, `ﬁ`/`ﬂ` ligatures, soft hyphen removal,
  `ex-\nample` → `example`, curly quotes and guillemets folded to `"`/`'`, en/em dashes to `-`,
  non-breaking and zero-width characters, whitespace collapsed, leading `- ` / `• ` / `* ` markers
  dropped while `−5 Grad` and `5-10` stay intact, and ` :: ` folded to a space
- [ ] 1.2 Green: implement `src/utils/verification/text-normalizer.ts` as a direct port, naming
  `TextNormalizer` as its origin

## 2. Source paragraph extraction

- [ ] 2.1 Red: add `src/utils/verification/extract-html.test.ts` — inline markup does not split a
  paragraph; a block boundary flushes one; `h1`–`h6` emit the heading kind; each `<tr>` emits a
  table-row kind; each `<img>` emits an image placeholder; `script`, `style`, `noscript`,
  `template`, `svg`, `nav`, `aside` are dropped; `<br>` becomes a space rather than a boundary;
  empty HTML yields no paragraphs; a `text/plain` source yields one paragraph per non-empty line
- [ ] 2.2 Green: implement `src/utils/verification/extract-html.ts` over the browser DOM (design
  D2), mirroring `HtmlParagraphExtractor`'s tag lists

## 3. Tree paragraph extraction

- [ ] 3.1 Red: add `src/utils/verification/extract-tree.test.ts` — a node's number and text are
  combined into one paragraph (`'1 Dokumente'`); an `IMAGE` node emits `[image]` with the image
  kind; a `CONTENT_GROUP` whose number renders inline emits nothing and its number appears on the
  first `CONTENT` child; a node without content in the active language emits nothing; a `TABLE`
  emits one table-row paragraph per row (header included) and a `DEFINITION_LIST` one per pair; a
  `LIST_ITEM` emits nothing of its own; every paragraph carries its node's `id`
- [ ] 3.2 Green: implement `src/utils/verification/extract-tree.ts` (design D3), mirroring
  `DocTreeParagraphExtractor` except for the two documented departures, each named in a comment

## 4. Alignment

- [ ] 4.1 Red: add `src/utils/verification/align.test.ts` — identical sequences yield all
  `MATCH_EQUAL`; a paragraph deleted from the tree yields exactly one `MISSING` in the right
  position; an extra tree paragraph yields exactly one `ADDED`; a reworded paragraph above the
  similarity threshold yields `MATCH_DIFFERS` and below it yields a `MISSING`/`ADDED` pair; a
  leading watermark paragraph in the source yields one `MISSING` at the top and leaves the rest
  aligned; empty input on either side degrades correctly; exceeding the comparison or time budget
  raises the too-large outcome rather than returning a partial alignment
- [ ] 4.2 Green: implement `src/utils/verification/align.ts` as a port of `ParagraphAligner`
  (anchors, then fuzzy Needleman–Wunsch per range), with the platform's constants exported by name
  (design D1/D4)
- [ ] 4.3 Refactor: confirm the module is pure and free of DOM and React imports, so it can run in
  a worker unchanged

## 5. Verification entry point and worker

- [ ] 5.1 Red: add `src/utils/verification/verify.test.ts` — `verify(sourceHtml, tree, language)`
  returns the four counts and the ops in document order, with a word diff on every
  `MATCH_DIFFERS`; a tree with a deleted paragraph reports it as `MISSING` with the source text
- [ ] 5.2 Green: implement `verify.ts` composing extract → normalise → align → report
- [ ] 5.3 Green: add `src/workers/verify.worker.ts` and a caller that uses it when workers are
  available and falls back to calling `verify` directly otherwise (design D4)

## 6. The action and its results

- [ ] 6.1 Red: cover the UI — a "Check coverage" action is offered for entries that have a source
  and is unavailable, with a reason, for `json-envelope` entries; running it shows the four counts;
  `MISSING` items show the source text; `ADDED` and `MATCH_DIFFERS` items reveal and select their
  node; a differing pair shows the word-level diff; a too-large result shows the explanation
  instead of a finding list
- [ ] 6.2 Green: implement the action and the result panel, reusing the existing selection store to
  reveal nodes
- [ ] 6.3 Refactor: confirm the check never mutates the document and adds no history entry

## 7. End to end & docs

- [ ] 7.1 Red/Green: take a realistic fixture, delete one known paragraph from the tree, and assert
  the verification reports exactly that paragraph as `MISSING`
- [ ] 7.2 Run `npm run test`, `npm run build` and `npm run typecheck` and confirm all three are clean
- [ ] 7.3 Run the check over the largest fixture and record the wall-clock time; confirm the budgets
  behave as intended
- [ ] 7.4 Update [README.md](README.md) and [AGENTS.md](AGENTS.md) with the coverage check and what
  it does and does not verify

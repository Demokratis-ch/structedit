## 1. Structure matching

- [ ] 1.1 Red: add `src/utils/tree-merge.test.ts` — `matchStructure` reports a match for two trees
  with identical types and arities and different text; reports `reason: 'type'` with the path when
  a node's type differs; reports `reason: 'arity'` when a node has a different number of children;
  reports the **first** divergence in document order; returns the correct `NodePath` for a
  divergence several levels deep; treats a leaf without a `children` field as zero children
- [ ] 1.2 Green: implement `matchStructure` in `src/utils/tree-merge.ts`, mirroring
  `DocNode::isEquivalent()` (type + child count) and `structureMatchesWith()` (recursive, positional
  pairing) — design D1
- [ ] 1.3 Refactor: confirm matching never looks at `contents`, `number` or `format`

## 2. Merging one language

- [ ] 2.1 Red: extend `src/utils/tree-merge.test.ts` — `mergeLanguageIntoTree` copies
  `contents[language]` for every node from the counterpart; leaves every other content key,
  `number`, `format`, `id` and the structure untouched; leaves no key where the counterpart has no
  content for that language; returns a new tree without mutating either input
- [ ] 2.2 Green: implement `mergeLanguageIntoTree` (design D2)
- [ ] 2.3 Refactor: confirm the function is total — it assumes a matched pair and never re-checks —
  and that the check is the caller's responsibility

## 3. Refusal rules

- [ ] 3.1 Red: extend `src/utils/tree-merge.test.ts` — a merge into a document where any node
  already carries the merge language is refused, naming the language, and returns the document
  unchanged; a document carrying the language only on the title (not on any node) is not refused
- [ ] 3.2 Green: implement the up-front check (design D3)
- [ ] 3.3 Red/Green: wire the operation into
  [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) — a successful merge commits
  exactly one history entry and undo restores the single-language document; a refusal and a
  mismatch commit nothing

## 4. The merge flow

- [ ] 4.1 Red: extend [src/components/Header.test.tsx](src/components/Header.test.tsx) — a "Merge
  translation" action takes a file, reports the language the import detected, lets the operator
  change it, and runs the merge on confirmation
- [ ] 4.2 Green: implement the action in [src/components/Header.tsx](src/components/Header.tsx),
  reusing the existing `processFile` pipeline for HTML, DOCX and DocTree JSON (design D4)
- [ ] 4.3 Red: a mismatch renders a surface naming the divergence path, the type and arity on each
  side, and the reason; selecting it reveals the offending node in the tree
- [ ] 4.4 Green: implement the mismatch surface; confirm it persists until dismissed rather than
  disappearing like a toast

## 5. End to end & docs

- [ ] 5.1 Red/Green: extend [src/App.test.tsx](src/App.test.tsx) — merging a French capture into a
  German document yields a document carrying both languages, switchable from the header, with the
  German text unchanged; merging a French capture whose structure differs leaves the document
  untouched and shows the mismatch
- [ ] 5.2 Red/Green: the merged document autosaves and resumes with both languages
- [ ] 5.3 Run `npm run test`, `npm run build` and `npm run typecheck` and confirm all three are clean
- [ ] 5.4 Merge a real de/fr consultation pair end to end and export; confirm the platform accepts
  the envelope and shows both languages
- [ ] 5.5 Update [README.md](README.md) and [AGENTS.md](AGENTS.md) with the merge flow

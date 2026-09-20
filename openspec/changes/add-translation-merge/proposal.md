## Why

Swiss consultations publish the same draft in two or three languages, as separate documents. The
Demokratis doc tree holds them as one tree with language-keyed content per node, and the platform
gets there with `DocTreeMergeService`: import the German draft, import the French draft, then merge
the French one into the German tree node by node, provided the two structures match. It is an admin
action (`MergeDocTreeLanguageMessage` / `MergeDocTreeLanguageHandler`) that exists precisely
because the source material arrives one language at a time.

StructEdit has no equivalent, which makes it the wrong half of the workflow: it is where the
structure of each language is captured and fixed, but the two captures can only be combined
afterwards, on the platform, where the structure can no longer be fixed. If the French tree comes
out with one heading more than the German one, the platform's merge throws
`StructureMismatchException` and the admin is sent back to StructEdit with nothing but "Structure
Mismatch" to go on.

Merging in StructEdit — where both trees are open, editable and undoable — turns that dead end into
an ordinary editing task.

## What Changes

- A "Merge translation" action takes a second document (HTML, DOCX or DocTree JSON, through the
  existing import pipeline), asks which language it is, and merges its text into the open document
  as that language.
- Structures are matched by the platform's rule: two nodes correspond when they have the same type
  and the same number of children, recursively from the root — `DocNode::isEquivalent()` /
  `structureMatchesWith()`.
- A mismatch merges nothing and reports **where** the trees diverge: the path to the first
  divergence and what each side has there, so the operator can fix one of the trees and retry.
  This is the piece the platform's exception cannot offer.
- A merge that would overwrite existing content is refused up front: if the open document already
  carries any content in the merge language, the merge does not run, mirroring the platform's
  "target node already contains language X" rule but checked before anything is applied.
- A successful merge commits exactly one history entry — undo restores the single-language
  document — and leaves numbers, formats and structure untouched: only `contents[mergeLanguage]`
  is added.
- After the merge the document carries both languages, so the header's language switcher (from
  `add-multilingual-document-support`) shows them and autosave persists them.
- **Out of scope:** fuzzy or interactive structure matching (aligning trees that differ), merging
  more than one language at a time, persisting the translation's source document as a second
  "Original" pane, and per-language numbers or formats — which the envelope does not carry either.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `translation-merge`: merging a second document into the open one as another language — structure
  matching, mismatch reporting, refusal rules, and the single-history-entry commit.

### Modified Capabilities

- _None._ The active-language concept it builds on is specified by `multilingual-documents`.

## Impact

- **Merge logic:** a new `src/utils/tree-merge.ts` — `matchStructure(main, other)` returning either
  a match or the first divergence, and `mergeLanguageIntoTree(main, other, language)` returning a
  new tree. Pure, immutable, and testable without the UI, like the rest of `utils/`.
- **Import reuse:** [src/utils/file-processing.ts](src/utils/file-processing.ts) — the translation
  goes through the same `processFile` entry points; only its `doc` and `language` are used.
- **Editor:** [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) (one history entry)
  and [src/components/Header.tsx](src/components/Header.tsx) (the action and its file input).
- **Mismatch UI:** a result surface that names the divergence path and the two node types —
  rendered where the operator can act on it, not as a toast that disappears.
- **Sequencing:** seventh of the platform-parity series; depends on
  `add-multilingual-document-support` for the active-language concept and the language switcher.
- **Tests:** a new `src/utils/tree-merge.test.ts`,
  [src/hooks/useTreeOperations.test.ts](src/hooks/useTreeOperations.test.ts), and an
  [src/App.test.tsx](src/App.test.tsx) case merging a French document into a German one.

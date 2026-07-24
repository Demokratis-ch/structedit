## Why

StructEdit structures documents into a DocTree that the [Demokratis](https://demokratis.ch) platform
consumes. Demokratis documents can also carry **questionnaire questions**, but — unlike headings,
`Art.` articles, and lists — questions cannot be derived from an imported file; they have to be
authored. Today StructEdit has no way to create them, so a draft that needs a questionnaire must be
finished by hand in the Demokratis editor. This change lets an author create questions directly in
StructEdit, mirroring Demokratis's question model so they round-trip unchanged through the DocTree
JSON export.

## Dependency

This change is stacked on the per-node **contribution-mode** change and must merge after it. The two
features are otherwise orthogonal; they intersect in exactly two places, both in
[src/types/document.ts](src/types/document.ts):

- the `ALLOWED_MODES` rows for `QUESTION` / `RADIOBUTTON` / `CHECKBOX` / `TEXTAREA`, and
- the optional `contributionMode` field on the four new interfaces.

Only the first is forced: `ALLOWED_MODES` is
`as const satisfies Record<DocumentNode['type'], ContributionMode[]>`, so every node type must declare
its modes. If the merge order ever flips, those rows move to the contribution-mode change instead —
the `satisfies` guard turns the omission into a compile error, so it cannot be missed silently.

## What Changes

- **Four new node types**, mirroring Demokratis: `QUESTION` (a wrapper), `RADIOBUTTON` / `CHECKBOX`
  (single- / multiple-choice options — content-bearing leaves holding the option label), and
  `TEXTAREA` (a free-text answer field — a content-less leaf). Values use StructEdit's `UPPERCASE`
  convention (like `NodeFormat`); the Demokratis importer lowercase-folds.
- **A question is a wrapper subtree:** `QUESTION` → one `CONTENT` (the prompt) + **either** option
  children (all `RADIOBUTTON` = single choice, or all `CHECKBOX` = multiple choice) **or** one
  `TEXTAREA` (free text). Single-vs-multiple is encoded by the option node type — there is no flag on
  `QUESTION`. Questions may live under `DOCUMENT` / `HEADING` / `LIST_ITEM`.
- **Inline authoring:** a question is made from an existing content node — selecting it and picking a
  flavour (Text / Single choice / Multiple choice) in the selection toolbar wraps it in a `QUESTION`
  where it becomes the prompt, with the answer section added after it. The prompt and each option label
  are edited inline like any node. The same control switches an existing question between the three
  flavours (single↔multiple converts radio↔checkbox in place, keeping labels); the question card
  carries an add-option control.
- **Model rules extended:** `ALLOWED_CHILDREN`, the `_AllowedChildrenMatchesTypes` drift guard,
  `ALLOWED_FORMATS`/`DEFAULT_FORMAT`, `ALLOWED_MODES`, and `isValidNodeInternal` all gain the new
  types. A **strict `QUESTION` validator** enforces "exactly one `CONTENT` + (homogeneous options
  XOR one `TEXTAREA`)". `changeNodeTypeInDoc` refuses to convert a question's own children, so a
  type-button press can't turn an option into a second prompt.
- **Preview:** the read-only Preview renders a question as disabled `radio`/`checkbox`/`textarea`
  inputs.
- **Round-trip:** questions serialize as-is through the DocTree envelope; `DOC_TREE_VERSION` and the
  IndexedDB `SCHEMA_VERSION` are unchanged (additive). Older deployed builds treat question-bearing
  stored entries as incompatible (their validator rejects unknown types) — accepted, no migration.
- **Out of scope:** deriving questions from imported HTML/DOCX; participant answers (`ANSWER` /
  `SELECTED_*` nodes — generated on the Demokratis side); and per-question `required`/min/max/help
  metadata (Demokratis persists none either).
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `questionnaire-questions`: authoring questionnaire questions in the document tree — the four
  question node types and their model rules (allowed parents/children, option formats, strict
  validation), the promote / change-flavour / add-remove-option operations, inline tree rendering,
  the read-only preview, and DocTree round-trip.

### Modified Capabilities

- _None._ The option format allow-lists (`RADIOBUTTON`/`CHECKBOX` → `TEXT|NEWLINES|MARKDOWN_MINIMAL`)
  are specified within the new `questionnaire-questions` capability rather than modifying
  `node-formatting`, to keep the change self-contained.

## Impact

- **Data model:** [src/types/document.ts](src/types/document.ts) — four interfaces + the
  `QuestionChildNode` union; `DocumentNode`/`BlockDocumentNode`/`ParentDocumentNode`/
  `ContentBearingNodeType`/`ParentType` extensions; the `QuestionFlavour` type + `getQuestionFlavour`; `ALLOWED_CHILDREN` + the new `SameSet` drift-guard
  conjunct; `ALLOWED_FORMATS`/`DEFAULT_FORMAT`/`ALLOWED_MODES` rows; `LEAF_TYPES`; the strict
  `QUESTION` and content-less `TEXTAREA` validator branches.
- **Tree helpers / mutations:** [src/utils/tree-utils.ts](src/utils/tree-utils.ts) (`withMappedChildren`
  `QUESTION` case), [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) (`createQuestionNode`,
  `wrapContentInQuestion`, `setQuestionFlavour`, the `createNewSiblingNode` question branch, the
  `changeNodeTypeInDoc` question guard).
- **Hooks:** [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) (`wrapInQuestion`,
  `changeQuestionFlavour`), [src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts) (handle).
- **Rendering:** [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) (+
  [TreeNodeContext.tsx](src/components/TreeNodeContext.tsx) and
  [TreeEditor.tsx](src/components/TreeEditor.tsx) wiring),
  [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx).
- **Creation & flavour UI:** the "Question" popover in
  [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx), gated and wired by
  [src/components/TreeEditor.tsx](src/components/TreeEditor.tsx).
- **No data migration, no envelope/schema version bump** — additive. Older builds mark
  question-bearing IndexedDB entries incompatible.

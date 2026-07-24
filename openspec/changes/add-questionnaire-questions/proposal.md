## Why

StructEdit structures documents into a DocTree that the [Demokratis](https://demokratis.ch) platform
consumes. Demokratis documents can also carry **questionnaire questions**, but — unlike headings,
`Art.` articles, and lists — questions cannot be derived from an imported file; they have to be
authored. Today StructEdit has no way to create them, so a draft that needs a questionnaire must be
finished by hand in the Demokratis editor. This change lets an author create questions directly in
StructEdit, mirroring Demokratis's question model so they round-trip unchanged through the DocTree
JSON export.

## What Changes

- **Four new node types**, mirroring Demokratis: `QUESTION` (a wrapper), `RADIOBUTTON` / `CHECKBOX`
  (single- / multiple-choice options — content-bearing leaves holding the option label), and
  `TEXTAREA` (a free-text answer field — a content-less leaf). Values use StructEdit's `UPPERCASE`
  convention (like `NodeFormat`); the Demokratis importer lowercase-folds.
- **A question is a wrapper subtree:** `QUESTION` → one `CONTENT` (the prompt) + **either** option
  children (all `RADIOBUTTON` = single choice, or all `CHECKBOX` = multiple choice) **or** one
  `TEXTAREA` (free text). Single-vs-multiple is encoded by the option node type — there is no flag on
  `QUESTION`. Questions may live under `DOCUMENT` / `HEADING` / `LIST_ITEM`.
- **Inline authoring:** an "Add question" menu (Text / Single choice / Multiple choice) inserts the
  subtree; the prompt and each option label are edited inline like any node; per-question controls
  toggle single↔multiple (converting radio↔checkbox in place) and add/remove options.
- **Model rules extended:** `ALLOWED_CHILDREN`, the `_AllowedChildrenMatchesTypes` drift guard,
  `ALLOWED_FORMATS`/`DEFAULT_FORMAT`, `ALLOWED_MODES`, and `isValidNodeInternal` all gain the new
  types. A **strict `QUESTION` validator** enforces "exactly one `CONTENT` + (homogeneous options
  XOR one `TEXTAREA`)". `changeNodeTypeInDoc` gains a parent-validity **safety guard** so a
  type-button press can't create an invalid child (e.g. a `HEADING` under a `QUESTION`).
- **Preview:** the read-only Preview renders a question as disabled `radio`/`checkbox`/`textarea`
  inputs.
- **Round-trip:** questions serialize as-is through the DocTree envelope; `DOC_TREE_VERSION` and the
  IndexedDB `SCHEMA_VERSION` are unchanged (additive). Older deployed builds treat question-bearing
  stored entries as incompatible (their validator rejects unknown types) — accepted, no migration.
- **Out of scope:** deriving questions from imported HTML/DOCX; participant answers (`ANSWER` /
  `SELECTED_*` nodes — generated on the Demokratis side); text↔choice conversion after creation; and
  per-question `required`/min/max/help metadata (Demokratis persists none either).
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `questionnaire-questions`: authoring questionnaire questions in the document tree — the four
  question node types and their model rules (allowed parents/children, option formats, strict
  validation), the create / single↔multiple-convert / add-remove-option operations, inline tree
  rendering with a single↔multiple toggle, the read-only preview, and DocTree round-trip.

### Modified Capabilities

- _None._ The option format allow-lists (`RADIOBUTTON`/`CHECKBOX` → `TEXT|NEWLINES|MARKDOWN_MINIMAL`)
  are specified within the new `questionnaire-questions` capability rather than modifying
  `node-formatting`, to keep the change self-contained.

## Impact

- **Data model:** [src/types/document.ts](src/types/document.ts) — four interfaces + the
  `QuestionChildNode` union; `DocumentNode`/`BlockDocumentNode`/`ParentDocumentNode`/
  `ContentBearingNodeType`/`ParentType` extensions; `ALLOWED_CHILDREN` + the new `SameSet` drift-guard
  conjunct; `ALLOWED_FORMATS`/`DEFAULT_FORMAT`/`ALLOWED_MODES` rows; `LEAF_TYPES`; the strict
  `QUESTION` and content-less `TEXTAREA` validator branches.
- **Tree helpers / mutations:** [src/utils/tree-utils.ts](src/utils/tree-utils.ts) (`withMappedChildren`
  `QUESTION` case), [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) (`createQuestionNode`,
  `setQuestionChoiceMode`, the `createNewSiblingNode` question branch, the `changeNodeTypeInDoc`
  safety guard).
- **Hooks:** [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) (`insertQuestion`,
  `changeQuestionChoiceMode`), [src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts) (handle).
- **Rendering:** [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) (+
  [TreeNodeContext.tsx](src/components/TreeNodeContext.tsx) and
  [TreeEditor.tsx](src/components/TreeEditor.tsx) wiring),
  [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx).
- **Creation UI:** `src/components/AddQuestionMenu.tsx` (new),
  [src/components/Toolbar.tsx](src/components/Toolbar.tsx),
  [src/components/EditorInterface.tsx](src/components/EditorInterface.tsx).
- **No data migration, no envelope/schema version bump** — additive. Older builds mark
  question-bearing IndexedDB entries incompatible.

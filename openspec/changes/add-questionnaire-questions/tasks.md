## 1. Data model: the four question node types

- [x] 1.1 Red: extend [src/types/document.test.ts](src/types/document.test.ts) — type-level assertions
  (each new `type` discriminant; `RADIOBUTTON`/`CHECKBOX`/`TEXTAREA` are leaves, `QUESTION` ∈
  `BlockDocumentNode` ∩ `ParentDocumentNode`; `QuestionChildNode` membership); runtime validator cases:
  accepts valid single / multiple / text subtrees; **rejects** `contents`/`format` on `QUESTION`,
  children on an option or `TEXTAREA`, `contents`/`format` on `TEXTAREA`, two `CONTENT` children, mixed
  `RADIOBUTTON`+`CHECKBOX`, options+`TEXTAREA` together, zero-answer question, `QUESTION` under
  `LIST`/`CONTENT`, an option with a disallowed format; `canBeChildOf`/`canHaveFormat`/`canHaveMode`
  rows; extend the "row for every node type" drift list; an envelope containing a question validates
- [x] 1.2 Green: in [src/types/document.ts](src/types/document.ts) add `QuestionDocumentNode`,
  `RadiobuttonDocumentNode`, `CheckboxDocumentNode`, `TextareaDocumentNode`, and the `QuestionChildNode`
  union; extend `DocumentNode`, `BlockDocumentNode`, `ParentDocumentNode`, `ContentBearingNodeType`
  (`+RADIOBUTTON,CHECKBOX`), `ParentType` (`+QUESTION`); add the `ALLOWED_CHILDREN` rows + the new
  `SameSet` drift-guard conjunct; add `ALLOWED_FORMATS`/`DEFAULT_FORMAT` (`RADIOBUTTON`/`CHECKBOX` →
  `TEXT|NEWLINES|MARKDOWN_MINIMAL`, default `TEXT`) and `ALLOWED_MODES`
  (`QUESTION:[NONE,REMARK]`, options/`TEXTAREA`:`[NONE]`) rows; add `RADIOBUTTON`/`CHECKBOX` to
  `LEAF_TYPES`; add the content-less `TEXTAREA` branch and the strict `QUESTION` branch (do NOT add
  `QUESTION` to `CONTAINER_TYPES`) — see design D5
- [x] 1.3 Refactor: `npm run typecheck` green (the `satisfies` tables + `_AllowedChildrenMatchesTypes`
  are the type-level gate); confirm no existing document/model test regressed

## 2. Generic tree helper

- [x] 2.1 Red: add a [src/utils/tree-utils.test.ts](src/utils/tree-utils.test.ts) case — mapping a
  `QUESTION`'s children (identity, then swapping option types) keeps `type:'QUESTION'` and a typed
  children array
- [x] 2.2 Green: add `case 'QUESTION': return { ...node, children: map(node.children) as QuestionChildNode[] }`
  to `withMappedChildren` in [src/utils/tree-utils.ts](src/utils/tree-utils.ts) (design D6)

## 3. Builders, choice-switch & the type-change guard

- [x] 3.1 Red: extend [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts) —
  `createQuestionNode` per flavour (CONTENT-first, 2 options / 1 textarea, fresh ids, `isValidNode`
  true); `setQuestionChoiceMode` single↔multiple preserves each option's id/number/contents/format and
  is a same-ref no-op when already that mode or a text question; `changeNodeTypeInDoc` returns `null`
  for a `QUESTION`'s `CONTENT`→`HEADING` and an option→`CONTENT`; existing type-change tests stay green;
  `createNewSiblingNode` returns a matching option under a `QUESTION` parent
- [x] 3.2 Green: add `createQuestionNode` + `setQuestionChoiceMode`; add the `parent.type === 'QUESTION'`
  branch to `createNewSiblingNode`; add the safety guard `if (!canBeChildOf(targetType, parent.type as
  ParentType)) return null;` in `changeNodeTypeInDoc` **after** `if (!hasContents(node)) return null;`
  (design D7/D8/D9) in [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts)
- [x] 3.3 Refactor: confirm `MERGEABLE_TYPES` and the list helpers are untouched and all prior
  tree-mutations tests pass

## 4. Editor hook operations

- [x] 4.1 Red: extend [src/hooks/useTreeOperations.test.ts](src/hooks/useTreeOperations.test.ts) and
  [src/hooks/useTreeEditor.test.ts](src/hooks/useTreeEditor.test.ts) — `insertQuestion(null,'single')`
  appends a valid question at root; `insertQuestion(afterId,'text')` inserts after the selected node in
  its parent; fallback to root when the parent can't hold `QUESTION`; `changeQuestionChoiceMode` with
  undo/redo; add/remove option via `addNodeAfter`/`removeNodes`; every result `isValidDocument`
- [x] 4.2 Green: add `insertQuestion` + `changeQuestionChoiceMode` to
  [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) and expose both through the
  [src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts) handle (design D7/D12)

## 5. Tree rendering & inline authoring

- [x] 5.1 Red: extend [src/components/RecursiveTreeNode.test.tsx](src/components/RecursiveTreeNode.test.tsx)
  — `QUESTION` renders a `data-testid="question-node"` card with the single↔multiple toggle + add-option
  (both absent for a text question); `RADIOBUTTON`/`CHECKBOX` render a glyph + editable label + remove;
  `TEXTAREA` renders `data-testid="textarea-placeholder"`; the toggle/add/remove callbacks fire; generic
  add buttons are suppressed for nodes whose `parentType === 'QUESTION'`
- [x] 5.2 Green: extend `TreeCallbacksContextValue`
  ([src/components/TreeNodeContext.tsx](src/components/TreeNodeContext.tsx)) with
  `onChangeQuestionChoiceMode`/`onAddOption`/`onRemoveOption`; add the `parentType` prop + render
  branches to [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) (design
  D9/D10) and wire the callbacks in [src/components/TreeEditor.tsx](src/components/TreeEditor.tsx)
  (`cbRef`/`callbacksCtx`)

## 6. Read-only preview

- [x] 6.1 Red: extend [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx)
  — a `QUESTION` renders the prompt + disabled `radio`/`checkbox`/`textarea`; option and textarea types
  return `null` at top level
- [x] 6.2 Green: add the `QuestionNode` renderer + `PreviewNode` cases to
  [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx) (design D11)

## 7. Creation UI

- [x] 7.1 Red: add `src/components/AddQuestionMenu.test.tsx` (clone the
  `DocumentContributionModeMenu` test) — the panel offers Text / Single choice / Multiple choice; each
  calls `onInsert` with the flavour; outside-click/Esc close. Extend
  [src/components/EditorInterface.test.tsx](src/components/EditorInterface.test.tsx) — inserting a
  flavour renders a question in the tree
- [x] 7.2 Green: add `src/components/AddQuestionMenu.tsx`; render it in
  [src/components/Toolbar.tsx](src/components/Toolbar.tsx) (`onInsertQuestion` prop) and wire
  [src/components/EditorInterface.tsx](src/components/EditorInterface.tsx)
  (`insertQuestion(lastSelectedId ?? null, flavour)`); offer the flavours from the empty-document
  placeholder in [src/components/TreeEditor.tsx](src/components/TreeEditor.tsx) (design D12)

## 8. Round-trip & verification

- [x] 8.1 Red: extend [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts) (envelope
  round-trip: all three flavours validate and JSON `stringify`→`parse` deep-equal) and
  [src/utils/document-storage-migrations.test.ts](src/utils/document-storage-migrations.test.ts)
  (a question-bearing stored entry survives `migrateEntry`)
- [x] 8.2 Green: confirm no code change is needed for round-trip/persistence (additive); no
  `DOC_TREE_VERSION`/`SCHEMA_VERSION` bump (design D13)
- [x] 8.3 Run `npm run typecheck`, `npm run test:run`, `npm run lint`, `npm run build` — all green
- [ ] 8.4 Manual smoke (`npm run dev`): Add question → each flavour; edit prompt/labels inline;
  add/remove option; flip single↔multiple; Preview shows disabled inputs; Download JSON contains the
  `QUESTION`/`RADIOBUTTON`/`CHECKBOX`/`TEXTAREA` subtree; re-import validates and persists

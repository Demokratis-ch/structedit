Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md) — each item's tests were written first. The
detailed model rules live in [specs/questionnaire-questions/spec.md](specs/questionnaire-questions/spec.md)
and the reasoning in [design.md](design.md).

- [x] 1. **Data model** — the four node types and their rows in `ALLOWED_CHILDREN` (+ drift guard),
  `ALLOWED_FORMATS`/`DEFAULT_FORMAT`, `ALLOWED_MODES`, `LEAF_TYPES`; the content-less `TEXTAREA` and
  strict `QUESTION` validator branches; `QuestionFlavour`/`getQuestionFlavour`
  ([src/types/document.ts](src/types/document.ts))
- [x] 2. **Tree helper** — the `case 'QUESTION'` in `withMappedChildren`
  ([src/utils/tree-utils.ts](src/utils/tree-utils.ts))
- [x] 3. **Mutations** — `createQuestionNode`, `wrapContentInQuestion`, `setQuestionFlavour` (sharing
  `createAnswerChildren`), the `QUESTION` branch of `createNewSiblingNode`, and the
  `changeNodeTypeInDoc` question guard
  ([src/utils/tree-mutations.ts](src/utils/tree-mutations.ts))
- [x] 4. **Editor operations** — `wrapInQuestion` + `changeQuestionFlavour`, exposed through the
  `useTreeEditor` handle ([src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts))
- [x] 5. **Tree rendering** — the question card, option rows and textarea placeholder; the `parentType`
  prop suppressing generic add buttons inside a question
  ([src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx))
- [x] 6. **Read-only preview** — disabled `radio`/`checkbox`/`textarea`
  ([src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx))
- [x] 7. **Authoring UI** — the question popover and its selection gate
  ([src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx),
  [src/components/TreeEditor.tsx](src/components/TreeEditor.tsx))
- [x] 8. **Round-trip** — envelope and IndexedDB migration coverage; no code change needed (additive)
- [x] 9. `npm run typecheck`, `npm run test:run`, `npm run lint`, `npm run build` — all green
- [ ] 10. Manual smoke (`npm run dev`): add a content node, write a prompt, promote it → each flavour;
  edit prompt/labels inline; add/remove option; switch flavour from the prompt and from the question
  card; Preview shows disabled inputs; Download JSON contains the subtree; re-import validates and
  persists

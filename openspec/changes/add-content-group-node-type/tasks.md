## 1. The node type in the data model

- [ ] 1.1 Red: extend [src/types/document.test.ts](src/types/document.test.ts) — `isValidNode`
  accepts a `CONTENT_GROUP` with `number`, `contents`, `format: 'TEXT'` and `CONTENT`/`LIST`/
  `IMAGE` children; rejects one without `contents` or without `format`; rejects a `HEADING`,
  `FOOTNOTE` or nested `CONTENT_GROUP` child; rejects a group under a `LIST_ITEM`; accepts one
  under `DOCUMENT` and under `HEADING`; `canHaveFormat('CONTENT_GROUP', 'MARKDOWN')` is `false`
- [ ] 1.2 Green: add `ContentGroupDocumentNode` and wire it into `DocumentNode`,
  `BlockDocumentNode`, `ParentDocumentNode`, `ParentType`, `ContentBearingNodeType`,
  `ALLOWED_CHILDREN`, `ALLOWED_FORMATS`, `DEFAULT_FORMAT` and `isValidNodeInternal` in
  [src/types/document.ts](src/types/document.ts) (design D1/D2)
- [ ] 1.3 Green: extend the `_AllowedChildrenMatchesTypes` guard with the `CONTENT_GROUP` row and
  confirm the build fails if the table and the typed `children` union disagree
- [ ] 1.4 Refactor: document the group's "container that carries contents" status in the module
  header next to the other node interfaces, naming `JsonEnvelopeV1Parser`'s container list as the
  reason

## 2. Envelope round-trip

- [ ] 2.1 Red: add a fixture envelope under
  [src/test/fixtures/realistic/doctree/](src/test/fixtures/realistic/doctree/) containing a
  grouped Absatz (group with a number, a `CONTENT` child, and a lettered `LIST`), and assert in
  [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts) that
  `processJsonEnvelopeString` accepts it and preserves the group
- [ ] 2.2 Red: assert that exporting the unedited tree via `buildDocTreeEnvelope`
  ([src/utils/document-utils.ts](src/utils/document-utils.ts)) reproduces the input envelope,
  including the group's `contents` value
- [ ] 2.3 Green: confirm no code change is needed beyond task 1 — export walks the tree
  generically — and fix whatever the round-trip test surfaces if that turns out to be optimistic

## 3. Group / ungroup operations

- [ ] 3.1 Red: extend [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts) —
  grouping a numbered `CONTENT` produces a `CONTENT_GROUP` carrying that number with the content
  node's own number cleared; a contiguous `CONTENT` + `LIST` selection moves both into the group;
  grouping inside a `LIST_ITEM` is refused and returns the document unchanged; ungrouping splices
  the children back in place and hands the number to a numberless first `CONTENT` child; ungroup
  leaves an existing child number alone
- [ ] 3.2 Green: implement `groupNodesInDoc` / `ungroupNodeInDoc` in
  [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) (design D4)
- [ ] 3.3 Red/Green: expose them through
  [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) with exactly one history entry
  per operation; undo restores the pre-operation tree
- [ ] 3.4 Red/Green: add the group/ungroup action to
  [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx), shown only when the
  selection can actually be grouped (or is exactly one group), and keep the type buttons unchanged
- [ ] 3.5 Red/Green: in [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx)
  treat the group like `LIST_ITEM` — number editing, no text editing — and in
  [src/hooks/useKeyboardShortcuts.ts](src/hooks/useKeyboardShortcuts.ts) decide text-vs-number edit
  by node type rather than `'contents' in node` (which would open text edit on the group), so
  `Enter` on a selected group opens number edit

## 4. Preview rendering

- [ ] 4.1 Red: extend
  [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx) —
  a group whose first child is a `CONTENT` renders its number inline at the start of that child
  and nothing above it; a group whose first child is a `LIST` renders the number above the
  children; a group number plus a child number renders both, inherited first; a group with no
  number renders neither
- [ ] 4.2 Green: add the `ContentGroupNode` renderer and the inherited-number path in `ContentNode`
  in [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx)
  (design D3), rendering both numbers through `NumberMarkup`
- [ ] 4.3 Refactor: confirm `PreviewToc` / [src/utils/outline-utils.ts](src/utils/outline-utils.ts)
  treat the group as a pass-through container (it contributes no TOC entry of its own)

## 5. Verification & docs

- [ ] 5.1 Run `npm run test` and confirm the entire suite is green
- [ ] 5.2 Run `npm run build` and `npm run typecheck` and confirm both succeed with no new errors
- [ ] 5.3 Open a real platform export containing grouped Absätze over `?loadFile=` and confirm it
  loads, previews with the expected number placement, and exports unchanged
- [ ] 5.4 Update [AGENTS.md](AGENTS.md)'s node-type list and
  [README.md](README.md) if they enumerate the supported types

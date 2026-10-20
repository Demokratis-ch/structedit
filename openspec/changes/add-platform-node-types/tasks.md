# Tasks

## 1. Data model and validation (`document-model`, `node-formatting`)

- [x] 1.1 Red: extend [src/types/document.test.ts](src/types/document.test.ts) with the `document-model` scenarios (ten-type set, every new `canBeChildOf` row positive and negative, `TABLE`/`DEFINITION_LIST` leaf rules, `CONTENT_GROUP` wire shape, number rules) and the `node-formatting` delta scenarios (missing format, allow-lists, defaults); extend the type-level assertions for the three interfaces and the new child unions. Verify: the new tests fail and `tsc` reports the missing types
- [x] 1.2 Green: in [src/types/document.ts](src/types/document.ts) add `ContentGroupDocumentNode`, `TableDocumentNode`, `DefinitionListDocumentNode`; `ListItemChildNode` and `ContentGroupChildNode`; extend `DocumentNode`, `BlockDocumentNode`, `ParentDocumentNode`, `ParentType`, `ContentBearingNodeType`, `ALLOWED_FORMATS`, `DEFAULT_FORMAT`, `LEAF_TYPES`, `ALLOWED_CHILDREN` and the drift guard; add the `CONTENT_GROUP` validator branch; export `hasEditableText`. Verify: `npm run test -- src/types` and `npx tsc --noEmit` pass
- [x] 1.3 Green: extend `exampleDocument` with a content group, a table and a definition list so the living documentation shows every type. Verify: `isValidDocument(exampleDocument)` test still passes
- [x] 1.4 Refactor: confirm `ALLOWED_CHILDREN` / the typed unions / the drift guard are the only three places encoding the rules and the module comments cite the platform's `DocNodeType` rules. Verify: `npm run lint`

## 2. Tree primitives and mutations (`node-type-editing`)

- [x] 2.1 Red: extend [src/utils/tree-utils.test.ts](src/utils/tree-utils.test.ts) so `updateChildrenAtPath`/`withMappedChildren` rebuild a `CONTENT_GROUP`'s children and `changeNodeFormat` accepts the new content-bearing types. Verify: tests fail on the missing branch
- [x] 2.2 Green: in [src/utils/tree-utils.ts](src/utils/tree-utils.ts) add the `CONTENT_GROUP` case to `withMappedChildren` and source the content-bearing list from the model. Verify: `npm run test -- src/utils/tree-utils`
- [x] 2.3 Red: extend [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts) with every conversion scenario from `node-type-editing` (text ↔ table/definition list incl. child lifting and the parent guard, wrap into / dissolve from a group incl. refusals, list/list_item refusals, group merge) asserting `isValidDocument` on every result. Verify: tests fail
- [x] 2.4 Green: in [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) widen `changeNodeTypeInDoc`'s target union, add the leaf conversions, the `CONTENT_GROUP` wrap and dissolve branches, and `CONTENT_GROUP` in `MERGEABLE_TYPES` with list-item merge semantics. Verify: `npm run test -- src/utils/tree-mutations`
- [x] 2.5 Refactor: share the "lift children as siblings" step between the footnote and leaf conversions. Verify: suite stays green

## 3. Hooks and keyboard (`node-type-editing`)

- [x] 3.1 Red: extend [src/hooks/useTreeOperations.test.ts](src/hooks/useTreeOperations.test.ts) — `changeNodeTypes` with the new targets commits once and yields valid documents; `moveNodeById`/`getReceivingParentId` accept a content node into a group and refuse a heading or a group into a list item; `updateNodeContents` edits a table. Verify: tests fail
- [x] 3.2 Green: in [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) widen the `changeNodeTypes` target type and replace the local content-bearing list with the model's. Verify: `npm run test -- src/hooks/useTreeOperations`
- [x] 3.3 Red: extend [src/components/TreeEditor.test.tsx](src/components/TreeEditor.test.tsx) shortcut table with `b`/`d`/`g` and add a test that Enter on a selected group opens number editing (not text editing). Verify: tests fail
- [x] 3.4 Green: in [src/hooks/useKeyboardShortcuts.ts](src/hooks/useKeyboardShortcuts.ts) map `b`/`d`/`g`, extend `handleBulkUpdateType`, and decide text-vs-number edit with `hasEditableText`. Verify: `npm run test -- src/components/TreeEditor`

## 4. Tree editor UI (`node-type-editing`, `node-formatting`)

- [x] 4.1 Red: extend [src/components/RecursiveTreeNode.test.tsx](src/components/RecursiveTreeNode.test.tsx) — a group renders its number badge and `(content_group)` label with no content-editable; a table renders a content-editable with its source and a `TABLE · MARKDOWN` indicator. Verify: tests fail
- [x] 4.2 Green: in [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) render `CONTENT_GROUP` like a list item and `TABLE`/`DEFINITION_LIST` like content, gated by `hasEditableText`. Verify: `npm run test -- src/components/RecursiveTreeNode`
- [x] 4.3 Red: extend [src/components/FloatingToolbar.test.tsx](src/components/FloatingToolbar.test.tsx) — buttons `Table (B)`, `Definition List (D)`, `Content Group (G)` exist and call `onUpdateType`; the format selector is hidden for a group and offers only `MARKDOWN` for a table. Verify: tests fail
- [x] 4.4 Green: in [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx) add the three buttons (lucide `Table`, `BookA`, `Group`), widen `ToolbarBlockType`, and derive the selector's visibility from `hasEditableText`; in [src/components/TreeEditor.tsx](src/components/TreeEditor.tsx) map the three node types to toolbar types and hide the format for a group. Verify: `npm run test -- src/components/FloatingToolbar src/components/TreeEditor`

## 5. Preview rendering (`document-preview`)

- [x] 5.1 Red: create [src/utils/definition-list.test.ts](src/utils/definition-list.test.ts) covering the separator rule (whitespace both sides, line boundary, first separator wins, empty side, `A::B` is text, blank lines ignored, any failing line → null). Verify: test file fails to import
- [x] 5.2 Green: add [src/utils/definition-list.ts](src/utils/definition-list.ts) with `parseDefinitionList(source): Array<[term, value]> | null`, separator regex copied from the platform's `DefinitionListSyntax`. Verify: `npm run test -- src/utils/definition-list`
- [x] 5.3 Red: extend [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx) with every `document-preview` scenario (inline group number, number above a list, hidden group contents, table element, table number, dl/dt/dd, inline marks, fallbacks). Verify: tests fail
- [x] 5.4 Green: in [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx) add `ContentGroupNode`, `TableNode`, `DefinitionListNode` and route them from `PreviewNode`, making the switch exhaustive. Verify: `npm run test -- src/components/PreviewNodeRenderers src/components/DocumentPreview`

## 6. Platform envelope round trip (`document-model`)

- [x] 6.1 Add [src/test/fixtures/demokratis-doctree-export.json](src/test/fixtures/demokratis-doctree-export.json): a DocTree v1 envelope shaped exactly like the platform serializer's output, containing a content group (with `contents: { de: '' }`), a table and a definition list. Verify: `isValidDocTreeEnvelope` accepts it in a test
- [x] 6.2 Red/Green: extend [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts) (upload opens the fixture; `buildDocTreeEnvelope` round-trips its `document`), [src/App.test.tsx](src/App.test.tsx) (`loadFile` opens it without an error), and [src/utils/document-storage-migrations.test.ts](src/utils/document-storage-migrations.test.ts) (a v2 entry with the new types loads; an older v2 entry is unchanged). Verify: `npm run test -- src/utils/file-processing src/App src/utils/document-storage-migrations`

## 7. Docs and integration checks

- [x] 7.1 Update the node type list in [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md). Verify: both files name the three types
- [x] 7.2 Run `npm run format:check`, `npm run lint`, `npx tsc --noEmit` and `npm run test:run`; confirm the suite is green and no `biome` or type errors remain. Verify: all four commands exit 0
- [x] 7.3 Manual smoke in `npm run dev`: upload the fixture, convert a paragraph to a table and back, wrap a paragraph into a group and dissolve it, drag a paragraph into a group, undo each step, download the JSON and re-upload it. Verify: no console errors and the re-uploaded document matches

## Workflow follow-up

- Archive this change with `/opsx:archive` after merge and sync the three new capability specs and the `node-formatting` delta into `openspec/specs/`.
- Platform side: add a `CONTENT_GROUP` round-trip test to `JsonEnvelopeV1SerializerTest` and decide whether the group should move into the serializer's container list (see design D1).

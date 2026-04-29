## 1. Types, validation, defaults

- [x] 1.1 Red: add tests in [src/types/document.test.ts](src/types/document.test.ts) (new file if needed) covering `NodeFormat` union, `ALLOWED_FORMATS`, `DEFAULT_FORMAT`, `canHaveFormat`, and the new `isValidNode` rules (missing/invalid/forbidden format on each node type — see spec scenarios under "Every content-bearing node carries a required format field" and "Per-type allowed-format restrictions are enforced")
- [x] 1.2 Green: add `NodeFormat` union, `ALLOWED_FORMATS`, `DEFAULT_FORMAT`, `canHaveFormat` to [src/types/document.ts](src/types/document.ts); add required `format` field to `HeadingDocumentNode`, `ContentDocumentNode`, `LeafDocumentNode`; extend `isValidNodeInternal` to enforce presence + allow-list and reject `format` on container types
- [x] 1.3 Green: update the `exampleDocument` in [src/types/document.ts:67](src/types/document.ts#L67) and any in-repo fixtures under [src/test/](src/test/) to include `format: 'TEXT'` on every content-bearing node so existing tests stay green
- [x] 1.4 Refactor: confirm one source of truth — `canHaveFormat` is used by validation; export it from the same module as the type

## 2. Pure renderer

- [x] 2.1 Red: create [src/utils/format-render.test.ts](src/utils/format-render.test.ts) with a table-driven suite covering every spec scenario in the "Renderer produces deterministic, sanitized HTML per format" requirement (text escape + newline-collapse, newlines→`<br>`, the five marks for `markdown_minimal`, no blocks for `markdown_inline`, full CommonMark for `markdown`, and XSS sanitization for all formats)
- [x] 2.2 Green: add [src/utils/format-render.ts](src/utils/format-render.ts) exporting `renderContent(raw, format)`; implement `TEXT` and `NEWLINES` with HTML-escape + replace; pull in `marked` for `MARKDOWN` and `MARKDOWN_INLINE`; implement `MARKDOWN_MINIMAL` as a small in-house pipeline (escape → replace 5 marks → `<br>` for `\n`); pipe every output through `DOMPurify.sanitize` with per-format allow-lists
- [x] 2.3 Green: install `marked` (`npm install marked` + `@types/marked` if not bundled); confirm bundle size is acceptable
- [x] 2.4 Refactor: extract per-format sanitize configs into one place; ensure `renderContent` is fully pure (no module-level mutable state)

## 3. Importer integration (HTML → Markdown source)

- [x] 3.1 Red: extend [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts) with the importer scenarios from the spec ("Plain heading imports as TEXT format", "Heading with bold imports as MARKDOWN_MINIMAL", "Paragraph with inline marks imports as MARKDOWN", "Plain paragraph keeps TEXT format", "Image always imports as TEXT")
- [x] 3.2 Green: add `htmlToMarkdown(html, format)` to [src/utils/format-render.ts](src/utils/format-render.ts) handling the 5 inline marks
- [x] 3.3 Green: rewrite the relevant arms of `getInnerHtml` and node-creation paths in [src/utils/document-utils.ts](src/utils/document-utils.ts#L60-L122) so they (a) detect inline marks per node, (b) choose the format per the heuristic in design D8, (c) call `htmlToMarkdown` to produce the stored source, (d) populate `format` on every created content-bearing node
- [x] 3.4 Green: keep the existing strip path as the `TEXT`-format branch; ensure all existing importer tests still pass after fixtures get explicit `format` fields

## 4. Tree operations

- [x] 4.1 Red: extend [src/utils/tree-utils.test.ts](src/utils/tree-utils.test.ts) with tests for a new `changeNodeFormat(tree, path, format)` immutable op — happy path, throws/no-op when format isn't allowed for that node type, leaves `contents` untouched
- [x] 4.2 Green: implement `changeNodeFormat` in [src/utils/tree-utils.ts](src/utils/tree-utils.ts)
- [x] 4.3 Red: extend [src/hooks/useTreeOperations.test.ts](src/hooks/useTreeOperations.test.ts) with the spec scenarios "Choosing a format commits one history entry", "addNodeAfter creates a content node with default format TEXT", "changeNodeTypes preserves an allowed format and resets an incompatible one", "changeNodeTypes preserves a still-allowed format"
- [x] 4.4 Green: in [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) add `changeNodeFormat(id, format)`; update `addNodeAfter`/`addNodeBefore` and `changeNodeTypes` to populate/preserve `format` per the allow-list; commit each change as one history entry
- [x] 4.5 Green: thread `changeNodeFormat` through [src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts) so `FloatingToolbar` can call it

## 5. Edit-mode rendering split (source vs. rendered HTML)

- [x] 5.1 Red: extend [src/components/ContentBlock.test.tsx](src/components/ContentBlock.test.tsx) (or RecursiveTreeNode tests) with cases verifying: editing surface shows raw source for markdown formats; non-editing display calls `renderContent`; toggling format does not mutate stored content (covers "Editor stores Markdown source, not rendered HTML" scenarios)
- [x] 5.2 Green: split [src/components/ContentBlock.tsx](src/components/ContentBlock.tsx) so the editing path uses `textContent`-style editing (preserve `\n` via `white-space: pre-wrap`), and the non-editing path renders via `dangerouslySetInnerHTML={{ __html: renderContent(raw, format) }}`
- [x] 5.3 Green: pass `format` through props from [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) to `ContentBlock`

## 6. Enter key behaviour

- [x] 6.1 Red: extend [src/components/TreeEditor.test.tsx](src/components/TreeEditor.test.tsx) with the four scenarios from "Enter in edit mode never creates a sibling node" (Enter in `TEXT` is no-op; Enter in `NEWLINES` inserts `\n`; Enter in `MARKDOWN` inserts `\n`; Enter on selected non-editing node still creates sibling)
- [x] 6.2 Green: rewrite the `Enter` branch of `handleBlockKeyDown` in [src/components/TreeEditor.tsx:175-183](src/components/TreeEditor.tsx#L175-L183) to dispatch on the edited node's `format`; for newline-capable formats use `document.execCommand('insertText', false, '\n')` after `preventDefault`; treat `Shift+Enter` identically to `Enter`
- [x] 6.3 Green: leave the global selected-mode `Enter` handler at [TreeEditor.tsx:304-306](src/components/TreeEditor.tsx#L304-L306) unchanged; add a regression test asserting it still calls `addNodeAfter`
- [x] 6.4 Green: update the help text at [TreeEditor.tsx:437](src/components/TreeEditor.tsx#L437) to describe the new behaviour

## 7. FloatingToolbar format selector

- [x] 7.1 Red: add tests for [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx) (create test file if missing) covering "Selector lists only allowed formats for the selected type", "Selector is hidden for container-only selection", "Selector is hidden for multi-selection", "Choosing a format commits one history entry"
- [x] 7.2 Green: render a `<select>` (or accessible equivalent) in `FloatingToolbar` whose options come from `ALLOWED_FORMATS[node.type]`; wire `onChange` to `changeNodeFormat` from `useTreeEditor`; hide it unless exactly one content-bearing node is selected
- [x] 7.3 Refactor: confirm focus / blur do not jump while the selector is in use

## 8. Verification

- [x] 8.1 Run `npm run test` and confirm the entire suite is green
- [x] 8.2 Run `npm run build` and confirm it succeeds with no new TypeScript errors
- [ ] 8.3 Manually verify in `npm run dev` (port 3000): import a DOCX containing bold/italic, change a node's format via the toolbar, hit Enter inside a `MARKDOWN` content node and confirm a `\n` is inserted (rendered as a line break on blur), hit Enter inside a heading with `MARKDOWN_MINIMAL` and confirm the newline shows as a `<br>`, hit Enter on a selected non-editing node and confirm a sibling is created, undo/redo a format change

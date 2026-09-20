## 1. The node type in the data model

- [ ] 1.1 Red: extend [src/types/document.test.ts](src/types/document.test.ts) — `isValidNode`
  accepts a `TABLE` with `contents`, `format: 'MARKDOWN'` and no `children`; rejects one carrying
  a `children` field; rejects `format: 'TEXT'`; accepts a table under `DOCUMENT`, `HEADING` and
  `LIST_ITEM`; rejects one under `CONTENT_GROUP` or `CONTENT`
- [ ] 1.2 Green: add `TableDocumentNode` and wire it into `DocumentNode`, `BlockDocumentNode`,
  `ContentBearingNodeType`, `LEAF_TYPES`, `ALLOWED_CHILDREN`, `ALLOWED_FORMATS`, `DEFAULT_FORMAT`
  in [src/types/document.ts](src/types/document.ts) (design D1)
- [ ] 1.3 Refactor: confirm the `_AllowedChildrenMatchesTypes` guard still compiles and now covers
  the table in the three parent rows

## 2. Pipe-table serialization

- [ ] 2.1 Red: add `htmlTableToMarkdown` tests in
  [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts), one per rule in design D2
  — `<thead>` becomes the header row; a first row of `<th>` becomes the header row; a table with
  neither promotes its first row; cell emphasis becomes inline Markdown; a `|` in cell text is
  escaped as `\|`; a `<br>` inside a cell collapses to a space; a ragged table pads to the widest
  row; `colspan`/`rowspan` keep the grid rectangular with empty padding; a nested table flattens
  into its containing cell; a table with no rows yields no node
- [ ] 2.2 Green: implement `htmlTableToMarkdown` in
  [src/utils/document-utils.ts](src/utils/document-utils.ts), reusing
  `htmlToMarkdown(cellHtml, 'MARKDOWN_INLINE')` for cell content
- [ ] 2.3 Refactor: verify the output parses identically under `marked` and under the platform's
  rules (delimiter row in position 2, cells split on unescaped pipes, `\|` unescaped)

## 3. The importer keeps tables

- [ ] 3.1 Red: extend [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts) —
  `parseHtmlToTree('<table>…</table>')` produces exactly one `TABLE` node with
  `format: 'MARKDOWN'` and the expected pipe-table content; a `<caption>` produces a `CONTENT`
  node immediately before the table; a table inside a `<li>` lands under the `LIST_ITEM`; table
  text no longer leaks into surrounding paragraphs
- [ ] 3.2 Green: add the table tags (`table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`,
  `caption`) to the DOMPurify allow-list and a `<table>` branch to the walker in
  [src/utils/document-utils.ts](src/utils/document-utils.ts)
- [ ] 3.3 Red/Green: pin in [src/utils/legal-transforms/index.test.ts](src/utils/legal-transforms/index.test.ts)
  that a `TABLE` whose first cell reads "Art. 5" or "a." passes through the transform pipeline
  untouched, and skip `TABLE` nodes wherever a transform walks content (design D5)
- [ ] 3.4 Red/Green: update the `with_table` expectations in
  [src/utils/file-processing.integration.test.ts](src/utils/file-processing.integration.test.ts)
  — each Word table becomes one `TABLE` node, with row and column counts asserted

## 4. Preview rendering

- [ ] 4.1 Red: extend
  [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx) —
  a `TABLE` node renders a `<table>` with the expected header cells and row count, inside a
  horizontally scrollable container, and renders no number badge
- [ ] 4.2 Green: add the `TableNode` renderer in
  [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx) and dispatch
  to it from `PreviewNode` (design D4)
- [ ] 4.3 Refactor: confirm the tree pane renders a table row with a recognisable label and that
  editing a table opens its Markdown source (no number edit)

## 5. Type conversion & round-trip

- [ ] 5.1 Red: extend [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts) —
  converting a `CONTENT` node to `TABLE` keeps the text and sets `format: 'MARKDOWN'`; converting
  a `TABLE` back to `CONTENT` keeps the Markdown source; converting a `CONTENT` inside a
  `CONTENT_GROUP` to `TABLE` is refused by the existing parent guard
- [ ] 5.2 Green: add the `TABLE` entry to the toolbar's type buttons in
  [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx)
- [ ] 5.3 Red/Green: assert in [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts)
  that an envelope containing a `TABLE` imports and re-exports unchanged

## 6. Verification & docs

- [ ] 6.1 Run `npm run test` and confirm the entire suite is green
- [ ] 6.2 Run `npm run build` and `npm run typecheck` and confirm both succeed with no new errors
- [ ] 6.3 Import `src/test/fixtures/realistic/docx/with_table/vorentwurf_zurich_2025.docx` in the
  running app and confirm the tables appear as tables in both panes
- [ ] 6.4 Update [README.md](README.md) / [AGENTS.md](AGENTS.md) where they describe what survives
  an import

## 1. Allow-lists mirror the platform

- [ ] 1.1 Red: extend [src/types/document.test.ts](src/types/document.test.ts) — `canHaveFormat`
  returns `true` for `('CONTENT', 'MARKDOWN_INLINE')` and `false` for `('FOOTNOTE', 'MARKDOWN')`;
  `isValidNode` accepts a `content` node with `format: 'MARKDOWN_INLINE'` and rejects a `footnote`
  node with `format: 'MARKDOWN'`; the `HEADING` and `IMAGE` rows are unchanged
- [ ] 1.2 Green: update `ALLOWED_FORMATS` in [src/types/document.ts](src/types/document.ts) —
  `CONTENT: ['TEXT', 'NEWLINES', 'MARKDOWN_INLINE', 'MARKDOWN']`, `FOOTNOTE: ['TEXT', 'NEWLINES']`
  (design D1), naming `JsonEnvelopeV1Parser::allowedFormats()` in the doc comment as the upstream
- [ ] 1.3 Red/Green: extend [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts) —
  converting a `MARKDOWN_INLINE` content node to `FOOTNOTE` yields `format: 'TEXT'` with the
  source string unchanged (no code change expected; `carryFormatOrDefault` already does this)

## 2. Hard breaks in Markdown source

- [ ] 2.1 Red: extend [src/utils/format-render.test.ts](src/utils/format-render.test.ts) —
  `htmlToMarkdown('a<br>b', 'MARKDOWN_INLINE')` and `('MARKDOWN')` both yield `'a\\\nb'`;
  `htmlToMarkdown('a<br>', …)` and `('<br>a', …)` yield `'a'` (edge breaks dropped, no dangling
  backslash); `renderContent('a\\\nb', 'MARKDOWN_INLINE')` and `('MARKDOWN')` both contain
  exactly one `<br>`, including inside `**…**`; `NEWLINES` and `MARKDOWN_MINIMAL` behaviour is
  unchanged
- [ ] 2.2 Green: emit the backslash hard break for `<br>` in the Markdown branch of
  `htmlToMarkdown` in [src/utils/format-render.ts](src/utils/format-render.ts) (design D2); confirm
  `renderContent` needs no change
- [ ] 2.3 Refactor: confirm `hasInlineMarkdownMarks` still reports `true` for a source whose only
  mark is a hard break

## 3. Importer picks inline-level Markdown

- [ ] 3.1 Red: extend [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts) with
  one case per row of the design D2 table — `<p>see <em>this</em></p>` → `MARKDOWN_INLINE` with
  contents `'see *this*'`; `<p>see <a href="https://example.org">this</a></p>` → `MARKDOWN_INLINE`;
  `<p>top<br>bottom</p>` → `NEWLINES` with contents `'top\nbottom'`;
  `<p><em>top</em><br>bottom</p>` → `MARKDOWN_INLINE` with contents `'*top*\\\nbottom'`;
  `<p>just words</p>` → `TEXT`; the heading cases are unchanged
- [ ] 3.2 Green: rewrite the `CONTENT` arm of `chooseFormat` in
  [src/utils/document-utils.ts](src/utils/document-utils.ts) using the existing `hasOnlyBreakMarks`
  helper; leave the `HEADING` and `IMAGE` arms untouched, and update the doc comment
- [ ] 3.3 Red/Green: extend
  [src/utils/legal-transforms/list-number-dedup.test.ts](src/utils/legal-transforms/list-number-dedup.test.ts)
  — a `MARKDOWN_INLINE` node whose only mark was the stripped `^1^` drops to `TEXT`; one that keeps
  another mark stays `MARKDOWN_INLINE`; update `downgradeFormatIfPlain` accordingly (design D3)
- [ ] 3.4 Re-run the realistic-document integration tests
  ([src/utils/file-processing.integration.test.ts](src/utils/file-processing.integration.test.ts))
  and update every fixture expectation that asserts `MARKDOWN` on an imported paragraph or `\n` for
  a `<br>` inside marked prose

## 4. Merging inline-level nodes

- [ ] 4.1 Red: extend [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts) —
  merging two `MARKDOWN_INLINE` content nodes joins their sources with `'\\\n'`; merging a `TEXT`
  and a `MARKDOWN_INLINE` node yields `MARKDOWN_INLINE` joined the same way; `MARKDOWN` merges
  still use a blank line and `NEWLINES` merges a single `\n`
- [ ] 4.2 Green: return the hard break from `paragraphSeparatorFor('MARKDOWN_INLINE')` in
  [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) (design D3)
- [ ] 4.3 Refactor: confirm the rendered merge shows a line break at the join in both the tree pane
  and the preview

## 5. Stored documents survive the narrower allow-list

- [ ] 5.1 Red: extend
  [src/utils/document-storage-migrations.test.ts](src/utils/document-storage-migrations.test.ts)
  — a v2 entry holding a `FOOTNOTE` with `format: 'MARKDOWN'` migrates to a usable entry whose
  footnote is `NEWLINES` with its `contents` unchanged; a `CONTENT` node with `format: 'MARKDOWN'`
  is left exactly as it was; a v1 entry still migrates all the way through to v3; an entry recorded
  as v4 is still reported incompatible
- [ ] 5.2 Green: bump `SCHEMA_VERSION` to 3 and add `migrateV2ToV3` to
  [src/utils/document-storage-migrations.ts](src/utils/document-storage-migrations.ts),
  dispatched after the v1 → v2 step (design D4)
- [ ] 5.3 Refactor: confirm the migration only ever writes `format` (never `contents`), and that
  `migrateEntry`'s `isValidDocument` gate now passes for the migrated entries

## 6. Lists offer no number

- [ ] 6.1 Red: extend
  [src/components/RecursiveTreeNode.test.tsx](src/components/RecursiveTreeNode.test.tsx) — a `LIST`
  row renders no `NumberBadge` and no number input, even when the node carries a stored number; a
  `LIST_ITEM` row still does
- [ ] 6.2 Green: drop the badge from the `LIST` branch of `renderContent` in
  [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) (design D5)
- [ ] 6.3 Red/Green: in [src/hooks/useKeyboardShortcuts.test.ts](src/hooks/useKeyboardShortcuts.test.ts),
  `Enter` on a selected `LIST` neither enters an edit mode nor creates a sibling; `Enter` on a
  `LIST_ITEM` still opens number edit
- [ ] 6.4 Refactor: confirm export leaves a stored `LIST` number untouched (no rewrite of stored
  data) and that `isValidNode` still requires the field

## 7. Verification & docs

- [ ] 7.1 Run `npm run test` and confirm the entire suite is green
- [ ] 7.2 Run `npm run build` and `npm run typecheck` and confirm both succeed with no new errors
- [ ] 7.3 Export a document containing an emphasised paragraph with a `<br>`, and confirm the JSON
  carries `MARKDOWN_INLINE` with a `\`-newline hard break; upload it to a Demokratis dev instance
  and confirm the paragraph renders with its break and is counter-proposable
- [ ] 7.4 Confirm with the Demokratis side that `JsonEnvelopeV1Serializer::structEditFormat()` can
  be retired once this ships

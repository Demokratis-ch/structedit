## 1. Separator rules in one module

- [ ] 1.1 Red: add `src/utils/definition-list.test.ts` — `countSeparators` counts only `::` with
  whitespace or a line boundary on both sides (so `A::B` is zero, `A :: B` is one, `A :: B :: C`
  is two); `splitPair` splits on the first separator and trims each side; `parseDefinitionList`
  returns the pairs for an all-pairs source, folds a stored `&nbsp;` to a blank field, and returns
  `null` when any line is not exactly one pair; `formatPair` stores a blank field as `&nbsp;`,
  closes the spaces around an inner ` :: `, escapes a term starting with `#`…`######`, `-`, `+` or
  `*` followed by whitespace, `>`, or an ordered marker (`1.` → `1\.`, `1)` → `1\)`), leaves
  `10::30` and `-5` alone, and `splitPair(formatPair(t, v))` round-trips to the original strings
- [ ] 1.2 Green: implement `src/utils/definition-list.ts` (design D2), mirroring
  `DefinitionListSyntax` for reading and `blockSerializers.definition_list` for writing, naming both
  in the module header
- [ ] 1.3 Refactor: confirm the separator regex appears exactly once in the codebase

## 2. The node type in the data model

- [ ] 2.1 Red: extend [src/types/document.test.ts](src/types/document.test.ts) — `isValidNode`
  accepts a `DEFINITION_LIST` with `contents` and `format: 'MARKDOWN'` and no `children`; rejects
  a `children` field; rejects any other format; accepts it under `DOCUMENT`, `HEADING` and
  `LIST_ITEM` and rejects it under `CONTENT_GROUP` and `CONTENT`
- [ ] 2.2 Green: add `DefinitionListDocumentNode` and wire it into the unions, `LEAF_TYPES`,
  `ALLOWED_CHILDREN`, `ALLOWED_FORMATS` and `DEFAULT_FORMAT` in
  [src/types/document.ts](src/types/document.ts) (design D1)
- [ ] 2.3 Refactor: confirm the structured-block rows (`TABLE`, `DEFINITION_LIST`) read as one rule
  rather than two copies

## 3. `<dl>` import

- [ ] 3.1 Red: extend [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts) —
  `<dl><dt>Begriff</dt><dd>Bedeutung</dd></dl>` produces one `DEFINITION_LIST` node with content
  `'Begriff :: Bedeutung'`; marks inside a field survive as inline Markdown; a newline inside a
  field collapses to a space; a `<dt>` with two `<dd>`s produces one pair with the values joined;
  a `<dt>` without a `<dd>` yields `'Begriff :: &nbsp;'`; a leading `<dd>` yields
  `'&nbsp; :: Bedeutung'`; an empty `<dd>` yields `&nbsp;`; a `<dd>` reading `a :: b` yields the
  value `a::b`; a term starting with `- ` is escaped as `\- `
- [ ] 3.2 Green: add `dl`/`dt`/`dd` to the DOMPurify allow-list and the `<dl>` branch in
  [src/utils/document-utils.ts](src/utils/document-utils.ts), emitting lines through `formatPair`
  (design D3)
- [ ] 3.3 Red/Green: confirm the legal transforms skip `DEFINITION_LIST` nodes, as they skip
  `TABLE` nodes, and pin it with a list whose term reads `Art. 5`

## 4. Preview rendering

- [ ] 4.1 Red: extend
  [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx) — a
  `DEFINITION_LIST` node renders a `<dl>` with one `<dt>`/`<dd>` per line and inline marks
  rendered; a stored `&nbsp;` field renders blank; a node whose content is not all pairs renders as
  plain Markdown instead; no number badge is rendered
- [ ] 4.2 Green: add the `DefinitionListNode` renderer in
  [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx) using
  `parseDefinitionList` and the `MARKDOWN_INLINE` render path (design D4)
- [ ] 4.3 Refactor: confirm the editing surface shows the raw `Term :: Value` source and that
  `Enter` inserts a newline (the `MARKDOWN` editing rule)

## 5. Type conversion & round-trip

- [ ] 5.1 Red/Green: add the `DEFINITION_LIST` entry to the toolbar's type buttons in
  [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx) and assert in
  [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts) that converting
  `CONTENT` ↔ `DEFINITION_LIST` carries the text and coerces the format to `MARKDOWN`
- [ ] 5.2 Red/Green: assert in [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts)
  that an envelope containing a `DEFINITION_LIST` imports and re-exports unchanged

## 6. Verification & docs

- [ ] 6.1 Run `npm run test` and confirm the entire suite is green
- [ ] 6.2 Run `npm run build` and `npm run typecheck` and confirm both succeed with no new errors
- [ ] 6.3 Round-trip a platform document containing a definition list (Demokratis → `?loadFile=` →
  export → upload) and confirm it renders as a `<dl>` on both sides and opens in the platform's
  field editor as a grid
- [ ] 6.4 Update [README.md](README.md) / [AGENTS.md](AGENTS.md) where they list the node types

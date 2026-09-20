## Why

`DEFINITION_LIST` is the second of the platform's two structured blocks and the last
document-body node type StructEdit does not know. It holds term/value pairs — fine schedules,
glossaries, "Begriff :: Bedeutung" tables that a legal draft lays out in two columns — as lines of
`Term :: Value` Markdown, rendered as `<dl><dt>…</dt><dd>…</dd></dl>` by the platform's CommonMark
extension.

The consequences are the same as for the other missing types, in both directions. A consultation
document containing a definition list cannot be opened in StructEdit at all: the envelope carries
the type, `isValidDocTreeEnvelope` does not know it, and the document is refused as an unsupported
format. And a source document that marks its pairs up as a `<dl>` loses that structure on import —
DOMPurify unwraps `<dl>`, `<dt>` and `<dd>`, and the terms and values arrive as an undifferentiated
run of text.

## What Changes

- A `DefinitionListDocumentNode` (`type: 'DEFINITION_LIST'`) joins the data model with the same
  shape as `TABLE`: a leaf carrying `id`, `number`, `contents` and `format`, with `MARKDOWN` as its
  only allowed format.
- `ALLOWED_CHILDREN` allows it under `DOCUMENT`, `HEADING` and `LIST_ITEM`, mirroring
  `DocNodeType::getAllowedChildTypes()`.
- The HTML importer keeps `<dl>` structures: the sanitizer allow-list gains `dl`/`dt`/`dd`, and
  every definition list becomes one node holding one `Term :: Value` line per pair, written by the
  platform's own storage rules (`blockSerializers.definition_list`): a blank field is stored as
  `&nbsp;`, a separator inside a field is defused by closing the spaces around it, and a term that
  would open a Markdown block is escaped at the line start.
- The preview renders the node as a real definition list, matching the platform's
  `DefinitionListProcessor`: all-or-nothing, one `<dt>`/`<dd>` pair per line, fields rendered as
  inline Markdown, and a plain Markdown fallback when a line is not a pair.
- The type selector can convert between `CONTENT` and `DEFINITION_LIST`, carrying the text and
  coercing the format to `MARKDOWN`.
- **Out of scope:** the field-grid editor, multi-value definitions (`<dt>` with several `<dd>`s
  becomes one value), and inferring definition lists from two-column tables or tab-separated
  prose.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `definition-list-nodes`: the `DEFINITION_LIST` node type — shape, placement, the `<dl>` importer
  and its separator/escaping rules, preview rendering, and envelope round-trip.

### Modified Capabilities

- `node-formatting`: `definition_list` joins the content-bearing types as the second
  structured block with a single-entry allow-list (`MARKDOWN`).

## Impact

- **Data model:** [src/types/document.ts](src/types/document.ts) — new interface and union members,
  `ALLOWED_CHILDREN` rows, `ALLOWED_FORMATS.DEFINITION_LIST`, `DEFAULT_FORMAT.DEFINITION_LIST`,
  and membership in `LEAF_TYPES`.
- **Separator rules:** a new `src/utils/definition-list.ts` holding the split/parse/format helpers
  — the counterpart of the platform's `DefinitionListSyntax` (reading) and
  `blockSerializers.definition_list` (writing) — used by both the importer and the renderer.
- **Importer:** [src/utils/document-utils.ts](src/utils/document-utils.ts) — `dl`/`dt`/`dd` in the
  DOMPurify allow-list and a `<dl>` branch in the walker.
- **Preview:** [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx)
  — a `DefinitionListNode` renderer.
- **Editor:** [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx) (type
  button); no change needed in [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) beyond
  what the `TABLE` change already generalises.
- **Sequencing:** fourth of the platform-parity series; assumes `add-table-node-type` (the
  structured-block scaffolding) and writes its `node-formatting` delta on top of that change's.
- **Tests:** [src/types/document.test.ts](src/types/document.test.ts), a new
  `src/utils/definition-list.test.ts`, [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts),
  and [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx).

## Why

Tables are ordinary content in Swiss legal drafts — fee schedules, deadlines, transition tables —
and StructEdit destroys every one of them. The HTML sanitizer in `parseHtmlToTree` allows no table
tags, so DOMPurify strips `<table>`, `<tr>`, `<td>` and leaves their text behind: a five-row fee
table arrives as a run of loose paragraphs with no rows, no columns, and no way to tell which
number belonged to which row. The repository's own DOCX fixtures say how normal this is — eight of
the ten live in `src/test/fixtures/realistic/docx/with_table/`.

The platform has the type StructEdit is missing: `DocNodeType::TABLE`, a leaf node whose content
is a GFM pipe table in `MARKDOWN` format, rendered as a table and — because it is a *structured
block* — diffed as a whole block so it can still carry counter-proposals. It is part of
`DOCUMENT_BODY_TYPES`, so it travels in the envelope both ways: a consultation document that
contains a table cannot be opened in StructEdit at all today, because `isValidDocTreeEnvelope`
rejects the unknown type and the whole document with it.

## What Changes

- A `TableDocumentNode` (`type: 'TABLE'`) joins the data model: a leaf carrying `id`, `number`,
  `contents` and `format`, with `MARKDOWN` as its only allowed format (the platform's
  `isStructuredBlock()` rule).
- `ALLOWED_CHILDREN` allows a table under `DOCUMENT`, `HEADING` and `LIST_ITEM` — matching
  `DocNodeType::getAllowedChildTypes()`, which does not allow one inside a `CONTENT_GROUP`.
- The HTML importer keeps tables: the sanitizer allow-list gains the table tags, and a `<table>`
  becomes one `TABLE` node whose content is a GFM pipe table — cell text converted to inline
  Markdown, `|` escaped, rows padded to the widest row. This covers DOCX too, since Mammoth
  converts Word tables to HTML tables.
- A table without a header row has its first row promoted to the header — the rule the platform's
  own table editor applies when it serialises (`blockSerializers.table`: "GFM has no header-less
  table: the delimiter always follows row 0").
- A `<caption>` becomes a `CONTENT` node immediately before the table rather than being dropped.
- The preview renders the table as a table, in a horizontally scrollable container — the same
  presentation as the platform's `table` block.
- The type selector can convert between `CONTENT` and `TABLE`; the content string is carried over
  and the format coerced to `MARKDOWN`, as `carryFormatOrDefault` already does.
- **Out of scope:** cell-grid editing (the platform's table editor) — a table is edited as its
  Markdown source here; merged cells, row-header cells and nested tables are flattened, not
  modelled; "Tabelle {n}" numbering is not ported.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `table-nodes`: the `TABLE` node type — shape, placement, the HTML/DOCX table importer, pipe-table
  serialization rules, preview rendering, and envelope round-trip.

### Modified Capabilities

- `node-formatting`: `TABLE` joins the content-bearing types with a single-entry allow-list
  (`MARKDOWN`), and the format selector stays hidden for it.

## Impact

- **Data model:** [src/types/document.ts](src/types/document.ts) — new interface and union
  members, `ALLOWED_CHILDREN` rows for `DOCUMENT`/`HEADING`/`LIST_ITEM`, `ALLOWED_FORMATS.TABLE`,
  `DEFAULT_FORMAT.TABLE`, and a leaf branch in `isValidNodeInternal` (`TABLE` joins `LEAF_TYPES`).
- **Importer:** [src/utils/document-utils.ts](src/utils/document-utils.ts) — table tags in the
  DOMPurify allow-list, a `<table>` branch in the walker, and a new `htmlTableToMarkdown` helper
  (cells through the existing `htmlToMarkdown(..., 'MARKDOWN_INLINE')`, pipes escaped).
- **Legal transforms:** [src/utils/legal-transforms/index.ts](src/utils/legal-transforms/index.ts)
  — the transforms walk `CONTENT`/`HEADING` nodes and must leave `TABLE` nodes untouched; verify
  no transform assumes every leaf is prose.
- **Preview:** [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx)
  — a `TableNode` renderer wrapping `MarkupBlock` in an `overflow-x-auto` container.
- **Editor:** [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx) (type
  button) and [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) (`changeNodeTypeInDoc`
  already coerces a disallowed format to the type's default).
- **Sequencing:** third of the platform-parity series; its `node-formatting` delta is written on top
  of `align-node-contract-with-platform`, and `add-definition-list-node-type` builds on the
  structured-block scaffolding introduced here.
- **Tests:** [src/types/document.test.ts](src/types/document.test.ts),
  [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts),
  [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx),
  and the existing `with_table` DOCX fixtures in
  [src/utils/file-processing.integration.test.ts](src/utils/file-processing.integration.test.ts),
  whose expectations change from "text survived somehow" to "one table node per table".

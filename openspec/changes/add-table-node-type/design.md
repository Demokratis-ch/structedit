## Context

`DocNodeType::TABLE` is one of the platform's two *structured blocks* (`isStructuredBlock()`, the
other is `DEFINITION_LIST`). Structured blocks are the platform's answer to content that is a
grid rather than prose:

- their only allowed format is `MARKDOWN` (`getAllowedContentFormats()`), so the content is a GFM
  pipe table stored as text;
- they are rendered as markdown inside a scroll container (`templates/docTree/_node_widgets.html.twig`,
  block `table`);
- they are diffed as a whole block instead of span by span, which is what lets them carry
  counter-proposals despite the block-level format (`DocNodeType::isStructuredBlock()`);
- the platform's editor reads them back into an R×C grid with `MarkdownTableParser` when — and
  only when — the delimiter row sits in position 2, i.e. the table has a header row, and writes
  them out through `blockSerializers.table` (`assets/javascript/block_serializers.js`): outer
  pipes, cells trimmed, `|` escaped as `\|`, and the delimiter row always emitted after row 0.

StructEdit's side of that contract is currently: nothing. `parseHtmlToTree`'s DOMPurify
configuration lists no table tags, and DOMPurify's default for a disallowed tag is to unwrap it,
so a table's cells survive as bare text nodes and land in whatever paragraph the walker is
building. The information that made it a table is gone before any transform runs.

This is change 3 of the platform-parity series. It shares the "structured block" shape with
change 4 (`add-definition-list-node-type`), which builds on the pieces introduced here.

## Goals / Non-Goals

**Goals:**

- A document containing tables opens in StructEdit, round-trips through the envelope, and reaches
  the platform as `TABLE` nodes that render as tables.
- A DOCX table (via Mammoth) and an HTML table produce the same result — one node per table.
- The stored content is a GFM pipe table that both `marked` (StructEdit's preview) and
  `MarkdownTableParser` (the platform's grid editor) read the same way.
- Nothing silently disappears: content a pipe table cannot express is flattened into cells, never
  dropped.

**Non-Goals:**

- No cell-grid editor. A table is edited as its Markdown source, which the `MARKDOWN` format's
  editing rules already support (`Enter` inserts a newline, `Cmd/Ctrl+Enter` submits).
- No modelling of merged cells, row-header cells, nested tables or per-column alignment beyond
  what GFM expresses.
- No "Tabelle {n}" numbering (`DocNode::getTableNumber()`); that is a platform display concern.
- No table creation from scratch beyond converting an existing node's type.

## Decisions

### D1. A table is a leaf whose content is a GFM pipe table

```ts
export interface TableDocumentNode {
  id: string;
  number: string | null;
  type: 'TABLE';
  contents: LocalizedText;
  format: NodeFormat; // only 'MARKDOWN'
}
```

`TABLE` joins `LEAF_TYPES` in `isValidNodeInternal`: no `children` field at all, exactly like
`FOOTNOTE` and `IMAGE`, and exactly what `JsonEnvelopeV1Parser` expects of a type whose allowed
children are empty. `ALLOWED_FORMATS.TABLE = ['MARKDOWN']` and `DEFAULT_FORMAT.TABLE = 'MARKDOWN'`,
mirroring `isStructuredBlock()`.

The `number` field stays in the shape because every non-`DOCUMENT` node carries one on the wire,
and an arriving number is preserved — but the editor offers no number editing for a table and the
preview renders no badge, matching `DocNodeType::hasNumber()`, which excludes `TABLE`.

### D2. Serialization: one node per table, header row always present

`htmlTableToMarkdown` walks the sanitized `<table>` and emits:

```
| Phase                   | max. Umdrehungen/Min |
| ----------------------- | -------------------- |
| Andämpfen der Zwiebel   | 20                   |
```

Rules, chosen to match `blockSerializers.table` on the way out and `MarkdownTableParser` on the
way back:

- **Cells** are rendered with the existing `htmlToMarkdown(cellHtml, 'MARKDOWN_INLINE')`, so
  emphasis, links and code spans inside a cell survive as inline Markdown.
- **Pipes** in cell text are escaped as `\|`, exactly as `tableCell()` does; the platform's PHP
  parser splits on unescaped pipes only.
- **Newlines** inside a cell collapse to a space: a pipe table row is one line, and the platform's
  parser splits on lines.
- **Ragged rows** are padded with empty cells to the widest row — again what the platform's parser
  does when reading.
- **Header**: `<thead>` rows, or a first row whose cells are `<th>`, become the header. A table
  with neither has its **first row promoted** to the header (D3).
- **Merged cells** (`colspan`/`rowspan`) place their text in the first cell they cover and pad the
  remaining covered positions with empty cells, keeping the grid rectangular.
- **Nested tables** are flattened: the inner table's cell texts are joined with spaces into the
  containing cell.
- **`<caption>`** is emitted as a `CONTENT` node immediately before the table node, which is how
  the platform already carries image captions (a `CONTENT` sibling, not a field).
- A table with no rows produces no node at all.

_Rejected: an HTML-in-Markdown fallback for complex tables._ Both renderers disable bare HTML
(`markedNoHtml` here, the platform's own renderer there), so an embedded `<table>` would be
dropped silently — worse than a flattened but visible grid.

### D3. A table without a header gets one

GFM has no header-less table: the delimiter row defines the columns, and a table whose delimiter
is not in position 2 renders as a paragraph of pipes in `marked` *and* in the platform's renderer.
The platform tolerates such content (its parser reports `hasHeader: false` and the editor falls
back to a textarea) but never renders it as a table.

So the importer promotes the first row when the source has no header — which is precisely what
the platform's own editor does on save: `blockSerializers.table` emits the delimiter after row 0
unconditionally, and its "has header" checkbox only changes how the grid is *displayed*. The
operator sees the result immediately in the preview — a table whose first row is the header — and
can fix the content if the promotion was wrong.

_Rejected: emitting the header-less form (delimiter row first)._ It round-trips through
`MarkdownTableParser` but renders as junk text on both sides, which trades a visible, correctable
approximation for an invisible one.

_Rejected: an empty header row._ It renders as a table with a blank first row, which looks like a
bug and costs a row of vertical space on every table in the document.

### D4. The preview renders the table, not the source

A `TableNode` renderer wraps `MarkupBlock` (the existing `MARKDOWN` render path, whose sanitizer
config already allows `table`/`thead`/`tbody`/`tr`/`th`/`td`) in an `overflow-x-auto` container —
the same markup the platform's `table` twig block produces. No new parser is needed in this change;
the pipe-table parse is only required for grid editing, which is a non-goal.

### D5. Transforms must not treat a table as prose

The legal transforms run over the imported tree looking for article headings, lettered items and
list numbering. A `TABLE` node's content is a grid whose cells routinely start with "Art. 5" or
"a." — exactly the patterns those transforms fire on. Each transform must skip `TABLE` nodes, and
the test suite pins that with a table whose first cell would otherwise be promoted to a heading.

### D6. TDD ordering (bottom-up)

1. `types/document.ts` — shape, placement, `MARKDOWN`-only allow-list, leaf validation.
2. `document-utils.ts` — `htmlTableToMarkdown` unit tests per rule in D2, then the importer branch.
3. `legal-transforms` — a table survives the transform pipeline unchanged.
4. `PreviewNodeRenderers.tsx` — a table renders as `<table>` inside a scroll container.
5. Integration — the `with_table` DOCX fixtures produce one `TABLE` node per table.

## Risks / Trade-offs

- **[Promoting a data row to a header changes the document]** → It is visible in the preview and
  reversible by editing the source; the alternative renders no table at all on either side.
- **[Merged cells lose their span]** → GFM cannot express them. The text stays, the grid stays
  rectangular, and the operator can see what happened; today the entire table is lost instead.
- **[An escaped pipe survives the platform's PHP parser but not its grid editor]** → The editor's
  `parseTableRow` splits on every `|` before unescaping, so a cell containing `\|` opens
  misaligned in the platform's grid modal (rendering and the PHP side are correct). A platform
  bug worth reporting, not a reason to drop the escape — the alternative is a cell that reads back
  as two.
- **[Widening the sanitizer allow-list]** → The added tags are structural and carry no
  attributes beyond what the existing `ALLOWED_ATTR` list permits; cell content still goes through
  `htmlToMarkdown`, and the render path still bans bare HTML.
- **[Existing integration snapshots change]** → Expected: those fixtures currently encode the
  destroyed-table behavior. The red step rewrites them to assert table nodes.

## Migration Plan

Additive to the model and to the importer: existing documents stay valid, no storage schema bump,
no change to any other node type. Documents imported *before* this change keep their flattened
text — re-importing the original file is the way to pick up tables. Rollback is a revert; a saved
document that already contains a `TABLE` node would then be reported incompatible by the recents
picker rather than mis-rendered.

## Open Questions

- **Cell-grid editing.** The platform's `table_editor_controller.js` edits cells in a grid, which
  is friendlier than raw pipes and is what makes the platform's whole-block diff readable. Porting
  it needs a pipe-table parser (a direct port of `MarkdownTableParser`) and a cell-editing surface;
  a follow-up once tables actually flow through the pipeline.
- **Column alignment.** GFM encodes it in the delimiter row (`:---`, `---:`). The importer emits
  plain `---` for every column; reading alignment out of `<td align>`/CSS is a separate question
  with its own DOCX quirks.

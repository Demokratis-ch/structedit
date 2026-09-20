## Context

The platform stores a definition list as plain Markdown text and recognises it at render time.
Three pieces define the contract, and each was read for this design:

- `DefinitionListSyntax` (`src/Domain/Markdown/DefinitionList/`) — the separator is `::` **with
  whitespace or a line boundary on both sides**, which is why `A::B` is ordinary text.
  `countSeparators()` and `split()` are the only places that knowledge lives on the reading side.
- `DefinitionListProcessor` (`src/Service/Commonmark/`) — a CommonMark `DocumentParsedEvent`
  handler that turns a paragraph into `<dl>` **only if every line of it is a pair**, with content on
  both sides; separators inside code spans or link labels do not count. One `<dt>`/`<dd>` per line.
- `blockSerializers.definition_list` (`assets/javascript/block_serializers.js`) — how the platform
  *writes* a list: `term :: value` per line; a blank field stored as `&nbsp;` ("a blank field would
  end the list, so it is stored as a space that renders as nothing"); a separator inside a field
  defused by closing the spaces around it (`escapeSeparator`: ` :: ` → `::`, since "\:" is not an
  escape at the processor's stage); and `escapeLineStart`, which backslashes a term that would
  open a block — `#`…`######`, `-`, `+`, `*` when followed by whitespace or end of line, `>`
  always, and the delimiter of `1.`/`1)` (as `1\.`, because `\1` is not an escape).

`MarkdownDefinitionListParser` reads that back for the platform's field editor: exactly one
separator per line, both fields non-empty after `&nbsp;` is folded to blank, line-start escapes
undone.

This is change 4 of the platform-parity series and the twin of change 3
(`add-table-node-type`): same node shape, same `MARKDOWN`-only rule, same placement. It is written
assuming change 3 is applied, because the two share the structured-block scaffolding — the
`LEAF_TYPES` membership, the `ALLOWED_CHILDREN` rows, and the toolbar's structured-block type
buttons.

## Goals / Non-Goals

**Goals:**

- A document containing definition lists opens, round-trips and reaches the platform as
  `DEFINITION_LIST` nodes that render as `<dl>`.
- Every line StructEdit writes is a line the platform's parser reads back as exactly one pair, and
  is byte-for-byte what the platform's own serializer would have written for the same fields.
- A `<dl>` always imports as one node — the platform's storage rules can express every field.
- The separator knowledge lives in one module, as it does on the platform.

**Non-Goals:**

- No field-grid editor; the node is edited as its Markdown source, like `TABLE`.
- No support for multi-value definitions (`<dt>` with several `<dd>`s) as distinct values.
- No inference of definition lists from two-column tables, tab-separated text, or bold-prefixed
  paragraphs.
- No change to how `CONTENT` nodes render: a `CONTENT` node whose Markdown happens to be all pairs
  renders as a definition list on the platform (the processor is global) and as plain text here.
  Aligning that is a renderer question, not a node-type question.

## Decisions

### D1. Same shape as `TABLE`

```ts
export interface DefinitionListDocumentNode {
  id: string;
  number: string | null;
  type: 'DEFINITION_LIST';
  contents: LocalizedText;
  format: NodeFormat; // only 'MARKDOWN'
}
```

A leaf (member of `LEAF_TYPES`), allowed under `DOCUMENT`, `HEADING` and `LIST_ITEM`, with
`ALLOWED_FORMATS.DEFINITION_LIST = ['MARKDOWN']`. Everything the structured-block scaffolding from
change 3 established applies unchanged; this decision is mostly a statement that the second
structured block introduces no second mechanism.

### D2. One module owns both directions of the syntax

`src/utils/definition-list.ts` mirrors `DefinitionListSyntax` for reading and
`blockSerializers.definition_list` for writing:

```ts
const SEPARATOR = /(?:^|[ \t])::(?:[ \t]|$)/;
countSeparators(line: string): number
splitPair(line: string): [term: string, value: string] | null
parseDefinitionList(source: string): Array<[string, string]> | null   // all-or-nothing
formatPair(term: string, value: string): string   // &nbsp; for blank, separators defused, line start escaped
```

`parseDefinitionList` returns `null` unless *every* line has exactly one separator with non-empty
fields — the same all-or-nothing rule the platform's processor applies — and both the importer and
the preview renderer use it, so they cannot disagree about what a definition list is. `formatPair`
is a line-for-line port of the platform serializer, including its three escapes, so a list written
here is indistinguishable from one saved in the platform's editor.

### D3. `<dl>` import always produces one node

The walker collects `<dt>`/`<dd>` elements in document order and emits one node whose content is
one `term :: value` line per pair. Field text goes through `htmlToMarkdown(html, 'MARKDOWN_INLINE')`,
so emphasis and links survive; newlines inside a field collapse to a space, because a pair is one
line. Then `formatPair` applies the platform's storage rules:

- a `<dt>` with no `<dd>`, or a `<dd>` with no preceding `<dt>`, gets `&nbsp;` for the missing side
  — the platform's representation of a blank field, which its parser folds back to blank;
- an empty field likewise becomes `&nbsp;`;
- a field that itself contains ` :: ` has the surrounding spaces closed (`A :: B` → `A::B`),
  exactly as the platform rewrites it on save;
- a term starting a block is escaped per `escapeLineStart`.

A `<dt>` followed by several `<dd>`s contributes one pair whose value is the `<dd>` texts joined
with a space.

_Rejected: falling back to `CONTENT` nodes for lists the pair model cannot express._ The platform's
serializer shows there is no such list: blank and missing fields have a representation, and an
inner separator has a defusing rule. Emitting content nodes would make StructEdit's output differ
from what the platform itself would store for the same `<dl>`.
_Rejected: a non-breaking space before an inner `::` to defuse it invisibly._ It would keep the
text visually intact but is not the platform's rule; `escapeSeparator` closes the spaces, and
matching it keeps the round trip byte-identical.

### D4. The preview renders `<dl>`, all-or-nothing

`DefinitionListNode` runs `parseDefinitionList` over the node's content and renders
`<dl><dt>…</dt><dd>…</dd></dl>`, each field rendered through the existing `MARKDOWN_INLINE` render
path (so a stored `&nbsp;` renders as the blank it stands for). When the parse returns `null` — a
hand-edited node mid-edit, or content that stopped being pairs — it falls back to rendering the
source as `MARKDOWN`, which is what the platform does when its processor declines the paragraph.

The sanitizer configuration for `MARKDOWN` has no `dl`/`dt`/`dd`, and it does not need them: the
renderer builds the list as React elements and only the *field* text goes through
`renderContent(..., 'MARKDOWN_INLINE')`.

### D5. TDD ordering (bottom-up)

1. `definition-list.ts` — separator counting, splitting, all-or-nothing parsing, the three escapes,
   and the round trip `formatPair` → `splitPair`.
2. `types/document.ts` — shape, placement, `MARKDOWN`-only.
3. `document-utils.ts` — `<dl>` import, blank/missing fields, inner separators, multi-`<dd>`.
4. `PreviewNodeRenderers.tsx` — `<dl>` rendering and the Markdown fallback.
5. Round-trip — an envelope containing a `DEFINITION_LIST` imports and re-exports unchanged.

## Risks / Trade-offs

- **[A definition list and a two-column table look alike in a source document]** → They are
  different node types with different editing models; the importer follows the source's markup
  (`<dl>` vs `<table>`) rather than guessing, and the operator can convert.
- **[Defusing an inner separator edits the user's text]** → By one or two spaces, in a way the
  platform would apply anyway on the first save; visible in the editing surface.
- **[`&nbsp;` in the editing surface]** → It is what the platform's editor stores and what an
  operator sees in the platform's raw textarea too; the preview renders it as blank.
- **[Escaping is invisible in the rendered view]** → A leading `\-` is visible in the Markdown
  source, which is what the user edits; the platform unescapes it on read, so the round trip is
  clean.

## Migration Plan

Additive: existing documents stay valid, no storage schema bump, no change to other node types.
Documents imported before this change keep their flattened text; re-importing the source picks the
lists up. Rollback is a revert, with the same "reported incompatible rather than mis-rendered"
behavior for any already-saved document that contains the new type.

## Open Questions

- **Should a `CONTENT` node whose Markdown is all pairs render as a definition list here too?** The
  platform's processor is global, so it does — meaning the same document can render differently in
  the two previews. Aligning would mean running `parseDefinitionList` inside the `MARKDOWN` render
  path for every content node; worth doing once there is evidence that real documents rely on it.
- **Field-grid editing.** Shares its answer with the table grid editor (change 3, Open Questions):
  both need a cell-editing surface, and the platform already has one for statements.

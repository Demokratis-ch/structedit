# Design

## Context

See proposal.md — Why. The DocTree v1 envelope is defined on the platform side by
`JsonEnvelopeV1Parser` / `JsonEnvelopeV1Serializer` (Demokratis repo,
`src/Domain/DocNode/Parser/`), which expose exactly the `DOCUMENT_BODY_TYPES` subset of
`DocNodeType`: `DOCUMENT`, `HEADING`, `CONTENT_GROUP`, `CONTENT`, `TABLE`, `DEFINITION_LIST`,
`LIST`, `LIST_ITEM`, `FOOTNOTE`, `IMAGE`. Interactive widgets, answers, page breaks and
cross-references are dropped on export and rejected on import, so they are not part of this
model. The rules this change mirrors, read from `DocNodeType::getAllowedChildTypes()`,
`getAllowedContentFormats()` and the parser's container/leaf handling:

| Type | Parents (JSON) | Children (JSON) | `contents`/`format` | Formats |
|---|---|---|---|---|
| `CONTENT_GROUP` | `DOCUMENT`, `HEADING` | `LIST`, `CONTENT`, `IMAGE` | required (emitted as empty strings) | `TEXT`, `NEWLINES` |
| `TABLE` | `DOCUMENT`, `HEADING`, `LIST_ITEM` | none (leaf, must omit `children`) | required | `MARKDOWN` |
| `DEFINITION_LIST` | `DOCUMENT`, `HEADING`, `LIST_ITEM` | none (leaf, must omit `children`) | required | `MARKDOWN` |

StructEdit's model already encodes the existing rules three ways that must stay in sync: the
per-node interfaces with exact `children` unions (issue #114), the runtime `ALLOWED_CHILDREN` /
`ALLOWED_FORMATS` tables, and a compile-time drift guard between the two. Every editor operation
(drag & drop, indent, type change) consults `canBeChildOf`, so the rules table is the one place
new structural rules need to land.

## Goals / Non-Goals

**Goals:**

- Envelopes exported by the platform that contain the three types open, edit, persist and export
  unchanged; envelopes StructEdit produces with them import on the platform.
- The model stays self-enforcing: exact child unions, runtime tables and drift guard all extend
  together; consumers that switch on `node.type` are exhaustive so TypeScript flags any
  forgotten branch.
- Editing is complete for the three types (render, select, number/text edit, move, convert,
  undo), not merely tolerated.
- Red-green TDD per [CLAUDE.md](CLAUDE.md); every scenario in the specs maps to a test.

**Non-Goals:**

- Producing the new types from HTML/DOCX input (the importer still flattens `<table>`/`<dl>`).
- Reconciling the other wire mismatches found alongside #150 (`FOOTNOTE` allowing `MARKDOWN`,
  unused `MARKDOWN_INLINE`, `LIST` numbers, image files). Each is its own change.
- A cell-level table editor or a term/value grid editor — the Markdown source is edited as text,
  as on the platform's plain-textarea fallback.
- Merging `TABLE` / `DEFINITION_LIST` nodes (joining two pipe tables yields a broken table).

## Decisions

### D1. `CONTENT_GROUP` mirrors the platform's wire shape, including `contents` and `format`

On the platform a group has `hasContent() === false` — it exists to carry an Absatz number above
a run of paragraphs — but the serializer's container list is hard-coded to `DOCUMENT`/`LIST`/
`LIST_ITEM`, so a group is exported *with* `contents` (empty strings per language) and a
`format`, and the parser *requires* both and rejects the node without them. StructEdit models
exactly that: `ContentGroupDocumentNode` carries `contents: LocalizedText` and
`format: NodeFormat` (`TEXT`|`NEWLINES`, default `TEXT`), the validator requires them, and
every group StructEdit creates sets `contents: {}` / `format: 'TEXT'` (the platform importer
turns `{}` plus a number into one content row in the fallback language). The UI never shows or
edits a group's text: it is a numbered container like `LIST_ITEM`.

_Rejected: modelling the group as a pure container (no `contents`/`format`) and translating at
the envelope boundary._ The repo's standing rule is that the envelope's `document` *is* the
in-memory tree with no translation layer (see the `SCREAMING_SNAKE_CASE` rename and the
envelope change), and the platform would reject the container shape today. If the platform later
moves `CONTENT_GROUP` into its container list, StructEdit follows with a small change that makes
the two fields optional and bumps the stored-schema version. Accepting any string in `contents`
(rather than insisting on empty) keeps a platform export valid even if a row carries stray text.

### D2. Three child unions instead of one

`LIST_ITEM` may not hold a `CONTENT_GROUP` and a group may hold only `LIST`/`CONTENT`/`IMAGE`,
so one `BlockDocumentNode` no longer describes every block-level `children` array:

- `BlockDocumentNode` — children of `DOCUMENT` and `HEADING` (adds the three types).
- `ListItemChildNode = Exclude<BlockDocumentNode, ContentGroupDocumentNode>` — children of
  `LIST_ITEM`.
- `ContentGroupChildNode = ListDocumentNode | ContentDocumentNode | ImageDocumentNode`.

The drift guard gains a `CONTENT_GROUP` row and the `LIST_ITEM` row now compares against
`ListItemChildNode`, so adding a type to one side without the other fails `tsc`.
`withMappedChildren` (the one place children arrays are rebuilt with a cast) gains the
`CONTENT_GROUP` case. _Rejected: keeping `LIST_ITEM.children: BlockDocumentNode[]` and relying on
runtime checks only_ — that silently loosens the guarantee issue #114 introduced.

### D3. Two notions of "content-bearing"

`ContentBearingNodeType` keeps its wire meaning — "carries `contents` and `format`" — and grows
to seven types so `ALLOWED_FORMATS`/`DEFAULT_FORMAT` stay exhaustive `Record`s. A narrower,
exported `hasEditableText(node)` predicate (every content-bearing type except `CONTENT_GROUP`)
replaces the ad-hoc `'contents' in node` checks that decide text-edit vs. number-edit in the
tree node, the keyboard handler and the toolbar's format selector. _Rejected: special-casing
`CONTENT_GROUP` at each call site_ — three call sites already diverged once (#136).

### D4. `TABLE` and `DEFINITION_LIST` are leaves with a single format

They join `LEAF_TYPES` (a `children` key is invalid) and get `ALLOWED_FORMATS` of
`['MARKDOWN']` with `DEFAULT_FORMAT` `MARKDOWN`. The format selector therefore shows one option
for them; that is deliberate (the platform rejects anything else) and cheaper than another
exclusion rule. `number` is kept on both for model uniformity (every non-root node has one; the
platform stores but does not display it).

### D5. Type conversions reuse the existing in-place / wrap / lift patterns

`changeNodeTypeInDoc` grows three targets. Each follows a pattern that already exists:

- **Text node → `TABLE`/`DEFINITION_LIST`** (in place, like `→ FOOTNOTE`): keep `id`, `number`,
  `contents`; `format` becomes `MARKDOWN`; children of a `HEADING`/`CONTENT` are lifted as
  following siblings exactly as `→ FOOTNOTE` does. `TABLE` ↔ `DEFINITION_LIST` is an in-place
  swap. The existing `canBeChildOf(targetType, parent)` guard (#149) refuses the conversion
  where the parent cannot hold the result (e.g. a footnote under a content node).
- **`TABLE`/`DEFINITION_LIST` → `HEADING`/`CONTENT`/`FOOTNOTE`/`LIST`**: the existing generic
  branches already handle any node with `contents`, carrying the format where allowed
  (`MARKDOWN` survives on `CONTENT`/`FOOTNOTE`, resets to `TEXT` on `HEADING`).
- **`CONTENT`/`LIST` → `CONTENT_GROUP`** (wrap, like `→ LIST`): a new group takes the node's
  `number`, `contents: {}`, `format: 'TEXT'`; the node keeps its `id` and its `number` becomes
  `null` (the group now renders it inline). Refused when the parent cannot hold a group (inside
  a `LIST_ITEM` or another group) and for every other source type — a heading's text would
  silently disappear into an unrendered field.
- **`CONTENT_GROUP` → `CONTENT`** (dissolve, like `LIST → CONTENT`): children are lifted in
  place; the group's `number` moves onto the first child when it is a `CONTENT` without a
  number, otherwise a placeholder `CONTENT` carrying the number is inserted first (the same
  placeholder rule `flattenListToContents` uses). Other targets are refused.
- `LIST_ITEM`/`LIST` → `TABLE`/`DEFINITION_LIST` are refused (`null`), matching `LIST_ITEM →
  FOOTNOTE`.

`CONTENT_GROUP` joins `MERGEABLE_TYPES` with `LIST_ITEM` semantics (children concatenated, first
id/number kept); the two leaf types do not (Non-Goals).

### D6. Tree editor and keyboard

`RecursiveTreeNode` renders a `CONTENT_GROUP` like a `LIST_ITEM` — editable number badge plus a
`(content_group)` label, children nested — and renders `TABLE`/`DEFINITION_LIST` like `CONTENT`
(number badge plus the `ContentBlock` in `MARKDOWN`). Enter on a selected group opens number
edit (the `LIST`/`LIST_ITEM` rule, via `hasEditableText`). Shortcuts: `B` table, `D` definition
list, `G` content group — the first free, memorable letters (`t`/`c` are taken by content,
`m` by merge). Toolbar buttons use the lucide `Table`, `BookA` and `Group` icons and the same
`(B)`/`(D)`/`(G)` title convention the tests key on.

### D7. Preview rendering

- `TABLE`: the existing `MARKDOWN` renderer already allows `table`/`thead`/`tbody`/`tr`/`th`/`td`
  through DOMPurify, so a pipe table renders with no new renderer; it is wrapped in an
  `overflow-x-auto` block (the platform does the same).
- `DEFINITION_LIST`: a pure `parseDefinitionList(source)` util mirrors the platform's
  `DefinitionListSyntax` — the separator is `::` surrounded by whitespace (or line boundary),
  split at the first separator, both sides non-empty — and returns term/value pairs or `null`
  when any non-empty line fails, in which case the node falls back to the `MARKDOWN` block
  renderer (what the platform's paragraph path shows too). Pairs render as `<dl><dt><dd>` with
  each side through `MARKDOWN_INLINE`.
- `CONTENT_GROUP`: the number renders inline before its first child when that child is a
  `CONTENT` (`rendersNumberInline()` on the platform), otherwise on its own line above the
  children; the inline-numbered first child's own number is suppressed only when it is `null`.

### D8. No storage migration

The change is additive: `SCHEMA_VERSION` stays 2, `migrateEntry` keeps validating with
`isValidDocument`, which now accepts the new types. A test pins that an existing v2 entry
without the new types loads unchanged and that a v2 entry containing them loads. _Rejected:
bumping to v3_ — nothing about existing entries changes, and a bump would mark every entry
written by a newer build as incompatible in an older one for no benefit.

### D9. Fixture is a faithful platform export

`src/test/fixtures/demokratis-doctree-export.json` is hand-written to the serializer's exact
output shape (base58 ids, `number: ''` on nodes the platform does not number, `contents` with
empty strings on the group, `number: null` on the root). It drives the upload, `loadFile` and
export round-trip tests so the contract is exercised end to end rather than per function.

## Risks / Trade-offs

- [The platform changes `CONTENT_GROUP` to a container shape] → StructEdit's validator would
  then reject new exports. Mitigation: D1 documents the follow-up (make the two fields optional,
  bump schema); the platform side has no round-trip test for groups yet — flagged in the PR.
- [A group's hidden `contents` could carry text from the platform that StructEdit never shows]
  → The type indicator still shows the node type; the text is preserved byte-for-byte on export,
  so nothing is lost. Showing it would contradict the platform's own rendering.
- [`B`/`D`/`G` shortcuts land on keys users may press by accident] → Same risk profile as the
  existing single-letter shortcuts; they only fire with a selection and outside edit mode.
- [Lifting children as siblings when converting to a leaf changes structure] → Mirrors the
  existing `→ FOOTNOTE` behaviour; covered by tests and undoable in one step.
- [Definition-list parsing diverges from the platform's CommonMark-based processor on exotic
  input (separators inside code spans)] → The fallback is the plain `MARKDOWN` render, never a
  broken layout; the separator regex is copied verbatim from `DefinitionListSyntax`.

## Migration Plan

Single PR, purely additive. No stored data changes, no config, no dependencies. Rollback is a
revert; documents saved with the new types would then fail validation in the reverted build and
surface as incompatible recents entries, which is the existing, visible failure mode.

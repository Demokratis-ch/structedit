# Proposal

## Why

The Demokratis platform's DocTree has three node types StructEdit does not know —
`CONTENT_GROUP`, `TABLE` and `DEFINITION_LIST` (issue
[#150](https://github.com/Demokratis-ch/structedit/issues/150)). The platform's "hand off to
StructEdit" action serializes them into the DocTree v1 envelope, and StructEdit rejects any
envelope that contains an unknown type, so every consultation document that uses one of them
currently fails to open with the unsupported-format error and cannot be round-tripped at all.

## What Changes

- Add three node types to the data model, mirroring the platform's `DocNodeType` rules exactly
  as its JSON parser and serializer expose them:
  - `CONTENT_GROUP` — a numbered container for an Absatz and its sub-items (children: `LIST`,
    `CONTENT`, `IMAGE`); allowed under `DOCUMENT` and `HEADING` only, never under `LIST_ITEM`
    and never nested.
  - `TABLE` — a GFM pipe table; a content-bearing leaf whose only format is `MARKDOWN`.
  - `DEFINITION_LIST` — "Term :: Value" lines; a content-bearing leaf whose only format is
    `MARKDOWN`.
- Extend the parent→child rules: `DOCUMENT` and `HEADING` additionally accept all three types;
  `LIST_ITEM` additionally accepts `TABLE` and `DEFINITION_LIST`.
- Extend the per-type format rules: `TABLE`/`DEFINITION_LIST` → `MARKDOWN` only (default
  `MARKDOWN`); `CONTENT_GROUP` → `TEXT|NEWLINES` (default `TEXT`), carried for wire fidelity
  only — the platform emits and requires `contents`/`format` on a group although it never
  displays them.
- Validation (`isValidNode`/`isValidDocument`/`isValidDocTreeEnvelope`) accepts the new shapes
  and rejects the rules' violations, so platform envelopes open via file upload and `loadFile`
  and export unchanged.
- Editor support so such documents are editable, not merely loadable: the three types render in
  the tree and in the Preview; a `CONTENT_GROUP` edits its number (like a list item); `TABLE`
  and `DEFINITION_LIST` edit their Markdown source; the toolbar and keyboard offer conversions —
  text nodes ↔ `TABLE`/`DEFINITION_LIST`, and `CONTENT`/`LIST` ↔ `CONTENT_GROUP` (wrap /
  dissolve). Drag & drop, indent/outdent and type changes keep honouring the child rules
  because they already consult the single rules table.
- Non-breaking: purely additive at runtime, no stored-schema bump, existing documents load
  unchanged.
- **Out of scope** (tracked separately): the HTML/DOCX importer emitting the new types, the
  `FOOTNOTE`/`MARKDOWN_INLINE` format mismatches with the platform, image files, and the
  questionnaire / contribution-mode draft PRs.

## Capabilities

### New Capabilities

- `document-model`: the node type set, each type's shape (`number`, `contents`, `format`,
  `children`), the parent→child rules, and the validation that enforces them for documents at
  rest and on the wire.
- `node-type-editing`: how the editor edits each node type (text vs. number editing) and how
  selected nodes convert between types from the toolbar and keyboard, including wrap/dissolve
  semantics for container types.
- `document-preview`: how the rendered Preview pane lays out node types — number placement,
  tables and definition lists.

### Modified Capabilities

- `node-formatting`: the content-bearing type list, the per-type format allow-lists and
  defaults, and the toolbar format-selector rules gain the three types.

## Impact

- **Types:** [src/types/document.ts](src/types/document.ts) — three node interfaces, new child
  unions (`ListItemChildNode`, `ContentGroupChildNode`), extended `BlockDocumentNode`,
  `ParentDocumentNode`, `ParentType`, `ContentBearingNodeType`, `ALLOWED_CHILDREN`,
  `ALLOWED_FORMATS`, `DEFAULT_FORMAT`, the compile-time drift guard, validator branches, an
  `hasEditableText` predicate, and the example document.
- **Tree primitives:** [src/utils/tree-utils.ts](src/utils/tree-utils.ts) —
  `withMappedChildren` learns the new container; the content-bearing list is shared with the
  model.
- **Tree mutations:** [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) — new
  conversion targets, wrap/dissolve for `CONTENT_GROUP`, merge rules.
- **Hooks:** [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) (type-change
  signature), [src/hooks/useKeyboardShortcuts.ts](src/hooks/useKeyboardShortcuts.ts)
  (shortcuts `B`/`D`/`G`, text-vs-number edit decision).
- **Components:** [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx),
  [src/components/TreeEditor.tsx](src/components/TreeEditor.tsx),
  [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx),
  [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx), plus a
  small pure `definition-list` parsing util mirroring the platform's separator rule.
- **Tests:** every file above has a `*.test.*` neighbour; a new fixture under
  [src/test/fixtures/](src/test/fixtures/) is a platform export containing all three types and
  drives the upload / `loadFile` / export round-trip tests.
- **Docs:** [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) type list.
- **No new dependencies, no data migration, no config changes.**

## Context

`types/document.ts` models six node types; the Demokratis document body has ten
(`DocNodeType::DOCUMENT_BODY_TYPES`). `CONTENT_GROUP` is the first of the three missing ones, and
the one whose absence is hardest to work around, because the group is not decoration: it is where
an Absatz number lives when the Absatz has sub-items.

The platform's shape, read off `DocNodeType` and `DocTreeBuilder::addGroupedAbsatz()`:

```
HEADING  "Art. 4"
└── CONTENT_GROUP  number "1"          ← no text of its own
    ├── CONTENT    "Wer Risotto rührt, …"
    └── LIST
        ├── LIST_ITEM  number "a."  └── CONTENT "…"
        └── LIST_ITEM  number "b."  └── CONTENT "…"
```

Two details of the platform model drive most of the decisions below:

1. **A group carries `contents`/`format` on the wire even though it has no text.** A Demokratis
   node's number lives on its `DocNodeContent` row, so a numbered node must have one;
   `JsonEnvelopeV1Parser` treats only `DOCUMENT`, `LIST` and `LIST_ITEM` as container types and
   therefore *requires* `contents` and an allowed `format` on a `CONTENT_GROUP`. Its own
   `DocNodeType::hasContent()` excludes the group, so the platform editor never offers text for it.
2. **Number placement is a rendering rule with a condition.** `DocNode::rendersNumberInline()`
   returns true only when the group's first active child is a `CONTENT` node; the twig blocks
   `content_group` and `content` in `templates/docTree/_node_widgets.html.twig` then render the
   number at the start of that child, or above the children when the condition fails.

This is change 2 of the platform-parity series. It is independent of change 1
(`align-node-contract-with-platform`) except in the `node-formatting` delta, which is written as
if change 1 is already applied, and in following that change's `node-numbering` rule: the group is
a numbered type (`DocNodeType::hasNumber()` includes it), so it gets the editable badge that
`LIST` no longer has.

## Goals / Non-Goals

**Goals:**

- A DocTree envelope containing `CONTENT_GROUP` nodes opens in StructEdit, survives editing, and
  exports byte-identically where it was not edited.
- The preview shows a grouped Absatz the way the platform (and the source document) lay it out,
  including the conditional number placement.
- An operator can *create* the structure from a captured document, so a StructEdit import can
  reach the shape the platform expects without hand-editing on the platform afterwards.
- The parent/child rules mirror `DocNodeType::getAllowedChildTypes()` exactly, so StructEdit
  cannot build a tree the platform's importer rejects.

**Non-Goals:**

- No automatic group inference during import. Deciding that "Absatz 1 plus the lettered list
  under it" is one group is a legal-transform question with its own failure modes; this change
  gives the operator the operation, not a guess.
- No text editing on a group, and no attempt to render its `contents` if some producer puts text
  there — the field is carried, not used.
- No `READONLY` or `CROSS_REFERENCE` children: neither type exists in the JSON format at all.
- No numbering automation (renumbering siblings, deriving "a./b./c.") beyond what the group takes
  over from the node it wraps.

## Decisions

### D1. The group is a container that carries `contents`/`format`

```ts
export interface ContentGroupDocumentNode {
  id: string;
  number: string | null;
  type: 'CONTENT_GROUP';
  contents: LocalizedText;
  format: NodeFormat;
  children: (ContentDocumentNode | ListDocumentNode | ImageDocumentNode)[];
}
```

This breaks the model's current two-way split (container-only nodes carry no `contents`/`format`;
content-bearing nodes do). The group is a third case: structurally a container, but content-bearing
on the wire. `isValidNode` gets an explicit branch rather than a new membership in
`CONTAINER_TYPES` or `LEAF_TYPES`, and `ContentBearingNodeType` gains `CONTENT_GROUP` so
`canHaveFormat` covers it.

_Rejected: modelling the group as a container and synthesising `contents: {}` on export._ The
envelope parser rejects a `CONTENT_GROUP` without `contents`, and a synthesised empty object would
silently discard whatever the platform sent — the round trip has to be faithful for fields we do
not use, not just the ones we do.

_Rejected: a `UI-only` marker type that disappears on export._ It would make the group unreachable
for the editor operations (selection, drag, undo) that every other node gets for free.

### D2. Placement rules mirror `DocNodeType::getAllowedChildTypes()`

`ALLOWED_CHILDREN` becomes:

| Parent          | Allowed children                                                            |
| --------------- | --------------------------------------------------------------------------- |
| `DOCUMENT`      | `CONTENT_GROUP`, `HEADING`, `LIST`, `CONTENT`, `FOOTNOTE`, `IMAGE`          |
| `HEADING`       | `CONTENT_GROUP`, `HEADING`, `LIST`, `CONTENT`, `FOOTNOTE`, `IMAGE`          |
| `LIST_ITEM`     | `HEADING`, `LIST`, `CONTENT`, `FOOTNOTE`, `IMAGE` — **no** `CONTENT_GROUP`  |
| `CONTENT_GROUP` | `CONTENT`, `LIST`, `IMAGE`                                                  |
| `LIST`          | `LIST_ITEM`                                                                 |
| `CONTENT`       | `FOOTNOTE`                                                                  |

`LIST_ITEM` losing its symmetry with `DOCUMENT`/`HEADING` is deliberate: the platform's
`$defaultSet` does not contain `CONTENT_GROUP`, and a group inside a list item would be a second
numbering scheme inside a numbered item. A group inside a group is likewise not allowed —
`CONTENT_GROUP` is not in its own row.

The existing `_AllowedChildrenMatchesTypes` compile-time guard is extended with a `SameSet` row
for `CONTENT_GROUP`, so the runtime table and the typed `children` union cannot drift.

### D3. The preview implements the conditional number rule

`ContentGroupNode` renders no heading and no text. Its number is rendered:

- **inline**, as the leading badge of its first child, when that first child is a `CONTENT` node;
- **above the children**, on its own line, otherwise (first child is a `LIST` or `IMAGE`, or the
  group is empty).

When the number travels inline and the receiving `CONTENT` child has a number of its own, both are
rendered — the inherited one first — matching the `content` block in
`templates/docTree/_node_widgets.html.twig`. Numbers render through the existing
`NumberMarkup`/MARKDOWN_MINIMAL path on both sides, so `^1^` superscripts behave as they do today.

The *tree* view (left pane) does not move numbers around: every node shows its own number where it
always has. The inline rule is a statement about the rendered document, and the tree is a
structural view — hiding a group's number there would make the node look unnumbered while editing.

_Rejected: always rendering the group number above the children._ It is one `if` away from the
platform and would show a visibly different document in the pane the operator compares against the
original.

### D4. Group / ungroup, not a type change

Converting a `CONTENT` node to a `CONTENT_GROUP` through the type selector would be meaningless —
the text would have nowhere to go. The editor instead gets two structural operations:

- **Group**: given a selected `CONTENT` node, wrap it in a new `CONTENT_GROUP` inserted at its
  position; the group takes the node's `number` and the node's own number is cleared; any
  immediately following `LIST` or `IMAGE` siblings that were also selected move into the group.
  Refused (no-op, no history entry) when the selection's parent cannot hold a group (i.e. inside a
  `LIST_ITEM`) or when the selection is not a contiguous run of groupable siblings.
- **Ungroup**: replace a `CONTENT_GROUP` with its children in place; if the group carried a number
  and its first child is a `CONTENT` without one, that child inherits the number, so ungrouping
  does not silently drop it.

Each operation commits exactly one history entry, like every other structural operation.

One detail of the existing editor has to change for the group: `useKeyboardShortcuts` decides
between text edit and number edit on `Enter` with `'contents' in node`, which is true for a
group. The decision moves to the node type, so a selected group opens number edit — the same
surface `LIST_ITEM` gets — and never a text editor for a field the platform does not display.

_Rejected: adding `CONTENT_GROUP` to the toolbar's type buttons._ Type changes preserve content;
these two operations restructure the tree, which is what `indent`/`outdent`/`merge` already model.

### D5. TDD ordering (bottom-up)

1. `types/document.ts` — the interface, the tables, validation (accept/reject matrix incl. the
   `LIST_ITEM` and nested-group refusals, and `contents`/`format` requirements).
2. `tree-mutations.ts` — group/ungroup, number hand-off, refusal cases.
3. `useTreeOperations` — one history entry per operation; undo restores the previous tree.
4. `PreviewNodeRenderers.tsx` — both number placements, plus the inherited + own number case.
5. End to end — a fixture envelope with a grouped Absatz imports, edits, and exports unchanged.

## Risks / Trade-offs

- **[A third node category complicates `isValidNode`]** → It is one explicit branch, and the
  alternative (pretending the group is content-bearing or container-only) misvalidates real
  platform documents in one direction or the other.
- **[Operators may not discover the group operation]** → Acceptable for this change: documents
  that *contain* groups now work, which is the blocking problem; discoverability of the creation
  path can be improved once there is usage to learn from.
- **[Ungroup can produce a number collision]** → Only when the group and its first child both
  carry numbers; the rule above hands the number over only when the child has none, so nothing is
  overwritten.
- **[The `contents` field is carried but unused]** → Deliberate: faithful round-trip beats a
  tidier type. Validation still requires the field to be shaped correctly and its format to be
  allowed, so a malformed producer is caught.

## Migration Plan

Purely additive to the model: every tree that is valid today stays valid, no stored-entry schema
change, no change to the HTML/DOCX import path. Rollback is a revert; a document that was already
saved with a group would then be reported incompatible by the recents picker rather than
mis-rendered, which is the existing, correct behavior for an unknown node type.

## Open Questions

- **Should the importer eventually infer groups?** The legal transforms already recognise Absatz
  numbers and lettered items (`legal-transforms/lettered-items.ts`,
  `legal-transforms/list-number-dedup.ts`), which is most of the signal needed. Left for a
  follow-up with its own fixtures, once the round trip is in place and there are real documents to
  measure the inference against.
- **Should a group with no number be rejected?** The platform allows it (the number field is
  nullable for every node type), so validation accepts it; whether the editor should warn about a
  numberless group is a UI question, not a model one.

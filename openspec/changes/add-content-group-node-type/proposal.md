## Why

A Demokratis doc tree can contain `CONTENT_GROUP` nodes — a numbered *Absatz* group that holds
the paragraph text plus its lettered sub-items ("a.", "b.", …) under one number
(`DocTreeBuilder::addGroupedAbsatz()`). The type is part of `DocNodeType::DOCUMENT_BODY_TYPES`,
so `JsonEnvelopeV1Serializer` emits it into the envelope handed to StructEdit over `?loadFile=`.

StructEdit's data model has no such type, and `isValidDocTreeEnvelope` rejects any node type it
does not know. So today a consultation document that uses grouped Absätze does not open with a
missing group or a flattened one — it does not open at all: the user gets "Couldn't read the
document — it wasn't in a supported format." for the whole document. The reverse direction is
just as blocked: a document captured from HTML in StructEdit can never be given the grouping the
platform expects, so an editor has to rebuild it by hand on the platform after every import.

The group is also the only node whose *number placement* is structural rather than cosmetic: the
platform renders a group's number inline at the start of its first `CONTENT` child, and above the
children otherwise. Getting that wrong in the preview would misrepresent the document the operator
is checking against the original.

## What Changes

- A `ContentGroupDocumentNode` (`type: 'CONTENT_GROUP'`) joins the data model: `id`, `number`,
  `contents`, `format`, and `children` restricted to `CONTENT`, `LIST`, and `IMAGE`.
- `ALLOWED_CHILDREN` gains the group under `DOCUMENT` and `HEADING` **only** — not under
  `LIST_ITEM` and not nested inside another group, mirroring
  `DocNodeType::getAllowedChildTypes()`. The compile-time drift guard is extended to the new row.
- The group carries `contents`/`format` on the wire (the platform hangs a node's number off a
  content row, so the envelope parser treats it as content-bearing) but holds no text: the editor
  offers number editing only, and preserves whatever `contents` value arrived.
- The preview renders the platform's number rule: a group's number appears inline at the start of
  its first `CONTENT` child, and on its own line above the children when the first child is
  anything else.
- The editor gains a group/ungroup operation: wrapping a selected `CONTENT` (plus any following
  `LIST`/`IMAGE` siblings) in a group that takes over its number, and unwrapping a group back into
  its parent — each one history entry.
- **Out of scope:** inferring groups automatically during HTML/DOCX import (the legal transforms
  stay as they are), `READONLY`/`CROSS_REFERENCE` children the JSON format cannot carry anyway,
  and any change to how numbers are stored or formatted.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `content-group-nodes`: the `CONTENT_GROUP` node type — shape, placement rules, validation,
  envelope round-trip, number rendering, and the group/ungroup editor operation.

### Modified Capabilities

- `node-formatting`: the format rules gain a row for `CONTENT_GROUP` (`TEXT`/`NEWLINES`), the
  "content-bearing vs container-only" split stops being a two-way split — the group is a container
  that nevertheless carries `contents`/`format` — and `Enter` on a selected group opens number edit
  rather than the text edit its `contents` field would otherwise trigger.

## Impact

- **Data model:** [src/types/document.ts](src/types/document.ts) — new interface, new members of
  `DocumentNode`/`BlockDocumentNode`/`ParentDocumentNode`/`ParentType`, new `ALLOWED_CHILDREN`
  rows for `DOCUMENT`/`HEADING`/`CONTENT_GROUP`, `ALLOWED_FORMATS`/`DEFAULT_FORMAT` entries, and
  the `isValidNodeInternal` branch. The `_AllowedChildrenMatchesTypes` guard keeps the runtime
  table and the typed unions in sync.
- **Tree operations:** [src/utils/tree-utils.ts](src/utils/tree-utils.ts) (the group descends like
  any other parent) and [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) — `groupNodes` /
  `ungroupNode`, plus the existing parent-guard in `changeNodeTypeInDoc` seeing the new rows.
- **Editor:** [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) (operation +
  history entry), [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx)
  (group/ungroup action), [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx)
  (no text edit for the group; number edit as for `LIST_ITEM`).
- **Preview:** [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx)
  — a `ContentGroupNode` renderer plus the inherited-number path in `ContentNode`.
- **Sequencing:** second of the platform-parity series; its `node-formatting` delta is written on
  top of `align-node-contract-with-platform`, whose `node-numbering` rule the group follows
  (`DocNodeType::hasNumber()` includes `CONTENT_GROUP`, so the group keeps an editable number).
- **Persistence:** no schema bump — a tree containing the new type is valid under the current
  schema version; older entries are unaffected.
- **Tests:** [src/types/document.test.ts](src/types/document.test.ts),
  [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts),
  [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx),
  and a realistic fixture carrying a grouped Absatz through import → edit → export.

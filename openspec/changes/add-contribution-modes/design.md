## Context

The DocTree model ([src/types/document.ts](src/types/document.ts)) is a closed, drift-guarded set of
node types: `DocumentNode` is a fixed union, `ALLOWED_CHILDREN` is
`as const satisfies Record<…>`, and a type-only assertion ties the runtime child table to the typed
`children` unions. Anything added per-node has to fit that shape or the compiler complains first.

The precedent for this change is `add-per-node-formatting-mode`: a Demokratis platform concept
(`NodeFormat`) ported per node, with a per-type allow-list next to the type definitions, a
`canHaveFormat` helper shared by validation and UI, and a toolbar control. Contribution modes follow
the same skeleton, so this document records only where they *differ* from that precedent, plus the
decisions the code does not state at the point of use.

The one structural difference driving most of what follows: a format is **required and defaulted**
(`DEFAULT_FORMAT` gives every content-bearing type a value), whereas a contribution mode is
**optional and its default is absence**. Demokratis stores `null` for "use the element-type default",
and that default lives on the platform side, not here — StructEdit must be able to say "nothing set"
distinctly from any concrete value.

## Goals / Non-Goals

**Goals**
- A faithful, wire-compatible port of `DocNodeContributionMode`, round-tripping through the DocTree
  envelope unchanged.
- Set a mode at every scale a structurer actually works at: one node, a selection, a subtree, the
  whole document — each a single undoable step.
- Make it impossible to author a tree that fails validation via the mode controls.
- See at a glance which nodes carry a mode.

**Non-Goals**
- Inferring modes during HTML/DOCX import. Nothing in a source document expresses this; it is an
  authoring decision.
- Rendering modes in the read-only Preview pane. The Preview mirrors the *document*, and modes are
  editorial metadata; the tree is where they are set and read. Revisit if structurers ask for it.
- Any participant-side behaviour — annotating, proposing, diffing — which is entirely Demokratis's.
- Per-node overrides of what a mode *means* (e.g. per-node proposal deadlines). Demokratis persists
  none either.

## Decisions

- **D1 — Absence is the default, and it is a real absence.** `contributionMode?: ContributionMode`
  on every node, and clearing a mode `delete`s the key rather than writing `undefined`. So a cleared
  node is byte-identical to a never-set one after `JSON.stringify`, and the envelope stays free of
  noise for the overwhelmingly common case of a document with a handful of marked nodes.
  _Rejected: a `'DEFAULT'` member of the union_ — it would serialize a value where Demokratis
  expects `null`, and make "unset" and "explicitly default" indistinguishable in the model while
  looking different on the wire.

- **D2 — The allow-list is per node type, and it is a compile-time guard.** `ALLOWED_MODES` is
  `as const satisfies Record<DocumentNode['type'], ContributionMode[]>`, so adding a node type
  without declaring its modes is a build error — the same protection `ALLOWED_CHILDREN` has. Only
  `PROPOSAL` is actually restricted (to `PROPOSABLE_TYPES`: heading, content, footnote), mirroring
  Demokratis `DocNodeType::isProposable()`: a proposal is a diff against text, so it is undefined on
  a container or an image. `NONE` and `REMARK` are universal — locking or annotating a list or the
  document as a whole is meaningful.

- **D3 — Every node type is eligible, including the root and containers.** Unlike `format`, which
  only content-bearing types carry, a mode on a container is a genuine authorial statement ("this
  whole list is locked"). This is why the validation branch sits *outside* the container/leaf split
  in `isValidNodeInternal`, and why `setNodeContributionMode` has no type gate where
  `changeNodeFormat` does. The document root is included so "lock the whole document" has somewhere
  to live.

- **D4 — Bulk applies clamp per node; they never fail and never partially corrupt.** A bulk apply
  writes the mode only to nodes whose type allows it and silently leaves the others alone, rather
  than rejecting the whole operation or writing a mode the validator would reject on re-import.
  Selecting a heading and a list and pressing `PROPOSAL` marks the heading and leaves the list at
  its default — the reading a structurer expects, and the only one that keeps the tree valid.
  The same clamp is applied at every layer (`setNodeContributionMode`, `setSubtreeContributionMode`,
  the type-change carry) so no caller can bypass it.

- **D5 — The pickers refuse applies that would do nothing.** `PROPOSAL` is disabled when the
  selection has no proposable node, and when the node-type filter names a non-proposable type. D4's
  clamp makes such an apply harmless but *silent*, which reads as a broken button. The check derives
  from `canHaveMode` rather than restating the type list, so it tracks `ALLOWED_MODES`.

- **D6 — Three operations, not one general one.** `changeNodeContributionMode` (the selected nodes),
  `changeSubtreeContributionMode` (each selected node plus descendants), and
  `changeDocumentContributionMode` (everything). The third is the second applied at the root path,
  and the difference between the first two is a user-visible choice ("This" / "+ Inside"), not an
  implementation detail — collapsing them into one function with a flag would just move the branch.
  `changeSubtreeContributionMode` runs `keepOutermostIds` first, so selecting a node *and* its child
  applies the subtree once instead of twice.

- **D7 — No index rebuild between iterations.** The other multi-node operations rebuild indices as
  they go because they move nodes. Setting a mode replaces node objects in place and never changes
  the tree's shape, so every path captured up front stays valid for the whole batch and processing
  order cannot matter. Tests pin the order-independence rather than the implementation.

- **D8 — Mode carrying follows identity, not content.** Wherever a mutation preserves a node's
  `id`/`number`, it preserves its mode too, clamped to the new type: type changes carry
  (`carryModeOrClamp` — the analogue of `carryFormatOrDefault`, except a disallowed mode clamps to
  *absence* rather than to a default value); merges are first-node-wins, matching how the merged
  node inherits the first node's id; flattening a list prefers the content child's own mode over its
  list item's, since the child is the node whose text survives. New nodes carry nothing — a mode is
  always a deliberate act.

- **D9 — Additive persistence, no version bumps.** `DOC_TREE_VERSION` and the IndexedDB
  `SCHEMA_VERSION` are unchanged, and there is no migration: the field is optional, so every
  document ever written by an earlier build is already valid under the new model. The reverse
  direction is safe too — an earlier build's validator checks only the fields it knows, so it
  accepts a mode-bearing document and preserves the field through a round-trip without
  understanding it. This is a weaker guarantee than it looks (an old build silently cannot *edit*
  the modes) but it is strictly better than the alternative and costs nothing.

## Risks / Trade-offs

- **The Demokratis import contract is assumed, not verified.** The uppercase-and-lowercase-fold
  convention is inherited from `NodeFormat`, which does work end to end, and the field name matches
  `DocNodeContributionMode`. But no test in this repository can prove the platform accepts
  `contributionMode` on the envelope. This needs confirming against the backend before the feature
  is announced to structurers — tracked as an open task, as
  `add-loadfile-json-support` did for its content-type assumption.
- **Modes are invisible in the Preview pane (accepted).** A structurer checking their work in
  Preview sees no indication of which passages are locked. The tree carries the pill and is where
  the modes are set, so this is a mild asymmetry rather than a gap — but it is the first thing to
  revisit if the feature confuses people.
- **`REMARK` on a container is unvalidated as *policy*.** The model permits locking a list while a
  paragraph inside it is open for proposals. Demokratis resolves such combinations at render time;
  StructEdit deliberately does not second-guess it, so a structurer can express a contradictory
  intent without warning. Adding an inherited-mode preview would be a larger feature.

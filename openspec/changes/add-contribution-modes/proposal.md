## Why

StructEdit produces the DocTree that the [Demokratis](https://demokratis.ch) platform opens for
public consultation. On that platform, each element of a document controls how participants may
engage with it: some passages are locked, some accept a free-text remark, and some accept a full
amendment proposal with a diff of the participant's edit. Demokratis models this as a per-node
`DocNodeContributionMode`.

Today StructEdit cannot express any of it. A structurer can get the document's *shape* right and
then has to reopen the whole thing in the Demokratis editor to say which articles are open for
proposals — the one job that most obviously belongs next to the structure work, since it is decided
per heading and per paragraph. This change ports the field into the DocTree model and gives the
editor the controls to set it, so a document leaves StructEdit consultation-ready.

## What Changes

- **An optional `contributionMode` on every node type**, root included: `NONE` (locked), `REMARK`
  (annotations only), `PROPOSAL` (annotations plus amendment proposals). Values use StructEdit's
  `UPPERCASE` convention (like `NodeFormat`); the Demokratis importer lowercase-folds them. The
  field is **optional everywhere** — absence means "default for the element type", matching
  Demokratis's `null`.
- **`PROPOSAL` is restricted to proposable types.** An amendment proposal is a diff against text, so
  it is meaningful only on `HEADING` / `CONTENT` / `FOOTNOTE` (`PROPOSABLE_TYPES`, mirroring
  Demokratis `DocNodeType::isProposable()`). `NONE` and `REMARK` apply to every type. The per-type
  table is `ALLOWED_MODES`, `as const satisfies Record<DocumentNode['type'], ContributionMode[]>` —
  the same compile-time drift guard `ALLOWED_CHILDREN` uses, so a new node type cannot forget a row.
- **Validation** — `isValidNode`/`isValidDocument` reject an unknown mode value, or a mode its node
  type may not carry. Enforced uniformly across every type including the root and containers.
- **Modes survive editing.** Type changes carry the mode when the target type may hold it and clamp
  to absent otherwise (`carryModeOrClamp`); merges are first-node-wins; list flattening prefers the
  content child's mode over its list item's; freshly created nodes carry none.
- **Three ways to set a mode**, each a single undoable history entry: on the selection (with an
  optional "+ Inside" scope that walks descendants), across the whole document from the top toolbar,
  and both narrowable by a node-type filter. A bulk apply **clamps per node** — it writes the mode
  only where the type allows it and leaves the rest untouched, so painting across a mixed selection
  can never produce a tree that fails validation.
- **Visibility** — a node carrying a mode shows an always-visible icon pill in the tree; the
  selection toolbar summarises the selection's mode and reads `Mixed` when they disagree.
- **Round-trip** — a set mode serializes into the DocTree envelope; an absent one is not serialized
  at all, so a cleared node is byte-identical to a never-set one. `DOC_TREE_VERSION` and the
  IndexedDB `SCHEMA_VERSION` are unchanged (the field is additive and optional).
- **Out of scope:** inferring modes from imported HTML/DOCX (they cannot be — this is an authoring
  concern); showing modes in the read-only Preview pane; participant-side behaviour of any kind
  (annotations, proposals, diffs) — all of that lives on the Demokratis platform.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `contribution-modes`: the per-node contribution mode — the `ContributionMode` type and its
  per-type allow-list, validation, the tree primitives for setting a mode on a node or a subtree,
  mode preservation across the structural mutations, the three editor entry points (selection,
  subtree, whole document) with their scope and type filters, the tree indicator, and DocTree
  round-trip.

### Modified Capabilities

- _None._ The field is additive: no existing requirement of `node-formatting`,
  `document-persistence`, or `remote-document-loading` changes behaviour. Envelope round-trip of the
  new field is specified inside `contribution-modes` to keep the change self-contained.

## Impact

- **Data model:** [src/types/document.ts](src/types/document.ts) — the `ContributionMode` union; the
  optional `contributionMode` field on all seven node interfaces; `PROPOSABLE_TYPES`,
  `ALLOWED_MODES`, `canHaveMode`, `carryModeOrClamp`; the validation branch in `isValidNodeInternal`.
- **Tree primitives:** [src/utils/tree-utils.ts](src/utils/tree-utils.ts) —
  `setNodeContributionMode` and `setSubtreeContributionMode` (recursive, type-filtered, clamped,
  reference-preserving).
- **Mutations:** [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) — the `modeField` spread
  helper threading a mode through the enumerated node constructors in `changeNodeTypeInDoc`,
  `mergeNodesInDoc`, `flattenListToContents`, and `extractAndConvertListItemInDoc`.
- **Hooks:** [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) —
  `changeNodeContributionMode`, `changeSubtreeContributionMode`,
  `changeDocumentContributionMode`; exposed through
  [src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts).
- **UI:** the mode picker in [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx)
  (dropdown, `I` then `1`–`4` shortcuts, scope toggle, type filter); the whole-document menu in
  [src/components/DocumentContributionModeMenu.tsx](src/components/DocumentContributionModeMenu.tsx)
  mounted from [src/components/Toolbar.tsx](src/components/Toolbar.tsx); the pill and
  `data-contribution-mode` attribute in
  [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx); shared presentation
  in [src/components/contribution-mode-ui.ts](src/components/contribution-mode-ui.ts); the bulk
  scope/filter types in [src/types/editor.ts](src/types/editor.ts).
- **No data migration, no version bumps, no importer changes.** Documents written by earlier builds
  load unchanged (every node simply has no mode), and earlier builds tolerate documents written by
  this one, since their validators ignore unknown fields.

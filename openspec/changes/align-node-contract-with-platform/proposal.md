## Why

Demokratis decides what a DocTree envelope may contain — `JsonEnvelopeV1Parser` refuses the whole
upload on the first node it dislikes, and silently drops what it has no place for. StructEdit's
node model is more permissive than that contract in three places, and each one costs users
something they cannot see from inside the editor:

- **Formats.** `CONTENT` has no `MARKDOWN_INLINE`, so the platform folds that format to block-level
  `MARKDOWN` before handing a document over ("emitting MARKDOWN_INLINE makes StructEdit reject the
  whole document", `JsonEnvelopeV1Serializer::structEditFormat()`), and a re-imported paragraph is
  then remark-only — it can no longer receive text counter-proposals. `FOOTNOTE` allows `MARKDOWN`,
  which the platform accepts on no footnote: the format selector offers it, and a marked paragraph
  converted to a footnote keeps it (`carryFormatOrDefault`), so one such footnote fails the upload
  with `format "MARKDOWN" is not allowed for "FOOTNOTE"`.
- **The importer's own choice.** It elevates every marked paragraph to `MARKDOWN`, the one
  `CONTENT` format that makes a node remark-only on the platform, although it only ever produces
  inline marks (block tags are stripped before the format is chosen). And it encodes a source
  `<br>` as a bare `\n`, which StructEdit renders as a line break (`marked` runs with
  `breaks: true`) but the platform's CommonMark converter renders as a soft break — the break is
  already lost on the platform today, and the preview does not show it.
- **Numbers.** The tree pane offers an editable number badge on `LIST` nodes. The platform keeps
  no number on a list (`DocNodeType::hasNumber()` excludes it, and `JsonEnvelopeV1Parser` creates
  no content row for one), so whatever the operator types there is discarded on upload.

## What Changes

- `ALLOWED_FORMATS` becomes a mirror of the platform's import allow-list: `CONTENT` gains
  `MARKDOWN_INLINE`, `FOOTNOTE` loses `MARKDOWN`. `HEADING` and `IMAGE` already match.
- The HTML importer chooses `MARKDOWN_INLINE` — never `MARKDOWN` — for a paragraph with inline
  marks, demotes a paragraph whose only mark is a `<br>` to `NEWLINES` (the rule headings already
  follow), and encodes a `<br>` inside marked prose as a CommonMark hard break (`\` + newline), which
  both renderers show as a line break.
- Merging inline-level nodes joins them with the same hard break, so a merge boundary stays visible
  instead of collapsing to a space; the superscript-number transform learns that `MARKDOWN_INLINE`
  can be downgraded like `MARKDOWN`.
- A stored-document migration (schema v2 → v3) rewrites `FOOTNOTE` nodes whose format is `MARKDOWN`
  to `NEWLINES`, so documents already in IndexedDB stay loadable instead of becoming "incompatible"
  rows in the recents picker.
- `LIST` nodes lose their number badge and their `Enter`-to-edit-number affordance; the field stays
  in the model (nullable, preserved on export) because the wire format carries it.
- **Out of scope:** the renderer's per-format contracts (`breaks: true` on `MARKDOWN` is a known
  divergence, see the design's open questions), the editing ergonomics of `Enter` in an inline
  node, `HEADING`/`IMAGE` allow-lists, and any change on the platform side.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `node-numbering`: which node types offer a number in the editor, mirroring what the platform
  keeps — the rule later node-type changes state their own numbering against.

### Modified Capabilities

- `node-formatting`: the per-type allow-lists become a mirror of the Demokratis import allow-list,
  the importer's format choice prefers inline-level Markdown and encodes breaks portably, merges of
  inline-level nodes keep their boundary, and `Enter` on a selected `list` no longer opens a number
  editor.

## Impact

- **Data model:** [src/types/document.ts](src/types/document.ts) — `ALLOWED_FORMATS.CONTENT` gains
  `MARKDOWN_INLINE`, `ALLOWED_FORMATS.FOOTNOTE` drops `MARKDOWN`; `canHaveFormat` and `isValidNode`
  follow.
- **Importer:** [src/utils/document-utils.ts](src/utils/document-utils.ts) (`chooseFormat`) and
  [src/utils/format-render.ts](src/utils/format-render.ts) (`htmlToMarkdown` emits `\`-newline for
  `<br>` under the Markdown levels).
- **Tree operations:** [src/utils/tree-mutations.ts](src/utils/tree-mutations.ts) —
  `paragraphSeparatorFor('MARKDOWN_INLINE')` becomes a hard break;
  [src/utils/legal-transforms/list-number-dedup.ts](src/utils/legal-transforms/list-number-dedup.ts)
  — `downgradeFormatIfPlain` handles `MARKDOWN_INLINE`.
- **Persistence:** [src/utils/document-storage-migrations.ts](src/utils/document-storage-migrations.ts)
  — `SCHEMA_VERSION` 2 → 3 plus `migrateV2ToV3`; the v1 → v2 chain is untouched.
- **Tree pane:** [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) (the
  `LIST` row renders no `NumberBadge`) and
  [src/hooks/useKeyboardShortcuts.ts](src/hooks/useKeyboardShortcuts.ts) (`Enter` on a `LIST`).
- **UI:** [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx) needs no change —
  the selector is driven by `ALLOWED_FORMATS[node.type]`.
- **Tests:** [src/types/document.test.ts](src/types/document.test.ts),
  [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts),
  [src/utils/format-render.test.ts](src/utils/format-render.test.ts),
  [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts),
  [src/utils/legal-transforms/list-number-dedup.test.ts](src/utils/legal-transforms/list-number-dedup.test.ts),
  [src/utils/document-storage-migrations.test.ts](src/utils/document-storage-migrations.test.ts),
  [src/components/RecursiveTreeNode.test.tsx](src/components/RecursiveTreeNode.test.tsx), and every
  fixture that asserts `MARKDOWN` on an imported paragraph.
- **Sequencing:** first of the platform-parity series; the node-type changes that follow write
  their `node-formatting` deltas on top of this one.
- **No platform change required:** every document StructEdit produces after this change is accepted
  by `JsonEnvelopeV1Parser` as-is, and the platform's `structEditFormat()` fold becomes a no-op it
  can drop at its leisure.

## Context

`NodeFormat` was introduced by `add-per-node-formatting-mode` with values deliberately matching
the Demokratis platform ("`SCREAMING_SNAKE_CASE` … so JSON crossing the boundary needs no
translation"). The *values* match; the *allow-lists* never did. The platform's authority is
`JsonEnvelopeV1Parser::allowedFormats()`, which extends `DocNodeType::getAllowedContentFormats()`
for exactly one type:

| Node type  | Demokratis accepts on import              | StructEdit allows today      |
| ---------- | ----------------------------------------- | ---------------------------- |
| `HEADING`  | TEXT, NEWLINES, MARKDOWN_MINIMAL          | same                         |
| `CONTENT`  | TEXT, NEWLINES, MARKDOWN_INLINE, MARKDOWN | TEXT, NEWLINES, MARKDOWN     |
| `FOOTNOTE` | TEXT, NEWLINES                            | TEXT, NEWLINES, **MARKDOWN** |
| `IMAGE`    | TEXT, NEWLINES                            | same                         |

Both disagreements are already worked around on the platform side, at a cost the platform
documents in its own source: `JsonEnvelopeV1Serializer::structEditFormat()` folds
`MARKDOWN_INLINE` into `MARKDOWN` on the way out ("This is lossy: re-importing yields a
block-level MARKDOWN node, which is remark-only"), and nothing rescues a `MARKDOWN` footnote on the
way in.

How the two renderers treat a newline matters for everything below. The platform's `formatText`
(`src/Service/DiffTwigExtension.php`) renders `NEWLINES` with `nl2br`, `MARKDOWN` with a
`CommonMarkConverter` and `MARKDOWN_INLINE` with an `InlinesOnlyExtension` environment — both at
CommonMark defaults, where a bare `\n` is a *soft* break that the browser collapses to a space.
StructEdit's `renderContent` runs `marked` with `breaks: true` for `MARKDOWN` (a bare `\n` becomes
`<br>`) and `parseInline` at defaults for `MARKDOWN_INLINE` (soft break). So a `<br>` that the
importer stores as `\n` inside a `MARKDOWN` paragraph is visible here and gone on the platform.
CommonMark's *hard* break — a backslash before the newline — renders as `<br>` in both.

Two more facts from the code, both invisible from the specs:

- the importer never creates a `FOOTNOTE` (`chooseFormat` is only ever called with `'CONTENT'` and
  `'HEADING'`); footnotes exist through the type selector, and `carryFormatOrDefault` keeps a
  `MARKDOWN` format across that conversion because the allow-list permits it;
- `RecursiveTreeNode` renders an editable `NumberBadge` on `LIST` rows, while nothing in the
  codebase reads a list's number and the platform discards it (`DocNodeType::hasNumber()` excludes
  `LIST`; `JsonEnvelopeV1Parser::importNode()` creates a content row — the number's home — only
  for `LIST_ITEM`).

This is the first change of the platform-parity series. The node-type changes that follow write
their `node-formatting` deltas on top of this one.

## Goals / Non-Goals

**Goals:**

- Every document StructEdit can produce is a document `JsonEnvelopeV1Parser` accepts, and nothing
  the operator can type is silently discarded on upload.
- A paragraph with inline emphasis survives the round trip as an *inline* node, so it stays
  counter-proposable on the platform.
- A line break the importer preserves is a line break on both sides, not only in StructEdit's
  preview.
- Documents already in IndexedDB keep opening after the footnote allow-list narrows.
- One source of truth for the allow-lists (`ALLOWED_FORMATS`), consumed unchanged by validation,
  the renderer and the toolbar.

**Non-Goals:**

- No change to any format's rendering contract, including `breaks: true` on `MARKDOWN` (see Open
  Questions).
- No new format level, and no removal of `MARKDOWN` from `CONTENT` — the platform accepts it, and
  the structured-block types will require it.
- No attempt to preserve footnote emphasis across the boundary; the platform has no format for
  it.
- No rewrite of stored *content* — a migration may change a node's `format`, never its text.
- No change to how `Enter` behaves inside an inline node (Open Questions).

## Decisions

### D1. `ALLOWED_FORMATS` mirrors the platform's import allow-list

`CONTENT` becomes `TEXT | NEWLINES | MARKDOWN_INLINE | MARKDOWN`; `FOOTNOTE` becomes
`TEXT | NEWLINES`. The table above is the specification and the platform's parser is the upstream
it is copied from — when the two diverge again, the platform wins, because it is the side that
rejects documents.

Converting a `MARKDOWN`/`MARKDOWN_INLINE` content node to a footnote now hits the existing rule for
a format the target type does not allow — `carryFormatOrDefault` resets it to the type's default,
`TEXT` — with the stored source untouched (the node-formatting spec's "format switch is
non-destructive"). The delimiters become visible characters the operator can remove; that is the
same behavior the existing spec already pins for `content` → `heading`.

_Rejected: keeping `MARKDOWN` on `FOOTNOTE` and asking the platform to widen its allow-list._ That
inverts the dependency: StructEdit's output is the platform's input, and a document only some
future platform version accepts is a document today's platform drops. Widening stays available as
a follow-up (Open Questions).

### D2. The importer prefers inline-level Markdown and encodes breaks portably

`chooseFormat('CONTENT', html)` becomes:

| Source fragment                    | Format            | `<br>` becomes            |
| ---------------------------------- | ----------------- | ------------------------- |
| no marks, no `<br>`                | `TEXT`            | —                         |
| `<br>` only (no marks, no anchor)  | `NEWLINES`        | `\n` (rendered by `nl2br` / `<br>` on both sides) |
| any inline mark or anchor          | `MARKDOWN_INLINE` | —                         |
| any inline mark or anchor + `<br>` | `MARKDOWN_INLINE` | `\` + newline (CommonMark hard break) |

The break-only row reuses `hasOnlyBreakMarks`, which the heading rule already uses, so all three
content-bearing types demote the same way. `MARKDOWN_INLINE` is the right target rather than a
compromise: `getInnerHtml` flattens block tags before a format is chosen, so imported content is
inline by construction, and `htmlToMarkdown` already treats `MARKDOWN_INLINE` and `MARKDOWN`
identically (anchors → `[label](href)`, code spans preserved).

The hard break is the one new encoding. `htmlToMarkdown` currently turns `<br>` into a bare `\n`
under both Markdown levels; it now emits `\` followed by the newline under both, so the break
renders as `<br>` in `marked` (with or without `breaks: true` — verified against the pinned
18.0.2: one `<br>`, also inside emphasis) and in the platform's CommonMark converters. A `<br>` at
the start or end of a fragment is dropped rather than encoded: a hard break with nothing after it
is not a break in CommonMark, and `marked` renders the dangling `\` literally. The heading rule is
untouched: `MARKDOWN_MINIMAL` is single-line, and headings keep dropping the break.

_Rejected: keeping `MARKDOWN` for marked content with a `<br>`._ It hides the loss: the break
renders here (`breaks: true`) and collapses on the platform.
_Rejected: two trailing spaces as the hard break._ Also valid CommonMark, but invisible in the
editing surface and routinely stripped by editors and formatters; the backslash is explicit and
survives a round trip through anything.

### D3. Merges of inline-level nodes join with a hard break

`mergeNodesInDoc` joins `CONTENT`/`FOOTNOTE` sources with `paragraphSeparatorFor(format)`: `\n\n`
for `MARKDOWN` and `MARKDOWN_INLINE`, `\n` otherwise. A blank line is a paragraph break in block
Markdown and *nothing at all* in inline Markdown — `parseInline` has no paragraphs, so two merged
`MARKDOWN_INLINE` paragraphs render as one run-on line, on both sides. Today that is a latent bug
in a format the importer never assigns; after D2 it is the common case.

The separator for `MARKDOWN_INLINE` becomes the D2 hard break. A merged inline node therefore
shows a line break at the join — the same thing a `NEWLINES` merge shows — rather than a paragraph
break, which inline Markdown cannot express. `mergeFormatOf`'s ranking is unchanged.

`downgradeFormatIfPlain` in `list-number-dedup.ts`, which drops a node to `TEXT` once its only mark
(a leading `^1^` Absatznummer) has been stripped, currently acts on `MARKDOWN` only; it now treats
`MARKDOWN_INLINE` the same way, since that is the format such nodes arrive in.

### D4. Stored documents migrate v2 → v3 on read

Narrowing an allow-list makes previously-valid stored trees invalid: `migrateEntry` runs
`isValidDocument` after migration, and a failure turns the entry into an `IncompatibleEntry` — a
disabled row in the recents picker. Every footnote a user converted from a marked paragraph, or set
to `MARKDOWN` in the selector, would land there.

`SCHEMA_VERSION` goes to 3 with a `migrateV2ToV3` pass that rewrites `format: 'MARKDOWN'` to
`'NEWLINES'` on `FOOTNOTE` nodes only. `NEWLINES` (not the type's `TEXT` default) because the
migration runs unattended: it must be lossless for the stored string, and `NEWLINES` keeps any
`\n` rendering as a break where `TEXT` would collapse it. A type change (D1) may reset to `TEXT`
because the operator is watching and can adjust; a migration cannot assume that.

_Rejected: stripping the Markdown delimiters during migration._ A migration that rewrites the
user's text can't be undone and can't be reviewed; format is metadata, content is the document.
_Rejected: leaving the entries incompatible._ The picker would disable documents that were fine
the day before an unrelated deploy.

### D5. `LIST` nodes offer no number

The `LIST` row in the tree pane renders no `NumberBadge`, and `Enter` on a selected `LIST` no
longer opens a number editor (`LIST_ITEM` keeps both). The `number` field stays on the type,
nullable, because every non-root node carries it on the wire and `isValidNode` requires it; a value
already stored on a list is preserved and exported verbatim — the platform drops it, and rewriting
stored data to pre-empt that would be a migration for no user-visible gain.

This is the seed of a small `node-numbering` capability: which node types offer a number,
mirroring `DocNodeType::hasNumber()`. The node-type changes that follow state their own numbering
(`CONTENT_GROUP` numbered; `TABLE` and `DEFINITION_LIST` not) in their own specs.

_Rejected: keeping the badge as harmless._ An input whose value is silently discarded on upload is
not harmless; it is a promise the platform breaks.

### D6. TDD ordering

1. `types/document.ts` — allow-list matrix.
2. `format-render.ts` — `htmlToMarkdown` hard-break encoding, `renderContent` renders it as `<br>`
   under both Markdown levels (no renderer change expected — the test pins it).
3. `document-utils.ts` — importer choice per row of the D2 table.
4. `tree-mutations.ts` / `list-number-dedup.ts` — merge separator, inline downgrade.
5. `document-storage-migrations.ts` — v2 → v3.
6. `RecursiveTreeNode.tsx` / `useKeyboardShortcuts.ts` — the `LIST` row.

## Risks / Trade-offs

- **[Backslashes appear in the editing surface]** → Only where the source had a `<br>` inside
  marked prose; the alternative encodings are invisible (trailing spaces) or lossy (a soft break).
  The character is standard CommonMark and round-trips through the platform's editor.
- **[Existing tests assert `MARKDOWN` on imported paragraphs and `\n` for `<br>`]** → They encode
  the old rules and are updated in the red step; assertions change value, not presence.
- **[A user may already have chosen `MARKDOWN` on a footnote by hand]** → Covered by D4.
- **[Merged inline nodes show a line break, not a paragraph break]** → Inline Markdown has no
  paragraph; today they show nothing at all. A merge that needs real paragraphs is a `MARKDOWN`
  node, which the selector still offers.
- **[Two Markdown levels on `CONTENT` look alike in the selector]** → They differ in exactly one
  user-visible way (block elements), which the selector's labels already have to carry for the
  other levels.

## Migration Plan

Ship as one change: allow-lists, importer rules, merge separator and storage migration land
together — narrowing the allow-list without the migration would disable stored documents, and the
merge fix without the importer change would be a fix for a format nobody has. Rollback is a
revert: a v3 entry read by the previous build reports `version > SCHEMA_VERSION` and degrades to an
incompatible row rather than corrupting anything, and re-opening the source document restores it.
Hard breaks written by the new build are valid Markdown for the old build (rendered as `<br>` by
`marked` either way).

No platform deployment is required or implied. Once this ships, the platform's
`structEditFormat()` fold has nothing left to fold and can be removed on the Demokratis side
independently.

## Open Questions

- **Should `MARKDOWN` stop rendering a bare `\n` as `<br>`?** `breaks: true` was chosen so that
  imported `<br>`s and typed `Enter`s show as breaks; after this change imported breaks are encoded
  explicitly, so the remaining effect is that a typed newline in a `MARKDOWN` node renders here and
  not on the platform. Dropping `breaks: true` would make the preview honest at the cost of the
  ergonomics `add-per-node-formatting-mode` wanted; worth its own decision.
- **Should `Enter` in a `MARKDOWN_INLINE` node insert a hard break instead of `\n`?** With inline
  nodes becoming the common case, a typed newline that renders as a space on both sides is
  surprising. The fix is small (insert `\` + newline) and belongs with the question above.
- **Should Demokratis widen `FOOTNOTE` to `MARKDOWN_INLINE`?** It would let footnote emphasis
  survive the round trip; the platform already renders that format for `READONLY` nodes and
  captions. A platform-side decision; if it lands, StructEdit's mirror gains one row.

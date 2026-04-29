## Why

Imported documents already contain inline formatting (bold, italic, strikethrough, sup/sub) and meaningful line breaks, but StructEdit currently strips all of it during parsing and stores `contents` as plain strings. Issue [#59](https://github.com/Demokratis-ch/structedit/issues/59) asks for basic Markdown formatting back, while the linked Demokratis "formatting system overview" requires that each node carries an explicit, user-changeable format mode so the platform knows how to render and re-import it. We need a single change that introduces that per-node formatting mode, the rules around it, and the editing UX that follows.

## What Changes

- Introduce five formatting levels (`TEXT`, `NEWLINES`, `MARKDOWN_MINIMAL`, `MARKDOWN_INLINE`, `MARKDOWN`) with defined rendering semantics (newline handling, allowed inline marks, allowed block elements).
- Format identifiers are written in `SCREAMING_SNAKE_CASE` (`'TEXT'`, `'NEWLINES'`, …) to match the Demokratis platform spec — JSON crossing the boundary needs no translation.
- **BREAKING (data model):** add a required `format` field to every node that has `contents` (`heading`, `content`, `footnote`, `image`). The `exampleDocument`, all in-repo fixtures, the importer, and `isValidNode` / `isValidDocument` must populate / require it. (No persistence layer exists today, so no migration tooling is needed.) Default per type:
  - `content` → `TEXT`
  - `heading` → `TEXT`
  - `footnote` → `TEXT`
  - `image` → `TEXT` (alt/caption text only)
- Restrict which formats each node type may use:
  - `content`: `TEXT`, `NEWLINES`, `MARKDOWN`
  - `heading`: `TEXT`, `NEWLINES`, `MARKDOWN_MINIMAL`
  - `footnote`: `TEXT`, `NEWLINES`, `MARKDOWN`
  - `image`: `TEXT`, `NEWLINES`
  - Container-only nodes (`document`, `list`, `list_item`) have no format.
- Add a per-node format selector to the editing UI (in the `FloatingToolbar` while a single content-bearing node is selected) so users can switch a node's mode within the allowed set.
- Render content according to its node's format:
  - `TEXT`: escape and strip newlines
  - `NEWLINES`: escape, convert `\n` to `<br>`
  - `MARKDOWN_MINIMAL`: render `**bold**`, `*italic*`, `~~strike~~`, `^sup^`, `~sub~` only
  - `MARKDOWN_INLINE`: full CommonMark inline (links, code, etc.) plus strike + sup/sub, no block elements
  - `MARKDOWN`: full CommonMark including paragraphs, lists, tables
- **BREAKING (UX):** in edit mode, `Enter` no longer creates a sibling node. Behaviour now depends on format:
  - `TEXT`: ignored (with `preventDefault`)
  - `NEWLINES`, `MARKDOWN_MINIMAL`, `MARKDOWN_INLINE`, `MARKDOWN`: insert a newline inside the edited node
  - Sibling creation moves to a new explicit affordance (keep `Enter` while a node is selected but **not** in edit mode — the existing global handler — and document the change in the in-app help text).
- Update the importer (`document-utils.parseHtmlToTree`) so it no longer unconditionally strips inline tags. Inline marks survive into nodes whose chosen format permits them, and are stripped/escaped for nodes whose format does not. Default chosen format on import is conservative (`TEXT` everywhere) unless a heuristic decides otherwise — see design.md.
- Implement everything red-green TDD: every behavioural change starts with a failing test in the existing Vitest suite.

## Capabilities

### New Capabilities
- `node-formatting`: per-node formatting mode that governs which inline/block formatting is permitted, how stored content is rendered, and how the editor responds to inline keystrokes (notably `Enter`).

### Modified Capabilities
- _None._ There are no existing specs in `openspec/specs/` to amend; all behaviour added here lives in the new `node-formatting` capability.

## Impact

- **Types:** [src/types/document.ts](src/types/document.ts) — add `format` field to `HeadingDocumentNode`, `ContentDocumentNode`, `LeafDocumentNode`; add `NodeFormat` enum / union; extend `isValidNode`/`isValidDocument`; export per-type allowed-format table.
- **Tree utils:** [src/utils/tree-utils.ts](src/utils/tree-utils.ts) — new `changeNodeFormat` op; `flattenForRendering` and node-creation helpers must populate the default format.
- **Operations hook:** [src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts) — expose `changeNodeFormat(id, format)`; ensure `addNodeAfter`/`addNodeBefore` pick a sensible default format.
- **Editor hook:** [src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts) — pass format through to keyboard handling.
- **Tree editor / key handling:** [src/components/TreeEditor.tsx](src/components/TreeEditor.tsx#L175-L233) — change `Enter` behaviour inside `handleBlockKeyDown`; update help text near [TreeEditor.tsx:437](src/components/TreeEditor.tsx#L437).
- **Content rendering:** [src/components/ContentBlock.tsx](src/components/ContentBlock.tsx), [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) — render markup based on the node's format; sanitize on read.
- **Toolbar:** [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx) — add a format dropdown / segmented control restricted to the selected node's allowed set.
- **Importer:** [src/utils/document-utils.ts](src/utils/document-utils.ts#L60-L122) — stop unconditionally stripping `b/i/em/strong/u/s/strike/sub/sup`; thread chosen format through.
- **Tests:** every file above has a corresponding `*.test.*`. New tests for the `node-formatting` capability live alongside existing test files; no test infrastructure changes required.
- **Dependencies:** likely add a Markdown renderer + sanitizer (e.g. `marked` + the existing `dompurify`) — final pick deferred to design.md.
- **Out of scope:** persisted-document migration tooling (no production data store yet), Demokratis re-import endpoint, image handling beyond the alt/caption text.

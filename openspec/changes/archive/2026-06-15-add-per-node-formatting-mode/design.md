## Context

Today, every content-bearing node (`heading`, `content`, `footnote`, `image`) stores its text as a plain string in `contents[language]`. The HTML importer ([src/utils/document-utils.ts:114-122](src/utils/document-utils.ts#L114-L122)) actively strips inline tags (`b`, `i`, `em`, `strong`, `u`, `s`, `strike`, `sub`, `sup`) and block tags before storing. The renderer ([src/components/ContentBlock.tsx](src/components/ContentBlock.tsx)) writes that string back into a `contentEditable` element with `innerHTML`, and `Enter` inside the editable creates a sibling node ([src/components/TreeEditor.tsx:175-183](src/components/TreeEditor.tsx#L175-L183)).

The Demokratis "formatting system overview" (issue #59) says each content-bearing node carries one of five formatting levels and that some node types only allow some levels. This change adapts that model to StructEdit's node set (`document`, `list`, `list_item`, `heading`, `content`, `footnote`, `image`) — the wider node table in the issue (`READONLY`, `CHECKBOX`, `RADIOBUTTON`, …) does not exist here and is ignored per the issue's own caveat.

The user has explicitly asked for red-green TDD throughout. The existing Vitest suite is comprehensive and is the right place to drive each step.

## Goals / Non-Goals

**Goals:**
- Add a `format: NodeFormat` field to every node that has `contents`, with strict per-type allow-lists enforced by `isValidNode`.
- Define five rendering modes (`TEXT`, `NEWLINES`, `MARKDOWN_MINIMAL`, `MARKDOWN_INLINE`, `MARKDOWN`) with deterministic, tested string-to-HTML behaviour.
- Let the user change a node's format from the `FloatingToolbar`, restricted to that node type's allowed set.
- Change `Enter` in edit mode so it never creates a sibling: it inserts a real `\n` for newline-capable formats and is a no-op for `TEXT`.
- Stop the importer from stripping inline marks unconditionally — preserve them when the chosen format permits, strip otherwise.
- Keep undo/redo correctness: a format change is a single history commit.
- Every change is introduced via a failing test first (red), then minimal code to pass (green).

**Non-Goals:**
- No WYSIWYG toolbar for inline marks (bold/italic buttons that wrap selection). Users type Markdown directly. Adding a mark toolbar can be a follow-up once the format system exists.
- No persisted-document migration tooling — there is no production data store yet, and on-disk JSON fixtures are updated in this same change.
- No changes to the Demokratis re-import endpoint (still unimplemented per [README.md](README.md)).
- No new image-handling features beyond letting `image.contents` carry `TEXT`/`NEWLINES`.
- No multi-paragraph heading rendering — `MARKDOWN_MINIMAL` for headings stays inline by design.

## Decisions

### D1. Format identifiers: string union, not enum

Use a string-literal union — `type NodeFormat = 'TEXT' | 'NEWLINES' | 'MARKDOWN_MINIMAL' | 'MARKDOWN_INLINE' | 'MARKDOWN'` — exported from [src/types/document.ts](src/types/document.ts), to match the file's existing style (`ContainerDocumentNodeType`, `LeafDocumentNodeType` are already unions). Uppercase `SCREAMING_SNAKE_CASE` values match the identifiers used in the Demokratis platform's formatting-system overview (issue #59 table) so JSON crossing the boundary needs no translation. _Rejected: TypeScript `enum`_ — inconsistent with the rest of the codebase and produces awkward runtime values. _Rejected: lowercase values_ — would diverge from the platform spec.

### D2. Per-type allow-list lives next to the type definitions

Add an exported map alongside `ALLOWED_CHILDREN`:

```ts
export const ALLOWED_FORMATS: Record<'heading' | 'content' | 'footnote' | 'image', NodeFormat[]> = {
  heading:  ['TEXT', 'NEWLINES', 'MARKDOWN_MINIMAL'],
  content:  ['TEXT', 'NEWLINES', 'MARKDOWN'],
  footnote: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  image:    ['TEXT', 'NEWLINES'],
};
export const DEFAULT_FORMAT: Record<keyof typeof ALLOWED_FORMATS, NodeFormat> = {
  heading: 'TEXT', content: 'TEXT', footnote: 'TEXT', image: 'TEXT',
};
```

Plus a helper `canHaveFormat(nodeType, format)` so UI and validation share one source of truth. `isValidNode` enforces it.

_Rejected: making `format` optional with implicit defaults_ — that hides invariants and makes serialised JSON ambiguous. Required field, validated, defaulted at construction time.

### D3. Renderer: one pure function, dispatched by format

A new module [src/utils/format-render.ts] exposes `renderContent(raw: string, format: NodeFormat): string` that returns sanitized HTML. Implementations:

- `TEXT`: HTML-escape, then `replace(/\n+/g, ' ')`.
- `NEWLINES`: HTML-escape, then `replace(/\n/g, '<br>')`.
- `MARKDOWN_MINIMAL`: a small in-house regex pipeline supporting only `**bold**`, `*italic*`, `~~strike~~`, `^sup^`, `~sub~`. Run on escaped text. **Single-line per platform spec**: no links, no images, no code, no blocks, and *no* newline support — `\n` collapses to a space (matching `TEXT`'s newline handling). A heading that needs both inline marks and a line break must pick: the importer drops the break to preserve the marks; if a heading carries only a `<br>` and no marks, the importer demotes to `NEWLINES`.
- `MARKDOWN_INLINE`: full CommonMark inline via [`marked`](https://github.com/markedjs/marked) (`parseInline`) on a private instance configured with a `renderer.html` override that returns the empty string (with a narrow exception for `<sub>` / `<sup>` sentinels — see D11), then post-process to add strike + sup/sub support, then `DOMPurify` with an inline-only allow-list. Raw inline HTML in source does not survive into output — Markdown delimiters are the only path.
- `MARKDOWN`: `marked.parse` (block + inline) on the same private instance (the override handles both `Tokens.HTML` and `Tokens.Tag`), then `DOMPurify` with the block allow-list, plus `sub`/`sup`. CommonMark + GFM features (lists, tables, strikethrough, autolinks) render normally; bare HTML — block or inline — does not. Rationale: DOMPurify alone cannot distinguish a `<strong>` produced by `**foo**` from a `<strong>` written verbatim in source; the renderer override makes the distinction at the token level. Image syntax `![alt](src)` is currently NOT rendered (omitted from the DOMPurify allow-list); see open questions.

All paths end with `DOMPurify.sanitize` to defend against XSS. The function is pure → trivial to test with a table of `(input, format) → expectedHtml`.

_Rejected: writing a Markdown parser from scratch_ — too much surface area. _Rejected: `markdown-it`_ — `marked` is smaller and `dompurify` is already a dep.

### D4. Editing model: store the **source**, render on display

`contents[language]` continues to hold the user-editable source string (Markdown for markdown formats, plain with `\n` for `NEWLINES`, plain without `\n` for `TEXT`). The editable surface (`ContentBlock`) edits the source directly. The rendered HTML is computed only for non-editing display via `renderContent`.

This avoids a round-trip "html → markdown → html" parser pair and keeps the data model simple. It does mean the user sees raw `**markdown**` while editing — that matches the spec (asterisks are part of the inline syntax) and is consistent with how text editors work for these formats.

Side effect: `ContentBlock` for `TEXT`/`NEWLINES`/`MARKDOWN_*` nodes should switch from `innerHTML` write/read to `textContent`-based editing (preserving newlines for `NEWLINES`/markdown formats, collapsing them for `TEXT`). The non-editing display path uses `dangerouslySetInnerHTML={{ __html: renderContent(raw, format) }}`.

_Rejected: storing parsed AST or rich HTML_ — round-trip ambiguity and migrations get nasty. The Markdown source IS the canonical form.

### D5. `Enter` key behaviour

In `handleBlockKeyDown` ([src/components/TreeEditor.tsx:175-183](src/components/TreeEditor.tsx#L175-L183)):

- `format === 'TEXT'` → `e.preventDefault()`, do nothing.
- `format === 'MARKDOWN_MINIMAL'` → `e.preventDefault()`, do nothing (single-line format).
- All other formats (`NEWLINES`, `MARKDOWN_INLINE`, `MARKDOWN`) → insert a literal `\n` at the cursor (via `document.execCommand('insertText', false, '\n')`). The editable is a `<div>` with `white-space: pre-wrap` so `\n` is visible. We do NOT call `addNodeAfter`.

Sibling creation via `Enter` is **kept** when the node is selected but not in edit mode (existing handler at [TreeEditor.tsx:304-306](src/components/TreeEditor.tsx#L304-L306)) — that's the explicit affordance.

The contentEditable browser default for `Enter` inside a `<div>` is to insert a `<br>` or `<div>`, both of which we don't want (we want a literal `\n` in the source string, not HTML markup). We handle `Enter` ourselves: `e.preventDefault()` then `document.execCommand('insertText', false, '\n')` (still the most reliable cross-browser path inside a contentEditable; `Selection.modify` and `InputEvent` have caveats). If `execCommand` is unavailable in tests (jsdom), the test environment patches it — the test setup already mocks browser APIs.

`Shift+Enter` becomes meaningless (it used to mean "do not insert sibling, insert newline"). We preserve `Shift+Enter` as a synonym for `Enter` in newline-capable formats — no harm — and silently ignore it in `TEXT`.

### D6. Help text and discoverability

Update the in-app hint at [TreeEditor.tsx:437](src/components/TreeEditor.tsx#L437) — `"Enter to create a [new node]"` — to reflect the new behaviour: "Enter to add a sibling (when selected), Enter inside edit mode inserts a newline".

### D7. Format switcher in `FloatingToolbar`

When the selection is exactly one content-bearing node, `FloatingToolbar` shows a format dropdown (`<select>` is fine — small surface, accessible, no new component required) populated from `ALLOWED_FORMATS[node.type]`. Selecting a value calls a new `useTreeOperations.changeNodeFormat(id, format)` that commits to history.

Switching format must NOT mutate `contents`. `**bold**` typed under `TEXT` stays as the literal string `**bold**` and renders as such; if the user later switches to `MARKDOWN`, it renders bold. This keeps the operation lossless and reversible via undo.

_Rejected: auto-converting content on format switch_ — loses information and confuses undo.

### D8. Importer behaviour

`parseHtmlToTree` decides a per-node format on import:

- `heading`: pick `MARKDOWN_MINIMAL` if the source contained an inline mark (`<strong>/<b>/<em>/<i>/<s>/<strike>/<sup>/<sub>/<code>`); pick `NEWLINES` if the source contained only a `<br>` (no marks, no anchor); pick `TEXT` if the source contained only an anchor (links can't render under MARKDOWN_MINIMAL); else `TEXT`. A `<br>` together with marks is dropped (MARKDOWN_MINIMAL is single-line — preserving marks beats preserving a break).
- `content`: pick `MARKDOWN` if the source contained any inline mark, a `<br>`, or a real `<a href>`. Else `TEXT`.
- `footnote`: same heuristic as `content`.
- `image`: always `TEXT` for now.

When the chosen format is markdown-capable, the surviving inline tags are converted to their Markdown equivalents (`<strong>` → `**…**`, `<em>` → `*…*`, `<s>`/`<strike>` → `~~…~~`, `<sup>` → `^…^`, `<sub>` → `~…~`) before storing. This conversion lives in the same `format-render.ts` module as a `htmlToMarkdown(html, format)` helper.

When the chosen format is `TEXT`, the existing strip-everything path runs unchanged.

This keeps the change strictly additive for documents that have no inline formatting — they import as `TEXT` and behave exactly like today.

### D9. Validation, fixtures, JSON

`isValidNode` rejects a content-bearing node without a `format` field, or with a format outside its allow-list. The example tree in [src/types/document.ts:67](src/types/document.ts#L67) and any test fixtures in [src/test/](src/test/) get an explicit `format: 'TEXT'` added. Existing JSON-shape tests are updated as part of the red phase.

### D10. TDD ordering

Per the user's standing instruction, each task in tasks.md follows: write failing test → implement → confirm green → refactor. The implementation order is bottom-up so that each layer's tests are meaningful:

1. Types + validation + helpers (`canHaveFormat`, defaults).
2. Pure renderer (`renderContent`) — easiest to TDD, no React.
3. `htmlToMarkdown` import helper.
4. Tree ops (`changeNodeFormat`).
5. `ContentBlock` edit/display split.
6. `TreeEditor` `Enter`-key change.
7. `FloatingToolbar` selector.
8. Importer integration.

## Risks / Trade-offs

- **[Source-as-Markdown is visible in editor]** → Mitigation: this is the documented behaviour for these formats; `TEXT` mode (the default) shows nothing surprising. Future enhancement could add a "preview while editing" toggle, but that's out of scope.
- **[`Enter` no longer creates siblings — muscle memory regression]** → Mitigation: keep the in-edit `Enter` as newline only when the format allows it (else no-op so users notice), update help text, keep selected-mode `Enter` working as before, and document in PR description.
- **[`marked` adds a dependency]** → Mitigation: ~30kB gzipped, MIT-licensed, widely used. We already pull in `dompurify`; the pair is the canonical safe-Markdown stack.
- **[Custom regex for `MARKDOWN_MINIMAL` is a sub-spec]** → Mitigation: keep it tiny (5 marks), table-tested, no nesting beyond one level. If we ever need real parsing here, swap to `marked.parseInline` with a stricter post-filter.
- **[Importer heuristic is fuzzy]** → Mitigation: heuristic only sets the *default* format; the user can override per-node via the toolbar. Tests assert each branch with realistic fixtures.
- **[`document.execCommand` is deprecated]** → Mitigation: still works in all current browsers and is the only reliable cross-browser way to insert text inside contentEditable. If/when it's removed, the editing layer is small and isolated; swap to a manual Range/Selection update.

### D11. Bare HTML in MARKDOWN / MARKDOWN_INLINE source is stripped at the token level

`marked` passes raw HTML through by default; DOMPurify's allow-list cannot distinguish a `<strong>` rendered from `**foo**` from one written verbatim in source. We therefore configure a private `marked` instance with `renderer.html` returning the empty string. Both block-level (`Tokens.HTML`) and inline (`Tokens.Tag`) raw-HTML tokens dispatch through that single override, so a single rule covers both.

The override eats *html tokens*, not the surrounding text. The user-visible behavior depends on how `marked` tokenizes the input:

- **Inline raw HTML** (`<strong>foo</strong>`, `<span>foo</span>`, `<a href="…">foo</a>`) tokenizes as three tokens — opening `Tokens.Tag`, a `text` token, closing `Tokens.Tag`. The override drops the two tag tokens; the text token survives. Net effect: tags vanish, inner text remains as plain prose in the surrounding paragraph. `<strong>raw</strong> and **md**` renders as `raw and <strong>md</strong>`.
- **Block-level raw HTML** (`<div>...</div>`, `<table>` written by hand) tokenizes as one `Tokens.HTML` block whose `text` field contains the entire block. The override drops the whole token. Net effect: the block and its inner text both disappear.

This asymmetry is deliberate: preserving the inner text in the inline case keeps user content visible (just unformatted), which is friendlier than silently swallowing it. Returning the source verbatim was rejected because DOMPurify would re-parse and re-allow allowlisted tags — the original problem; HTML-escaping for literal display was rejected as visually noisy and inconsistent with CommonMark's silent handling of malformed input (an unclosed `**` is a no-op, not literal `*`). If users genuinely want angle brackets to appear, they can write entity escapes (`&lt;div&gt;`) or wrap them in a code span — those paths are unchanged.

`<sub>` / `<sup>` are a narrow exception: `protectSupSubMarks` emits them as sentinels for `~x~` / `^x^` marks. The override allows exactly that form (no attributes, exact tag name) through. A hostile `<sub onerror=...>` cannot match the strict pattern; DOMPurify is the second line of defense.

## Migration Plan

No persistence layer exists in StructEdit today — every tree is rebuilt from a freshly imported document or from `exampleDocument`. Therefore there are no stored trees to migrate. The change is purely additive at runtime:

1. Land the type change together with updates to `exampleDocument` and every in-repo fixture so the test suite stays green.
2. The importer always emits a `format` field on every content-bearing node it produces, so no shim or compatibility code is needed at the load boundary.

Rollback: the change is a single PR. Reverting it restores the old behaviour. No DB schema, no on-disk state to back out.

## Open Questions

- Format switcher UI: dropdown vs. segmented buttons? Going with `<select>` for v1; revisit after user feedback.
- Do we want a keyboard shortcut to cycle formats on the selected node? Out of scope for this change; can be added later.
- Should `MARKDOWN` support inline images (`![alt](src)`)? "Full CommonMark" includes images, but the DOMPurify allow-list currently omits `img`. Out of scope for the bare-HTML fix; flagged as a separate decision.
- "CommonMark" in this spec means **CommonMark + GFM** (tables, strikethrough, autolinks). `marked` enables these by default and the existing test suite pins them down. Documented to match shipped behavior.

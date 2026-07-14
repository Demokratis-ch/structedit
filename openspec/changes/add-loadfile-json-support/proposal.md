## Why

The `?loadFile=` flow lets the Demokratis backend hand a document to StructEdit for editing, but it
only accepts HTML. Demokratis also holds documents that already exist as structured trees — the
DocTree JSON envelope StructEdit itself produces via "Download JSON" and already re-imports through
file upload. Forcing those documents back through the HTML pipeline would discard structure the
tree already has. This change lets a signed `loadFile` URL serve `application/json` and open the
contained DocTree envelope directly, completing the round-trip: Demokratis → StructEdit → JSON →
Demokratis → StructEdit.

## What Changes

- `fetchRemoteDocument` accepts a `200 OK` response whose `Content-Type` is JSON
  (`application/json` or a `+json` suffix) in addition to HTML, and returns a discriminated
  content payload (`{ kind: 'html' } | { kind: 'json' }`) so the caller picks the right pipeline.
- A JSON body is validated as a **DocTree envelope** (`{ DocTreeVersion: 1, metadata, document }`)
  using the same validation as the `.json` file-upload path. On success the editor opens with the
  contained tree directly — no HTML parsing.
- A JSON-loaded document behaves exactly like an uploaded `.json` envelope: there is no separate
  "original" document, so the left pane shows only the rendered Preview (no Original tab), and the
  recents entry is persisted with `source.kind: 'json-envelope'` and the raw JSON as bytes.
- Malformed JSON, a structurally invalid envelope, or a `DocTreeVersion` mismatch all surface the
  existing unsupported-format error (no new error surface, no blank editor).
- A `200 OK` whose `Content-Type` is neither HTML-ish nor JSON keeps the existing
  unsupported-format behavior.
- **Out of scope:** any JSON shape other than the DocTree envelope, DOCX/PDF over `loadFile`,
  content sniffing when the `Content-Type` header is wrong or missing, and any change to the
  HTML `loadFile` path or the upload/paste flows.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md) and the precedent of
  `add-loadfile-url-import`.

## Capabilities

### New Capabilities

- _None._

### Modified Capabilities

- `remote-document-loading`: the `loadFile` fetch accepts JSON (DocTree envelope) content in
  addition to HTML — content-type routing, direct tree opening without a source preview,
  `json-envelope` persistence, and envelope-validation failures mapped to the existing
  unsupported-format error state.

## Impact

- **Remote-loading module:** [src/utils/remote-document.ts](src/utils/remote-document.ts) —
  `looksLikeJson` next to `looksLikeHtml`; `RemoteFetchResult`'s success arm changes from
  `{ ok: true; html }` to `{ ok: true; content: { kind: 'html'; html } | { kind: 'json'; raw } }`.
  No new error reasons; the message map is untouched.
- **JSON processing reuse:** [src/utils/file-processing.ts](src/utils/file-processing.ts) —
  factor `processJsonEnvelopeString(raw, { name, originalFilename })` out of
  `processJsonEnvelopeFile` (the same split `processHtmlString`/`processHtmlFile` already have);
  the file entry point becomes a thin wrapper. No behavior change to the upload path.
- **Load hook:** [src/hooks/useLoadFromUrl.ts](src/hooks/useLoadFromUrl.ts) — branch on the
  fetched content kind: HTML → `processHtmlString` (unchanged), JSON →
  `processJsonEnvelopeString`; any envelope failure → the `unsupported-content` error state.
- **No UI changes:** [src/App.tsx](src/App.tsx) and
  [src/components/LeftPane.tsx](src/components/LeftPane.tsx) already handle a document with
  `sourceUrl: null` (Preview only, no Original tab) via the uploaded-JSON path.
- **Tests:** [src/utils/remote-document.test.ts](src/utils/remote-document.test.ts) (the
  `application/json → unsupported-content` expectation inverts into success cases),
  [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts) (string entry point),
  [src/App.test.tsx](src/App.test.tsx) (end-to-end JSON `loadFile` success + failure).
- **No data migration, no config changes:** the host allowlist, param consumption, loading/error
  surfaces, and persistence machinery are reused as-is.

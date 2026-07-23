## Context

The `loadFile` flow (shipped in `add-loadfile-url-import`) is split into a pure, React-free core
([remote-document.ts](src/utils/remote-document.ts)) and a mount hook
([useLoadFromUrl.ts](src/hooks/useLoadFromUrl.ts)). The core hardcodes HTML: `looksLikeHtml`
rejects any other `Content-Type` as `unsupported-content`, and the success result carries an
`html` string that the hook feeds to `processHtmlString`.

Meanwhile the *upload* path already imports StructEdit's own JSON: `processJsonEnvelopeFile`
([file-processing.ts](src/utils/file-processing.ts)) parses a DocTree envelope
(`{ DocTreeVersion: 1, metadata, document }`, validated by `isValidDocTreeEnvelope` in
[types/document.ts](src/types/document.ts)), returns the tree with `sourceUrl: null` (so the
left pane shows Preview only — [LeftPane.tsx](src/components/LeftPane.tsx) renders the Original
tab only when a `documentUrl` exists), and persists with `source.kind: 'json-envelope'`. The
original design flagged this extension explicitly: "The module is shaped so a future
content-type branch is possible."

The user decided up front: `loadFile` accepts the **DocTree envelope only** — arbitrary JSON has
no mapping onto the document tree and stays an unsupported format.

## Goals / Non-Goals

**Goals:**

- A signed `loadFile` URL that serves `application/json` containing a valid DocTree v1 envelope
  opens the editor with the contained tree — same loading state, allowlist, param consumption,
  and persistence as the HTML path.
- A JSON-loaded document is indistinguishable from an uploaded `.json` envelope once open:
  Preview-only left pane, `json-envelope` recents entry, autosave active.
- Malformed JSON / invalid envelope / version mismatch produce the existing unsupported-format
  error surface, never a blank or broken editor.
- The HTML path, the upload path, and all existing error behavior are byte-for-byte unchanged.
- Test-first (red → green → refactor) per [CLAUDE.md](CLAUDE.md).

**Non-Goals:**

- No support for JSON shapes other than the DocTree envelope, and no version migration (a
  non-v1 envelope is rejected, not converted).
- No content sniffing: a JSON body served as `text/plain` (or with no `Content-Type`) stays
  unsupported. The backend controls the header on signed files.
- No new error reasons, messages, or UI surfaces.
- No synthesized "original" preview for JSON documents (there is no original to show).

## Decisions

### D1. Route by `Content-Type` header: JSON alongside HTML

`fetchRemoteDocument` gains `looksLikeJson(contentType)`: `application/json` or any `+json`
structured-syntax suffix (e.g. `application/ld+json`), mirroring how `looksLikeHtml` matches
`text/html` / `application/xhtml`. Routing order: HTML-ish → HTML path; JSON-ish → JSON path;
anything else → `unsupported-content` exactly as today. An empty/whitespace body remains
`unsupported-content` for both kinds.

_Rejected: sniffing the body (e.g. "starts with `{`")._ The signed files are served by the
Demokratis backend, which sets correct headers; sniffing would blur the unsupported-format
contract and invite mis-parsing HTML error pages as JSON (or vice versa).

### D2. The fetch result carries a discriminated content payload

The success arm of `RemoteFetchResult` changes from `{ ok: true; html; sourceUrl }` to:

```ts
type RemoteDocumentContent =
  | { kind: 'html'; html: string }
  | { kind: 'json'; raw: string };

type RemoteFetchResult =
  | { ok: true; content: RemoteDocumentContent; sourceUrl: string }
  | { ok: false; reason: RemoteFetchErrorReason };
```

The fetch layer stays transport-only: it classifies the content type and reads the body, but
does **not** parse JSON or validate the envelope — that belongs to the processing layer, keeping
the status-mapping matrix unit-testable with plain strings.

_Rejected: parsing/validating the envelope inside `fetchRemoteDocument`._ It would drag the
document model into the transport module and duplicate the validation the processing layer
already owns.

### D3. Envelope validation reuses the upload path: `processJsonEnvelopeString`

Factor the body of `processJsonEnvelopeFile` into
`processJsonEnvelopeString(raw, { name, originalFilename })` — the same file/string split
`processHtmlFile`/`processHtmlString` already have. `name` is the fallback display name (the
envelope's localized title still wins) and the label used in error messages;
`originalFilename` is `null` for fetched documents. `processJsonEnvelopeFile` becomes a thin
wrapper passing `file.name`.

The string entry point keeps the existing failure behavior — it **throws** on malformed JSON,
an invalid envelope, or a `DocTreeVersion` mismatch. The hook catches any throw and maps it to
the existing `unsupported-content` error state.

_Rejected: a new error reason / message (e.g. `invalid-envelope`)._ To the user every variant is
"this link didn't contain a document StructEdit can read"; the existing copy ("Couldn't read the
document — it wasn't in a supported format.") already says exactly that, and adding a reason
would touch the message map, the UI, and the spec for no user-visible benefit.
_Rejected: duplicating parse/validate logic in the hook._ Divergence risk with the upload path;
`isValidDocTreeEnvelope` must stay the single source of truth.

### D4. A JSON load behaves like an uploaded JSON envelope

`processJsonEnvelopeString` returns `sourceUrl: null` and no `html`, so the existing App wiring
does the right thing with zero UI changes: [LeftPane.tsx](src/components/LeftPane.tsx) shows
Preview only (no Original tab), and `persistInitialEntry` stores a `json-envelope` entry whose
bytes are the raw fetched JSON — identical round-trip behavior to an uploaded `.json`. The
display-name fallback is `deriveNameFromUrl(sourceUrl)` (the `/file/<uuid>` segment), the same
helper the HTML path uses; the envelope's `metadata.title` takes precedence when present.

The `isEmptyDocument` guard stays in place after processing, applying equally to both kinds.

_Rejected: synthesizing an HTML preview from the tree for the Original tab._ The Original tab
means "the document as it came in"; for a DocTree envelope the tree *is* the document, and the
uploaded-JSON path already established Preview-only as the correct presentation.

### D5. TDD ordering (bottom-up, mirroring the original change)

1. `remote-document.ts` — JSON content-type success (incl. `+json` suffix), HTML success in the
   new `content` shape, `text/plain` still `unsupported-content`, empty JSON body still
   `unsupported-content`.
2. `file-processing.ts` — `processJsonEnvelopeString` direct tests (valid envelope, malformed
   JSON, invalid envelope, version mismatch, name precedence) plus characterization that
   `processJsonEnvelopeFile` is unchanged.
3. App-level — a JSON `loadFile` opens the editor with a `json-envelope` recents entry and no
   Original tab; an invalid envelope shows the unsupported-format message and no editor.

## Risks / Trade-offs

- **[Backend must serve signed JSON with a JSON `Content-Type` and CORS headers]** → Same
  contract as HTML today; a wrong `Content-Type` degrades to the unsupported-format error (not a
  blank editor). Flag to the backend team alongside the existing CORS requirement.
- **[Changing `RemoteFetchResult`'s success shape is a breaking type change]** → All consumers
  are in-repo (`useLoadFromUrl`, tests); the compiler surfaces every site. No public API.
- **[A huge or deeply nested JSON body]** → `JSON.parse` + recursive validation run on the main
  thread, same as the existing `.json` upload path; no new exposure beyond what upload allows.
- **[Envelope version drift]** → A `DocTreeVersion` ≠ 1 is rejected as unsupported (same as
  upload). If Demokratis ever mints newer envelopes, that is a coordinated model upgrade, out of
  scope here.

## Migration Plan

Purely additive; no stored-data changes. HTML `loadFile` links and all upload flows behave
exactly as before. Rollback is a single revert. Coordinate with the backend only on serving
DocTree JSON with `Content-Type: application/json` (plus the already-required CORS headers).

## Open Questions

- **Should a non-v1 envelope get its own message?** Deferred: upload shows a targeted version
  message, but over `loadFile` the user can't act on the distinction (the fix is on the
  Demokratis side), so v1 ships with the generic unsupported-format copy. Revisit if envelope
  versions ever actually diverge in production.

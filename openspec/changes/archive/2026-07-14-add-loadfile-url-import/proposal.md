## Why

The Demokratis backend wants to hand a document straight to StructEdit for editing: it opens
`https://structedit.demokratis.ch/?loadFile=<url-encoded signed URL>` and expects the editor to
appear with that document already loaded. Today StructEdit ignores query parameters entirely — the
user lands on the upload screen and there is no way to bring a document in from the platform. This
change closes the loop described in issue
[#131](https://github.com/Demokratis-ch/structedit/issues/131) so a draft can flow from
demokratis.ch into the editor in one click.

## What Changes

- On app load, read the `loadFile` query parameter. When present, decode it to the signed source
  URL (shape: `https://demokratis.ch/file/<uuid>?_expiration=<ts>&_hash=<hmac>`), fetch the file,
  parse it through the existing HTML pipeline, and open the editor — bypassing the upload screen.
- Show a dedicated **loading state** while the fetch is in flight, so the user never sees a blank or
  half-rendered editor mid-fetch.
- **Distinct, actionable error states** instead of a blank editor (acceptance criterion):
  - `410 Gone` → link expired (90-min TTL): _"Link expired, re-open from demokratis.ch."_
  - `404 Not Found` → invalid or tampered link.
  - Network / CORS / non-HTML / parse failures → a generic "couldn't load" message.
  - Every error path offers a way forward (return to the normal upload screen).
- **Validate the fetch target against a configurable host allowlist** before fetching. The allowlist
  defaults to `demokratis.ch` (and its subdomains) and is read from build/env config so staging or
  signed object-storage hosts can be added without a code change. A `loadFile` pointing at a host
  outside the allowlist is rejected with an error and never fetched — this keeps StructEdit from
  being abused as an open fetcher.
- **Persist a URL-loaded document like an upload**: create an IndexedDB entry so autosave protects
  the user's work and the document appears in the recents picker. Reuses the existing
  `document-persistence` machinery; no new storage behavior.
- **Strip the `loadFile` param from the URL** after a load attempt (via `history.replaceState`), so
  a page refresh doesn't re-trigger a fetch against an already-expired link.
- **Out of scope:** DOCX/PDF over `loadFile` (issue scope is HTML; the response is processed as
  HTML), uploading the edited result back to Demokratis, authentication beyond the signed URL the
  backend already mints, client-side verification of the `_hash`/`_expiration` (the server is
  authoritative and returns 410/404), and any change to the existing upload/paste flows.
- Implement red-green TDD throughout, per [CLAUDE.md](CLAUDE.md) and the precedent set by
  `add-autosave-and-recents`.

## Capabilities

### New Capabilities

- `remote-document-loading`: load a document into the editor from a signed URL passed in the
  `loadFile` query parameter — host-allowlist validation, fetch with loading state, HTML processing,
  distinct error states for expired (410) / invalid (404) / network-or-parse failures, persistence
  of the loaded document as a recents entry, and one-shot consumption of the query parameter.

### Modified Capabilities

- _None._ The change reuses the existing `document-persistence` capability (entry creation +
  autosave) without changing its requirements, and reuses the HTML parsing in
  [file-processing.ts](src/utils/file-processing.ts) / [document-utils.ts](src/utils/document-utils.ts)
  unchanged.

## Impact

- **App shell:** [src/App.tsx](src/App.tsx) — on mount, detect `loadFile`, drive a new
  loading / error / loaded flow, and reuse the existing `onConvert`-style state transition into the
  editor. New top-level view states beyond `'upload' | 'editor'` (a `'loading'` and an error
  surface).
- **Remote-loading module (new):** [src/utils/remote-document.ts](src/utils/remote-document.ts) —
  `parseLoadFileParam(search)`, host-allowlist validation, `fetchRemoteDocument(url)` returning a
  discriminated result (`ok` with HTML bytes, or a typed error: `expired` / `not-found` /
  `forbidden-host` / `network` / `unsupported-content`).
- **HTML processing reuse:** factor the HTML-string → `ProcessedDocument` core out of
  [src/utils/file-processing.ts](src/utils/file-processing.ts) `processHtmlFile` so the fetched bytes
  go through the identical parse + source-blob path (with a sensible name derived from the URL).
- **Config:** the host allowlist constant/env read (e.g. `VITE_LOADFILE_ALLOWED_HOSTS`) with a
  `demokratis.ch` default; documented in the design.
- **Loading hook (new, optional):** [src/hooks/useLoadFromUrl.ts](src/hooks/useLoadFromUrl.ts) —
  encapsulates "read param → validate → fetch → process → persist" so App.tsx stays declarative and
  the flow is unit-testable apart from the DOM.
- **Error UI:** a small error panel rendered in place of the upload/editor when a `loadFile` load
  fails, with the per-status message and a "Go to upload" action. Reuses the existing alert styling
  from [LoadDocument.tsx](src/components/LoadDocument.tsx) where practical.
- **Tests:** every file above gains a `*.test.*`. `fetch` is mocked; status-code branches (410, 404,
  ok, network error, disallowed host, non-HTML body) are each covered. No new production
  dependencies expected.
- **No data migration required:** purely additive. Existing upload/paste/recents flows are
  untouched when no `loadFile` param is present.

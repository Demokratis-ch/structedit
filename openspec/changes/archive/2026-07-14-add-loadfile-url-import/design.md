## Context

StructEdit is a static single-page app ([App.tsx](src/App.tsx)) with a two-view flow held in
`useState`: `'upload'` (the [LoadDocument](src/components/LoadDocument.tsx) screen) and `'editor'`
(the [EditorInterface](src/components/EditorInterface.tsx)). There is no router and no reading of
query parameters anywhere today (`grep` for `URLSearchParams` / `window.location` finds only object-
URL handling). The app is deployed at `https://structedit.demokratis.ch/`.

Document ingestion already exists for uploads and pastes. The relevant primitive is
[`processHtmlFile`](src/utils/file-processing.ts#L106): it takes raw HTML, builds a `text/html`
blob + object URL for the side-by-side preview, runs [`parseHtmlLegalToTree`](src/utils/document-utils.ts#L359)
to build the tree, and returns a `ProcessedDocument`. Uploads then persist an entry via
`createEntry` ([document-storage.ts](src/utils/document-storage.ts)) and call `onConvert` to enter
the editor. The fetched-URL path should land on this exact machinery so a URL-loaded document is
indistinguishable from an uploaded one once it's open.

The Demokratis backend will open `…/?loadFile=<url-encoded signed URL>`. The decoded URL looks like
`https://demokratis.ch/file/<uuid>?_expiration=<ts>&_hash=<hmac>`. The server enforces a 90-minute
TTL and returns `410 Gone` when expired and `404 Not Found` for an invalid/tampered link; StructEdit
must turn those into distinct, non-blank messages (issue
[#131](https://github.com/Demokratis-ch/structedit/issues/131) acceptance criteria).

The user has decided two product questions up front:
- **Configurable host allowlist** — default `demokratis.ch`, extendable via config (not "any URL").
- **Persist like an upload** — a URL-loaded document gets an IndexedDB entry + autosave.

## Goals / Non-Goals

**Goals:**

- A valid `loadFile` link opens the editor with the fetched HTML already parsed into the tree and the
  source preview populated — no upload screen, no extra clicks.
- The user never sees a blank or half-rendered editor: there is an explicit loading state during the
  fetch and an explicit error state on any failure.
- `410` and `404` produce distinct, actionable messages; network/CORS/non-HTML/parse failures get a
  generic "couldn't load" message. Every error offers a path to the normal upload screen.
- StructEdit only fetches from allowlisted hosts; the allowlist is configurable without code changes.
- A URL-loaded document is protected by the existing autosave/recents machinery, identical to an
  upload.
- A page refresh after a load does not re-fetch a now-expired link.
- Every behavioural change ships test-first (red → green → refactor), per [CLAUDE.md](CLAUDE.md).

**Non-Goals:**

- No DOCX/PDF over `loadFile`. The issue scope is HTML; the response body is processed as HTML. The
  module is shaped so a future content-type branch is possible, but it is not built here.
- No client-side verification of `_hash` / `_expiration`. The server is authoritative (it returns
  410/404); duplicating HMAC logic in the browser would be both impossible (no secret) and
  redundant.
- No upload-back-to-Demokratis. That is the next roadmap item, out of scope here.
- No router/history library. A one-time `URLSearchParams` read plus `history.replaceState` is enough.
- No change to the upload, paste, recents, or autosave flows when `loadFile` is absent.

## Decisions

### D1. Read `loadFile` once, on mount, in the App shell

App.tsx gains a one-shot effect that runs on mount: read `new URLSearchParams(window.location.search)`,
look for `loadFile`. If absent, behave exactly as today (render the upload view). If present, enter
the new remote-load flow. A `useRef` guard ensures the effect fires its fetch exactly once even under
React 18/19 StrictMode double-invocation in dev.

_Rejected: adding a router (react-router)._ One query param does not justify a routing dependency and
a re-architecture of the two-view `useState`. We can add one later if deep-linking grows.

### D2. View states: add `loading` and `error` to the App flow

Today `view` is `'upload' | 'editor'`. Extend the flow so the app can also render:

- a **loading** surface (spinner + "Loading document from demokratis.ch…") while the fetch is in
  flight, and
- an **error** surface (the per-status message + a "Go to upload" button) when the load fails.

The initial view is decided synchronously from `window.location.search` so there is no flash of the
upload screen before the loading state when a `loadFile` param is present. Implementation can be a
discriminated `view` union or a small `remoteLoad: { status }` state machine alongside `view` — the
spec only constrains the observable states, the design leaves the exact shape to implementation, but
favors a single discriminated state to avoid impossible combinations.

_Rejected: rendering the upload screen with an inline banner during fetch._ The acceptance criterion
is "not a blank editor"; a dedicated loading state is clearer than overloading the upload screen, and
keeps the upload affordances from being clickable mid-fetch.

### D3. Remote-loading module: pure, fetch-injectable, returns a discriminated result

New module [src/utils/remote-document.ts](src/utils/remote-document.ts), free of React, holding the
testable core:

```ts
// Parse + validate the query string. Returns the decoded URL or a typed reason it was rejected.
function parseLoadFileParam(search: string, allowedHosts: string[]):
  | { ok: true; url: string }
  | { ok: false; reason: 'absent' | 'malformed' | 'forbidden-host' };

type RemoteFetchResult =
  | { ok: true; html: string; sourceUrl: string }            // sourceUrl = decoded URL, for naming
  | { ok: false; reason: 'expired' }                          // HTTP 410
  | { ok: false; reason: 'not-found' }                        // HTTP 404
  | { ok: false; reason: 'network' }                          // TypeError / CORS / other non-OK status
  | { ok: false; reason: 'unsupported-content' };             // body isn't HTML / empty

async function fetchRemoteDocument(url: string, fetchImpl = fetch): Promise<RemoteFetchResult>;
```

`fetchImpl` is injected so tests pass a mock `fetch` and exercise each status branch without a
network. Status mapping: `410 → expired`, `404 → not-found`, other non-`ok` statuses and thrown
`TypeError`s (CORS, DNS, offline) `→ network`. A 2xx response whose `Content-Type` is not HTML-ish,
or whose body is empty, `→ unsupported-content`.

_Rejected: doing the fetch inside the React component._ Keeping it pure makes the status-branch matrix
unit-testable and keeps App.tsx declarative.

### D4. Host allowlist: configurable, default `demokratis.ch`, subdomain-aware

The allowlist is read from a Vite env var `VITE_LOADFILE_ALLOWED_HOSTS` (comma-separated). When unset,
it defaults to `['demokratis.ch']`. In dev (`import.meta.env.DEV`) `localhost` and `127.0.0.1` are
also permitted so the flow can be exercised locally. A host matches if it equals an allowlist entry
**or** is a subdomain of one (`*.demokratis.ch`) — matched by suffix on a dot boundary, never by bare
`includes()` (so `demokratis.ch.evil.com` and `notdemokratis.ch` are both rejected). The scheme must
be `https:` (except `http://localhost` in dev).

Validation happens in `parseLoadFileParam` **before** any fetch. A forbidden host short-circuits to
the error surface with the generic message and is never fetched.

_Rejected: allowlisting by `String.includes`._ Classic bypass (`demokratis.ch.attacker.test`). Use
`URL` parsing + exact-or-dot-suffix host comparison.
_Rejected: hardcoding the host._ The user chose configurable so staging / signed object-storage hosts
can be added without a code change.

### D5. Reuse the HTML pipeline; derive a name from the URL

Factor the body of [`processHtmlFile`](src/utils/file-processing.ts#L106) into a shared
`processHtmlString(html, { name, originalFilename, kind })` so both the file path and the URL path
produce a `ProcessedDocument` identically (same blob/object-URL preview, same `parseHtmlLegalToTree`).
`processHtmlFile` becomes a thin wrapper over it.

The display name comes from the decoded URL's path — the `<uuid>` from `/file/<uuid>` — falling back
to `"Demokratis document"` if no usable segment exists. `source.kind` is `'html'`; `originalFilename`
is null (there is no real filename). The query string (with the `_hash`) is **not** used in the name.

_Rejected: a separate parallel pipeline for fetched HTML._ Divergence risk; the upload path already
does exactly the right thing.

### D6. Persist as a recents entry, like an upload

After a successful fetch + parse, follow the upload path: `createEntry({...})` then `onConvert(...)`
into the editor, so autosave (`useAutosave` in EditorInterface) and the recents picker work
unchanged. If `isEmptyDocument(doc)` is true (the HTML parsed to nothing), treat it as
`unsupported-content` and show the error surface rather than opening an empty editor — mirroring the
existing upload guard in [LoadDocument.tsx](src/components/LoadDocument.tsx#L73).

Persistence failures (quota) reuse the existing `persistInitialEntry` behavior: the editor still
opens in-memory and the existing quota toast surfaces; a `loadFile` load is not aborted just because
the local save failed.

_Rejected: in-memory only for URL loads._ The user chose "treat like an upload" so the ephemeral link
doesn't become a way to lose work.

### D7. Consume the param once: `history.replaceState`

Immediately after reading `loadFile` (before or right after the fetch resolves), strip it from the
URL with `history.replaceState(null, '', window.location.pathname)`. This prevents a refresh from
re-fetching an expired link (which would then show the expired error on every reload) and keeps the
signed URL — including its `_hash` — out of the visible address bar longer than necessary. The
in-memory document and editor state are unaffected.

_Rejected: leaving the param in place._ A refresh after 90 minutes would always 410; worse, the
signed URL would linger in the address bar / browser history.

### D8. Error message copy (single source of truth)

A small map from `reason` → user-facing message lives in the remote-loading module so UI and tests
share one definition:

- `expired` → "Link expired, re-open from demokratis.ch." (verbatim from the issue)
- `not-found` → "This document link is invalid. Re-open it from demokratis.ch."
- `network` → "Couldn't load the document. Check your connection and try re-opening it from demokratis.ch."
- `unsupported-content` → "Couldn't read the document — it wasn't in a supported format."
- `forbidden-host` / `malformed` → reuse the `network`/invalid copy (these only arise from a
  hand-edited URL, not the backend).

Each error surface includes a "Go to upload" action that clears the error and shows the normal upload
screen.

### D9. TDD ordering (bottom-up)

1. `remote-document.ts` — `parseLoadFileParam` (allowlist + subdomain + scheme cases) and
   `fetchRemoteDocument` (410 / 404 / ok / network / non-HTML / empty), with an injected mock fetch.
2. `processHtmlString` extraction in `file-processing.ts` — characterization test that
   `processHtmlFile` output is unchanged, plus a direct test of the string entry point.
3. App-level wiring (`useLoadFromUrl` hook or App effect) — param present → loading → editor on
   success; each error reason → its message and no editor; param absent → upload unchanged; refresh
   doesn't re-fetch (param stripped).
4. Error/loading UI components.

## Risks / Trade-offs

- **[CORS: the backend must allow `structedit.demokratis.ch` to fetch the signed URL]** → A missing
  `Access-Control-Allow-Origin` makes the fetch throw a `TypeError`, which we map to `network` and
  surface a non-blank error. Fixing the header is a backend task (out of scope), but the failure is
  handled gracefully rather than as a blank editor. Flag to the backend team during rollout.
- **[Opaque CORS status codes]** → If the server responds 410/404 but without permissive CORS
  headers, the browser may surface a `TypeError` instead of a readable status, collapsing
  expired/not-found into the generic `network` message. Mitigation: backend must send CORS headers on
  error responses too; documented as a backend requirement. Distinct 410/404 messaging is only
  guaranteed when CORS is correctly configured.
- **[Open-fetcher / SSRF-ish abuse via the param]** → Mitigation: D4 host allowlist with strict
  `URL`-based, dot-boundary matching and `https`-only. The app will not fetch arbitrary hosts.
- **[Untrusted HTML in the preview]** → The fetched HTML flows through the same DOMPurify sanitize in
  `parseHtmlToTree` and the same blob-URL preview as any upload; this vector already exists for
  pasted/uploaded HTML and is not widened. No new trust assumption.
- **[StrictMode double-fetch in dev]** → Mitigation: a `useRef` once-guard around the fetch effect.
- **[Signed URL leaking via Referer/history]** → Mitigation: D7 strips the param promptly. (Referer
  on the outbound fetch is a backend concern; not addressed here.)
- **[`history.replaceState` on a static host with a base path]** → Use `window.location.pathname`
  (not `'/'`) so a non-root deploy base is preserved.

## Migration Plan

Purely additive; no stored-data migration. Ship App wiring + the remote-loading module + UI in one
PR. When `loadFile` is absent the app behaves exactly as before. Rollback is a single revert.
Signed files are always served from `demokratis.ch`, so the built-in default allowlist covers prod
with no extra configuration. Coordinate with the backend only on CORS: headers must be present on
both success and 410/404 responses before announcing the feature.

## Open Questions

- **Default allowlist value in production** — _Resolved:_ signed files are always served from
  `demokratis.ch`. The built-in `['demokratis.ch']` default therefore covers production with no
  build-time configuration; `VITE_LOADFILE_ALLOWED_HOSTS` exists only as headroom for staging /
  local hosts.
- **Should a failed expired/invalid load offer a "retry"?** A retry can't succeed for an expired
  link, so the affordance is "Go to upload" only for v1. Revisit if the backend adds a refresh.
- **Param name casing / encoding** — assuming exactly `loadFile` (camelCase) and a single
  `encodeURIComponent`-encoded value, per the issue. Confirm with the backend.

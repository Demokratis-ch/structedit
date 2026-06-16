## 1. Remote-loading module (param parsing + allowlist)

- [x] 1.1 Red: create [src/utils/remote-document.test.ts](src/utils/remote-document.test.ts) covering `parseLoadFileParam(search, allowedHosts)` for the spec scenarios "Allowlisted host is fetched", "Allowlisted subdomain is fetched", "Non-allowlisted host is rejected without fetching", "Look-alike host is rejected" (`demokratis.ch.evil.com`, `notdemokratis.ch`), plus: absent param → `absent`, non-`https` scheme rejected (and `http://localhost` accepted only in dev), and a malformed/undecodable value → `malformed`
- [x] 1.2 Green: implement `parseLoadFileParam` in [src/utils/remote-document.ts](src/utils/remote-document.ts) — read `loadFile`, `decodeURIComponent` + `new URL(...)`, validate scheme and host against the allowlist using exact-or-dot-suffix matching (never `includes`). Return the discriminated `{ ok: true; url } | { ok: false; reason }` result from design D3
- [x] 1.3 Green: add the host-allowlist config: read `VITE_LOADFILE_ALLOWED_HOSTS` (comma-separated), default to `['demokratis.ch']`, and add `localhost`/`127.0.0.1` when `import.meta.env.DEV`. Expose a helper that resolves the effective allowlist so App and tests share one source
- [x] 1.4 Refactor: confirm the dot-boundary matcher rejects look-alikes and that `parseLoadFileParam` performs no I/O

## 2. Remote-loading module (fetch + status mapping)

- [x] 2.1 Red: extend [src/utils/remote-document.test.ts](src/utils/remote-document.test.ts) for `fetchRemoteDocument(url, fetchImpl)` covering the spec scenarios — `200 OK` HTML → `{ ok: true; html }`, `410 → expired`, `404 → not-found`, other non-OK status → `network`, thrown `TypeError` (CORS/offline) → `network`, `200` non-HTML `Content-Type` → `unsupported-content`, and `200` empty body → `unsupported-content`. Use an injected mock `fetchImpl`
- [x] 2.2 Green: implement `fetchRemoteDocument` with the status→reason mapping from design D3; read the body as text and check `Content-Type` is HTML-ish and non-empty
- [x] 2.3 Green: add the `reason → message` map (design D8), including the verbatim "Link expired, re-open from demokratis.ch." copy, and export it for UI + tests to share
- [x] 2.4 Refactor: confirm the fetch result type is a single discriminated union and the message map covers every `reason`

## 3. HTML pipeline reuse

- [x] 3.1 Red: extend [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts) with "processHtmlString produces the same ProcessedDocument shape as a file upload" and "name is derived from the source URL's file segment, falling back to a default"
- [x] 3.2 Green: extract `processHtmlString(html, { name, originalFilename, kind })` in [src/utils/file-processing.ts](src/utils/file-processing.ts) and re-implement `processHtmlFile` as a thin wrapper over it (no behavior change to the upload path)
- [x] 3.3 Green: add a small `deriveNameFromUrl(url)` helper (uuid from `/file/<uuid>`, fallback `"Demokratis document"`, query string ignored) used by the URL-load path
- [x] 3.4 Refactor: confirm the upload path output is unchanged (characterization test green)

## 4. App-level load-from-URL flow

- [x] 4.1 Red: create [src/hooks/useLoadFromUrl.test.ts](src/hooks/useLoadFromUrl.test.ts) (or extend [src/App.test.tsx](src/App.test.tsx)) covering: param present + 200 → loading then editor with tree + preview; `expired`/`not-found`/`network`/`unsupported-content` each → its message and no editor; `forbidden-host` → error, no fetch; `isEmptyDocument` result → `unsupported-content`; param absent → upload unchanged, no fetch; fetch fires at most once under StrictMode. Mock `fetchRemoteDocument`/`fetch` and the storage module
- [x] 4.2 Green: implement the flow as `useLoadFromUrl` (or an App mount effect) — `parseLoadFileParam` → on `ok` set loading and `fetchRemoteDocument` → on `ok` `processHtmlString` + `isEmptyDocument` guard → `createEntry` → enter editor; map every failure reason to the error surface. Use a `useRef` once-guard
- [x] 4.3 Green: wire into [src/App.tsx](src/App.tsx) — decide the initial view synchronously from `window.location.search` (no upload-screen flash), add `loading` and `error` view states, and reuse the existing `onConvert`-style transition into `EditorInterface` for the success path
- [x] 4.4 Green: persist like an upload (design D6) — reuse the `persistInitialEntry`/`createEntry` path so a quota failure still opens the editor in memory with the existing toast
- [x] 4.5 Green: strip the `loadFile` param via `history.replaceState(null, '', window.location.pathname)` after the load attempt (design D7); add/extend a test that a reload does not re-fetch
- [x] 4.6 Refactor: confirm no fetch occurs when the param is absent and the once-guard holds under StrictMode

## 5. Loading & error UI

- [x] 5.1 Red: create a test for the error surface component covering each message variant and that the "Go to upload" action returns to the upload screen, plus a test that the loading surface renders a visible indicator
- [x] 5.2 Green: add the loading surface (spinner + "Loading document from demokratis.ch…") and the error surface (per-`reason` message from the shared map + "Go to upload" action), reusing the alert styling from [LoadDocument.tsx](src/components/LoadDocument.tsx) where practical
- [x] 5.3 Green: render these surfaces from [src/App.tsx](src/App.tsx) for the `loading` and `error` view states; "Go to upload" clears the error and shows the upload screen
- [x] 5.4 Refactor: confirm 410 and 404 render visibly distinct messages

## 6. Verification

- [x] 6.1 Run `npm run test` and confirm the entire suite is green
- [x] 6.2 Run `npm run build` and confirm it succeeds with no new TypeScript errors
- [x] 6.3 Manually verify in `npm run dev` (port 3000): open `/?loadFile=<encoded http://localhost-served HTML>` and confirm the loading state then the editor with preview; simulate a 410 and a 404 (e.g. point at endpoints returning those) and confirm the two distinct messages and the "Go to upload" action; open with a non-allowlisted host and confirm it's rejected without a fetch; reload after a load and confirm no re-fetch (param gone)
- [ ] 6.4 Confirm with the backend that CORS headers are present on both success and 410/404 responses (design Risks). The prod signed-URL host is always `demokratis.ch`, so the built-in default allowlist already covers it — no env config needed for prod

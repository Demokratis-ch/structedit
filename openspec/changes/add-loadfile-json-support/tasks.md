## 1. Remote-loading module: JSON content-type routing

- [ ] 1.1 Red: update [src/utils/remote-document.test.ts](src/utils/remote-document.test.ts) —
  the `application/json → unsupported-content` expectation inverts: a `200` JSON response now
  succeeds as `{ ok: true, content: { kind: 'json', raw } }` (cover `application/json` with a
  charset parameter and a `+json` suffix type); a `200` HTML response succeeds as
  `{ ok: true, content: { kind: 'html', html } }`; `text/plain` and a missing `Content-Type`
  stay `unsupported-content`; an empty/whitespace JSON body stays `unsupported-content`; the
  410/404/network mappings are unchanged
- [ ] 1.2 Green: add `looksLikeJson(contentType)` in
  [src/utils/remote-document.ts](src/utils/remote-document.ts) and change `RemoteFetchResult`'s
  success arm to the discriminated `content` payload (design D1/D2); no new error reasons, the
  message map untouched
- [ ] 1.3 Refactor: confirm the fetch layer does not parse JSON or touch the document model, and
  that every existing status branch still maps identically

## 2. JSON envelope processing from a string

- [ ] 2.1 Red: extend [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts) with
  direct `processJsonEnvelopeString` tests — valid envelope returns the tree with
  `sourceUrl: null`, no `html`, `source.kind: 'json-envelope'`, raw JSON as bytes,
  `originalFilename` as passed; envelope title wins over the fallback `name`; malformed JSON,
  invalid envelope, and a mismatched `DocTreeVersion` throw; plus a characterization test that
  `processJsonEnvelopeFile` output is unchanged for a valid file
- [ ] 2.2 Green: extract `processJsonEnvelopeString(raw, { name, originalFilename })` in
  [src/utils/file-processing.ts](src/utils/file-processing.ts) and re-implement
  `processJsonEnvelopeFile` as a thin wrapper over it (design D3; no behavior change to the
  upload path)
- [ ] 2.3 Refactor: confirm the upload path is unchanged (characterization test green) and the
  error messages still name the source

## 3. App-level flow: JSON loadFile end to end

- [ ] 3.1 Red: extend [src/App.test.tsx](src/App.test.tsx) — a `loadFile` fetch returning a valid
  DocTree envelope as `application/json` opens the editor, creates a recents entry with
  `source.kind: 'json-envelope'`, and offers no Original tab (Preview only); a `loadFile` fetch
  returning JSON that is not a valid envelope shows the unsupported-format message and no editor
- [ ] 3.2 Green: branch on `content.kind` in
  [src/hooks/useLoadFromUrl.ts](src/hooks/useLoadFromUrl.ts) — `html` → `processHtmlString`
  (unchanged), `json` → `processJsonEnvelopeString` with `deriveNameFromUrl` as the fallback
  name and `originalFilename: null`; catch any envelope failure and set the
  `unsupported-content` error state (design D3/D4)
- [ ] 3.3 Refactor: confirm the `isEmptyDocument` guard, persistence (`persistInitialEntry`), and
  param consumption apply identically to both content kinds; no changes needed in
  [src/App.tsx](src/App.tsx) or [src/components/LeftPane.tsx](src/components/LeftPane.tsx)

## 4. Verification & docs

- [ ] 4.1 Run `npm run test` and confirm the entire suite is green
- [ ] 4.2 Run `npm run build` and confirm it succeeds with no new TypeScript errors
- [ ] 4.3 Update [README.md](README.md): mention JSON (DocTree envelope) alongside HTML in
  "Loading from Demokratis" and point the spec link at the live spec
  ([openspec/specs/remote-document-loading/spec.md](openspec/specs/remote-document-loading/spec.md))
  instead of the archived change path
- [ ] 4.4 Confirm with the backend that signed DocTree JSON files are served with
  `Content-Type: application/json` and the same CORS headers required for HTML (design Risks)

## 1. Storage module (IndexedDB wrapper)

- [ ] 1.1 Red: create [src/utils/document-storage.test.ts](src/utils/document-storage.test.ts) covering the spec scenarios for "Autosave writes the active document to IndexedDB", "Every upload creates a new entry", "Recents are ordered by most recent update", "Library is capped at 20 entries with LRU eviction", "Source bytes are persisted alongside the tree". Use `fake-indexeddb/auto` in [src/test/setup.ts](src/test/setup.ts) (create if missing) so the suite runs against a real-shaped IndexedDB
- [ ] 1.2 Green: install `fake-indexeddb` as a devDependency; reference it from the Vitest setup file
- [ ] 1.3 Green: create [src/utils/document-storage.ts](src/utils/document-storage.ts) exporting `openDb()`, `createEntry(payload)`, `updateEntryTree(id, tree)`, `listRecents()`, `loadEntry(id)`, `deleteEntry(id)`, `MAX_RECENTS = 20`. Use a single `documents` store keyed on `id` with an index on `updatedAt`. `createEntry` runs the LRU eviction in the same transaction
- [ ] 1.4 Refactor: confirm one transaction per public call; confirm `MAX_RECENTS` is referenced from tests by name, not literal

## 2. Schema versioning and migrations

- [ ] 2.1 Red: extend [src/utils/document-storage.test.ts](src/utils/document-storage.test.ts) with the scenarios for "Schema versioning surfaces incompatible entries without deleting them" — an entry with a future `schemaVersion`, an entry whose tree fails `isValidDocument`, and a clean v1 entry round-tripping
- [ ] 2.2 Green: create [src/utils/document-storage-migrations.ts](src/utils/document-storage-migrations.ts) exporting `SCHEMA_VERSION = 1` and `migrateEntry(raw): StoredDocumentEntry | { status: 'incompatible'; id; name; updatedAt }`. The chain is empty today but the dispatch shape is in place
- [ ] 2.3 Green: route all `loadEntry` and `listRecents` reads through `migrateEntry`; ensure incompatible entries make it into the recents list with the incompatible shape so the UI can render them as disabled
- [ ] 2.4 Refactor: extract the validation step (`isValidDocument`) into the migration so consumers cannot bypass it

## 3. Quota and private-mode handling

- [ ] 3.1 Red: extend [src/utils/document-storage.test.ts](src/utils/document-storage.test.ts) with the scenarios "Quota-exceeded surfaces a toast and leaves the in-memory document intact" and "Ephemeral storage is detected and surfaced". Use `fake-indexeddb` quota simulation (or a forced throw via a wrapper) to assert behaviour
- [ ] 3.2 Green: add `withQuotaErrorHandling(promise)` to the storage module that catches `QuotaExceededError` (and `DOMException` with `name === 'QuotaExceededError'`) and rethrows as a typed `StorageQuotaError`
- [ ] 3.3 Green: add `detectEphemeralStorage(): Promise<boolean>` to the storage module — write/read/delete a probe record and return whether the round-trip succeeded
- [ ] 3.4 Green: add a minimal `<Toast>` component at [src/components/ui/Toast.tsx](src/components/ui/Toast.tsx) plus a `useToast()` hook (portal, 5 s auto-dismiss, close button, single-toast-at-a-time)
- [ ] 3.5 Green: add `<PrivateModeBanner>` at [src/components/PrivateModeBanner.tsx](src/components/PrivateModeBanner.tsx); render it on app start if `detectEphemeralStorage()` returns true

## 4. Recents hook

- [ ] 4.1 Red: create [src/hooks/useRecentDocuments.test.ts](src/hooks/useRecentDocuments.test.ts) covering the scenarios "Listing recents returns ≤ 20 entries sorted by updatedAt desc", "Deleting an entry removes it from the list", "Loading an entry returns its tree and rebuilds a valid blob URL". Mock the storage module
- [ ] 4.2 Green: implement [src/hooks/useRecentDocuments.ts](src/hooks/useRecentDocuments.ts) exposing `entries`, `loadEntry(id)`, `deleteEntry(id)`, `refresh()`. Subscribe to a simple internal event bus so writes elsewhere refresh the list
- [ ] 4.3 Refactor: confirm `loadEntry` constructs a Blob from `source.bytes + source.mime`, calls `URL.createObjectURL`, and returns both the tree and the URL — leaving revoke discipline to the caller

## 5. Autosave hook

- [ ] 5.1 Red: create [src/hooks/useAutosave.test.ts](src/hooks/useAutosave.test.ts) covering "Autosave writes the active document to IndexedDB" (debounced), "Autosave flushes pending writes on entry switch", and "Autosave surfaces a toast on quota errors". Mock the storage module
- [ ] 5.2 Green: implement [src/hooks/useAutosave.ts](src/hooks/useAutosave.ts) as `useAutosave(currentEntryId: string | null, tree: ContainerDocumentNode | null)`. 500 ms debounce, flush on entry switch and unmount, `beforeunload` best-effort sync flush
- [ ] 5.3 Green: wire `useAutosave` into [src/components/EditorInterface.tsx](src/components/EditorInterface.tsx) (or App.tsx — whichever owns the live tree, see D12)
- [ ] 5.4 Refactor: confirm the hook is a no-op when `currentEntryId` is null

## 6. Recents picker UI

- [ ] 6.1 Red: create [src/components/RecentDocumentsList.test.tsx](src/components/RecentDocumentsList.test.tsx) covering the picker scenarios from the spec — empty state hides the list, populated state renders rows in order, click loads the entry, bin opens a confirm dialog, confirm deletes the entry, incompatible entries render disabled with the badge
- [ ] 6.2 Green: implement [src/components/RecentDocumentsList.tsx](src/components/RecentDocumentsList.tsx) — list rows with name, relative timestamp, subtitle (pasted-text only), bin icon. Use the date-formatting rules from design D7
- [ ] 6.3 Green: add a minimal `<DeleteConfirmDialog>` inline (or as a co-located component in the same file) — title, body, Cancel/Delete buttons, ESC and click-outside dismiss
- [ ] 6.4 Green: render `<RecentDocumentsList>` above the upload affordance in [src/components/LoadDocument.tsx](src/components/LoadDocument.tsx); hide it when `entries.length === 0`

## 7. App-level wiring

- [ ] 7.1 Red: extend [src/App.test.tsx](src/App.test.tsx) (create if missing) covering "Uploading creates a new entry", "Clicking a recent entry routes to the editor with its tree and source preview", "Returning to upload revokes the object URL", "The Close-Editor button no longer prompts"
- [ ] 7.2 Green: in [src/App.tsx](src/App.tsx) add `currentEntryId` state; thread an `entryId` through `handleConvert`; on upload, generate the id and call `createEntry` before transitioning to the editor view
- [ ] 7.3 Green: route `RecentDocumentsList`'s `onLoad` through a new `handleResume(entry)` that sets all state at once and revokes any prior `documentUrl`
- [ ] 7.4 Green: remove the `window.confirm` from `handleBack`; revoke the outgoing `documentUrl` instead
- [ ] 7.5 Green: hook the global object-URL revoke effect so any replacement of `documentUrl` revokes the prior value

## 8. Pasted-text naming

- [ ] 8.1 Red: extend [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts) with the scenario "Pasted text generates an Untitled name with timestamp and 40-char subtitle"
- [ ] 8.2 Green: in [src/utils/file-processing.ts](src/utils/file-processing.ts), `processTextInput` returns a name (`Untitled (YYYY-MM-DD HH:mm)`) and a subtitle (first 40 chars, trimmed). Update the `ProcessedDocument` type accordingly
- [ ] 8.3 Green: thread the name/subtitle through to `createEntry` at upload time

## 9. Verification

- [ ] 9.1 Run `npm run test` and confirm the entire suite is green
- [ ] 9.2 Run `npm run build` and confirm it succeeds with no new TypeScript errors
- [ ] 9.3 Manually verify in `npm run dev` (port 3000): upload a DOCX, edit a node, refresh the page — see it appear in recents, click to resume, confirm the side-by-side preview is intact; delete an entry via the bin icon; force a quota error (DevTools → Application → quota override, or fill via a large fixture) and confirm the toast appears; open the same URL in a private window and confirm the private-mode banner shows; close the editor and confirm no "unsaved changes" prompt appears
- [ ] 9.4 Spot-check the picker order with three entries created back-to-back; confirm timestamps and sort

## Why

Working through a complex document in StructEdit can take a long time, but the app keeps the entire tree in React state only. Closing the tab, refreshing the page, or a browser crash silently destroys the user's work — issue [#73](https://github.com/Demokratis-ch/structedit/issues/73) asks for the ability to save progress. The roadmap places the eventual save story on the Demokratis platform (per [README.md](README.md)), but no backend exists today and none is planned in the scope of this change. We need a client-side bridge that protects an editing session and lets the user return to it later from the same browser.

## What Changes

- Autosave the active document to IndexedDB on every change (debounced). No "Save" button — saving is implicit.
- Persist the **original source bytes** alongside the tree (DOCX or HTML), so the side-by-side preview survives a reload. Pasted text is persisted as text.
- On the upload screen, show a **"Recent documents"** picker listing up to 20 entries sorted by last-edited time. Clicking an entry loads it back into the editor; a bin icon next to each entry deletes it (with a small confirm dialog).
- Cap at 20 entries: every autosave that exceeds the cap evicts the entry with the oldest `updatedAt` (LRU-by-update). The eviction is silent.
- **Every upload creates a new entry.** Re-uploading the same file makes a fresh entry; users disambiguate via timestamps and the bin icon.
- **Pasted-text entries** get an auto-name of the form `"Untitled (YYYY-MM-DD HH:mm)"` plus a subtitle showing the first ~40 characters of the source.
- **Schema versioning:** each stored entry carries a `schemaVersion` field. On read, entries that fail validation after migration are surfaced in the picker as disabled with a "⚠ incompatible" badge — never silently discarded.
- **Quota exceeded:** if IndexedDB rejects a write (private mode, full disk, browser policy), the editor continues to work in memory and a toast surfaces: "Storage full — delete some saved documents to continue saving." No silent failure.
- **Private/incognito browsing:** detect ephemeral storage on app start and show a single banner: "Autosave unavailable in private browsing."
- **Drop the existing "you will lose unsaved changes" confirm** on the Close-Editor button ([App.tsx:26](src/App.tsx#L26)) — with autosave there are no unsaved changes.
- **Fix the existing object-URL leak** ([App.tsx:32](src/App.tsx#L32)): the prior `documentUrl` is never `revokeObjectURL`'d. Since this change cycles object URLs on resume/switch, revoke them centrally.
- **Out of scope:** server-side sync, multi-tab conflict resolution, persisting undo history, importing a previously-downloaded JSON via the upload view, sharing/collaboration, on-the-fly compression of stored sources, and any Demokratis platform integration.
- Implement red-green TDD throughout, in line with [CLAUDE.md](CLAUDE.md) and the precedent set by `add-per-node-formatting-mode`.

## Capabilities

### New Capabilities

- `document-persistence`: client-side autosave of the active editing session to IndexedDB, a "recent documents" picker on the upload screen, restoration of both the document tree and its original source bytes, and bounded local storage with LRU eviction. Distinct from the existing "Download JSON" export, which remains untouched.

### Modified Capabilities

- _None._ No specs in `openspec/specs/` exist that this change amends; behaviour lives in the new `document-persistence` capability.

## Impact

- **App shell:** [src/App.tsx](src/App.tsx) — replace the `useState`-only flow with a flow that tracks `currentEntryId`, restores source-blob URLs on switch, revokes the previous URL on switch, and drops the unsaved-changes confirm.
- **Storage module (new):** [src/utils/document-storage.ts](src/utils/document-storage.ts) — thin IndexedDB wrapper: `createEntry`, `updateEntryTree`, `listRecents`, `loadEntry`, `deleteEntry`, plus a `withQuotaErrorHandling` helper.
- **Schema versioning (new):** [src/utils/document-storage-migrations.ts](src/utils/document-storage-migrations.ts) — `migrateEntry(entry)` plus the version constant.
- **Autosave hook (new):** [src/hooks/useAutosave.ts](src/hooks/useAutosave.ts) — subscribes to the current tree, debounces writes, calls `updateEntryTree`.
- **Recents hook (new):** [src/hooks/useRecentDocuments.ts](src/hooks/useRecentDocuments.ts) — surfaces the list, exposes `loadEntry` / `deleteEntry`, reacts to writes.
- **Upload view:** [src/components/LoadDocument.tsx](src/components/LoadDocument.tsx) — render the recents list above the upload affordance; wire up resume + delete.
- **Recents components (new):** [src/components/RecentDocumentsList.tsx](src/components/RecentDocumentsList.tsx) and a small `DeleteConfirmDialog`.
- **Entry creation on upload:** the existing `onConvert` flow in [App.tsx:13](src/App.tsx#L13) generates an entry id client-side and immediately writes the initial entry (tree + source bytes + mime + filename) to IndexedDB.
- **Toolbar:** [src/components/Toolbar.tsx](src/components/Toolbar.tsx) — no functional change, but the "Close Editor" affordance no longer routes through `window.confirm`.
- **Private-mode banner (new):** [src/components/PrivateModeBanner.tsx](src/components/PrivateModeBanner.tsx) and a `detectEphemeralStorage` probe in the storage module.
- **Quota toast:** lightweight in-app toast (no existing toast system — add a minimal one in [src/components/ui/](src/components/ui/) or co-locate; see design D4).
- **Tests:** every file above gains a corresponding `*.test.*`. IndexedDB code is exercised against `fake-indexeddb`, which is a new dev dependency. No production deps added — `marked`, `dompurify`, `mammoth`, and IDB primitives cover the surface.
- **Dependencies (new):** `fake-indexeddb` (devDependency).
- **No data migration required:** there is no production storage today. The change is purely additive.

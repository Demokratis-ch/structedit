## Context

StructEdit today holds the active document in React state in [App.tsx:8](src/App.tsx#L8). The source preview is a `URL.createObjectURL(blob)` of whatever the user uploaded, created in [file-processing.ts:98](src/utils/file-processing.ts#L98). There is no client-side persistence layer: no `localStorage`, no `IndexedDB`, nothing. Closing the tab destroys the in-flight edits, and there is no way to come back to a previous session.

A `Download JSON` button exists ([EditorInterface.tsx:54](src/components/EditorInterface.tsx#L54)) that serialises the tree to disk. It is the explicit export path and the future plumbing for Demokratis upload. It is **not** an autosave story — the user has to remember to use it, and there is no matching "open saved JSON" import.

The deployment target is static GitHub Pages (`demokratis-ch.github.io/structedit/`). A server-side save story is therefore not on the table for this change. The next real save destination is Demokratis upload, which is out of scope here. This change exists to bridge that gap client-side.

The user has set the following constraints (see proposal):

- Autosave, not manual save.
- A picker of up to 20 recent documents on the upload view; bin icon to delete.
- Persist the original source bytes (the side-by-side preview disappearing on resume is a dealbreaker).
- Every upload creates a new entry — no dedup by file hash.

## Goals / Non-Goals

**Goals:**

- The user can edit a complex document over multiple sessions without losing progress to refreshes, crashes, or tab-closes — provided they return in the same browser profile.
- The user can pick up any of their last 20 edits from the upload screen, by name and timestamp, and resume both the tree and the source-preview side-by-side.
- The user can delete any saved entry from the picker.
- The storage layer is bounded (≤ 20 entries) and self-pruning; the user is never asked to "manage storage" outside of explicit deletes.
- The storage layer is forward-compatible: schema changes can land without losing data, and entries that fail to migrate stay visible and flagged rather than silently disappearing.
- The storage layer fails loudly when it cannot save (quota, storage policy), never silently.
- Every behavioural change is introduced via a failing test first (red), then minimal code to pass (green), per [CLAUDE.md](CLAUDE.md) and the precedent in `add-per-node-formatting-mode`.

**Non-Goals:**

- No cross-device sync (no backend; that's Demokratis's job later).
- No multi-tab conflict resolution. If a user opens the same entry in two tabs, last-writer-wins. Mentioned and accepted.
- No persisted undo/redo history. Resuming an entry restores the current tree and resets the history stack to a single committed state.
- No JSON import from the upload view. The "Download JSON" button stays as the explicit export; autosave covers the everyday case.
- No on-the-fly compression of stored source bytes. The 20-entry cap with LRU eviction is the bound; quota errors are surfaced rather than worked around.
- No content thumbnails or document preview in the picker — title, timestamp, and bin icon only.
- No search box on the picker (cap is 20).
- No editing of an entry's name from the picker (filename if known, generated "Untitled (timestamp)" otherwise).
- No persistence of UI state (split-pane size, scroll position, selection). Only the canonical document state.

## Decisions

### D1. Storage: IndexedDB, one object store, source bytes inline

Use IndexedDB rather than `localStorage` because DOCX files routinely exceed 1 MB and a single 20-entry library can approach 50–100 MB; `localStorage` is ~5 MB and string-only.

One database (`structedit`), one object store (`documents`), `keyPath: 'id'`, one index:

- `updatedAt` — drives the recents ordering and LRU eviction.

(No `contentHash` index — every upload is a new entry, per decided UX.)

Source bytes live inline on the record as `ArrayBuffer` (DOCX/HTML) or `string` (pasted text), alongside their MIME type. IndexedDB handles both natively. We do not split source into a separate store: with a 20-entry cap and per-entry-atomic reads/writes, the simplicity wins over the small per-write payload cost.

_Rejected: `localStorage`_ — too small, no binary support.
_Rejected: split store for source bytes_ — premature optimisation; complicates atomic updates.

### D2. Record schema

```ts
interface StoredDocumentEntry {
  id: string;                  // generated at upload time, e.g. crypto.randomUUID()
  schemaVersion: 1;            // bumped on breaking shape changes; migrations dispatch on this
  name: string;                // filename if uploaded, "Untitled (YYYY-MM-DD HH:mm)" otherwise
  subtitle: string | null;     // first ~40 chars of source for pasted text; null for files
  language: Language;          // mirrors today's hardcoded 'de' default, future-proofs
  tree: ContainerDocumentNode; // canonical edited state
  source: {
    kind: 'docx' | 'html' | 'pasted-text';
    mime: string;              // 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'text/html' | 'text/plain'
    bytes: ArrayBuffer | string; // ArrayBuffer for binary, string for text
    originalFilename: string | null;
  };
  createdAt: number;           // ms since epoch
  updatedAt: number;           // ms since epoch — also the LRU key
  byteSize: number;            // approximate serialized size — used by quota-driven eviction (D8)
}
```

`byteSize` is computed at every write as `source.bytes.byteLength` (binary) or `new TextEncoder().encode(source.bytes).byteLength` (text), plus `new TextEncoder().encode(JSON.stringify(tree)).byteLength`. The exact value does not need to be perfect — it is used as input to the eviction-budget math in D8, which only cares about order-of-magnitude correctness.

Validation on read: `isValidDocument(entry.tree)` from [src/types/document.ts](src/types/document.ts) is the source of truth. An entry whose tree fails validation after migration is flagged incompatible (D6).

_Rejected: storing the rendered HTML preview alongside_ — the preview is reconstructible from `source.bytes + source.mime` via `URL.createObjectURL(new Blob(...))`; storing it separately would just be a cache and a synchronisation risk.

### D3. Entry lifecycle

```
              ┌──────────────────────────────────────────────────────┐
              │                                                      │
   upload ──▶ │  generate id    write initial entry    set state ─┐  │
   /paste     │  (sync)         (async, fire-and-       (sync)    │  │
              │                  forget but awaited)              │  │
              │                                                   ▼  │
              │                                       autosave hook  │
              │                                       subscribes &   │
              │                                       writes on      │
              │                                       change         │
              └──────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              user closes editor
                                       │
                                       ▼
                          entry remains in IndexedDB,
                          surfaces in recents picker
                                       │
                                       ▼
                              user clicks entry
                                       │
                                       ▼
              ┌──────────────────────────────────────────────────────┐
              │  read entry        rebuild blob URL   set state      │
              │  from IDB          from bytes+mime    (tree, url,    │
              │                    (URL.create-       name, id)      │
              │                     ObjectURL)        revoke prior   │
              │                                       url            │
              └──────────────────────────────────────────────────────┘
```

The id is generated at upload time and held alongside the document state. The first IndexedDB write is awaited within the upload handler so that the editor renders only after the entry is durable. This avoids a race where the user's first keystrokes target an entry that does not yet exist.

_Rejected: lazy entry creation on first edit_ — would lose the very first edits if the user refreshes during the first action, which is exactly when autosave matters most.

### D4. Autosave: debounce, write-through

`useAutosave(currentEntryId, document)`:

- On every change to the `document` reference, schedule a write with a 500 ms debounce.
- On `beforeunload`, flush synchronously (best-effort — browsers may or may not honour it).
- On entry switch / unmount, flush pending write first.
- Writes call `updateEntryTree(id, tree)` — a small surface that takes only the mutable parts (tree, `updatedAt`). The source bytes are written once at entry creation and never overwritten.
- Failures of any write surface via the quota-handler (D5).

We deliberately do NOT write on every keystroke, and we do NOT batch writes any larger. 500 ms is short enough that lost-keystrokes on crash are bounded to ~½ second of typing, long enough that typing in a hot editor doesn't open an IDB transaction per keystroke.

_Rejected: write on each history commit_ — history commits can lag a keystroke (e.g., during composition), making the cadence unpredictable.
_Rejected: write on `idle`_ — too coarse, and `requestIdleCallback` is not universal.

### D5. Toast infrastructure

Toast infrastructure supports the one quota case where eviction cannot help (defined in D8). We have no toast infrastructure today. Add a minimal one in [src/components/ui/Toast.tsx](src/components/ui/Toast.tsx) — built on `@radix-ui/react-toast` for accessibility (aria-live, focus management, pause-on-hover) with a 5-second auto-dismiss, close button, and single-slot semantics. One component, one hook (`useToast`), no queue.

The toast message itself is set by D8 (it includes the document size and free space when known). The toast is single-shot per session — repeated quota errors do not stack.

_Out of scope: private/incognito browsing detection._ Modern browsers permit IndexedDB in private mode but wipe it on session end. There is no standard API to detect this reliably, and the heuristic alternatives (small quota threshold, `navigator.storage.persisted()`) trade false-negatives for false-positives. We accept the same trust model as any locally-cached web app: users who deliberately use private mode also accept that local state is ephemeral.

### D6. Schema versioning and incompatible entries

Every stored entry carries `schemaVersion: number`. Today's value is `1`. The storage module exposes:

```ts
function migrateEntry(raw: unknown): StoredDocumentEntry | { status: 'incompatible'; id: string; name: string; updatedAt: number };
```

`migrateEntry` runs the version-dispatch chain, then calls `isValidDocument(result.tree)`. If either fails, the entry is returned in the `incompatible` shape — enough to render a placeholder in the picker without exposing potentially-broken state to the editor.

The picker renders incompatible entries as disabled rows with a `⚠ incompatible` badge and the bin icon still functional. They never auto-delete. The user is in control.

When a future change bumps the schema to `2`, it ships a `migrateV1ToV2` function and an update to the version constant in the same PR. The `migrate` chain runs newest-version-last; if any step throws, the entry is incompatible.

_Rejected: silently dropping incompatible entries_ — that loses user work.
_Rejected: putting the migration code in each consumer_ — it must run at the storage boundary so the rest of the app sees only validated data.

### D7. Recents picker UX

The picker renders inside [LoadDocument.tsx](src/components/LoadDocument.tsx), above the upload affordance. When the list is empty, it is not rendered at all (so first-time users see the existing upload UI unchanged).

Each row shows:

```
┌──────────────────────────────────────────────────────────┐
│ 📄  bill-of-rights.docx          2 hours ago      🗑    │
│ 📄  Untitled (2026-05-12 18:04)  yesterday        🗑    │
│      "Sehr geehrte Damen und Herren …"                   │
└──────────────────────────────────────────────────────────┘
```

- Clicking the row (anywhere outside the bin icon) loads the entry and routes the user to the editor view.
- Clicking the bin icon opens a small confirm dialog ("Delete this saved document? This cannot be undone."). Confirm → call `deleteEntry(id)` → list refreshes.
- Disabled (incompatible) rows are not clickable, but the bin icon still works.

Sort order: `updatedAt` descending. Cap: 20 (rendered). Eviction beyond 20 happens at write time (D8), so the rendered list and the stored list are always in sync.

Date formatting is relative: "Just now" (< 1m), "X minutes ago" (< 1h), "X hours ago" (< 24h), "Yesterday", "X days ago" (< 7d), then `YYYY-MM-DD`. Tooltip on hover shows the exact ISO timestamp.

_Rejected: a thumbnail preview_ — out of scope; the metadata covers the picker's job.
_Rejected: an "edit name" affordance_ — adds complexity; users can re-upload if they need a different name.

### D8. Eviction policy: count cap and quota-driven, measured before destructive

Eviction handles two situations with the **same mechanism** (delete oldest by `updatedAt`) but two different triggers. The earlier draft had a defensible asymmetry — silent at 20, loud on quota — but a reviewer pointed out the obvious correction (apply silent eviction to quota too) has its own failure mode: a single 60 MB DOCX that won't fit even on an empty database would happily nuke all 19 other docs trying to make room, then still fail. Worst-of-both. The fix is to **measure before evicting** so eviction only happens when it would actually succeed.

#### Count-cap eviction (silent)

`createEntry` runs in a single transaction:

1. Insert the new record.
2. Count entries in the store.
3. If count > 20, fetch entries sorted by `updatedAt` ascending, delete the oldest until count = 20.

Why at create-time, not on every update: an update never grows the count; only create does. The cap (`MAX_RECENTS = 20`) lives in the storage module as a named constant. Tests reference it by name, not literal.

#### Quota-driven eviction (silent when it would help, toast when it cannot)

When a write would fail (or has just failed) with `QuotaExceededError`:

1. Compute `pendingSize` — the `byteSize` of the record being written (D2).
2. Compute `availableSpace = quota - usage` via `navigator.storage.estimate()`.
3. Compute `evictableSpace` — the sum of `byteSize` over all entries other than the one being written, oldest-first.
4. **If `pendingSize > availableSpace + evictableSpace`** → the write is impossible regardless of cleanup. Do **not** delete anything. Surface a single toast: *"This document is X MB; browser storage has Y MB free."* The in-memory document is unaffected; editing continues; the toast is the user's signal that they need to act (use Download JSON, switch to a smaller doc, or accept that this session won't autosave).
5. **Otherwise** → evict entries in `updatedAt`-ascending order one at a time, recomputing `availableSpace` after each delete, until `availableSpace >= pendingSize`. Then retry the write. If the retry still throws `QuotaExceededError` (the estimate was off, or another tab consumed space concurrently), stop further eviction and fall through to the toast in step 4. This avoids runaway deletion.

Eviction in step 5 is silent — same UX as the count-cap path. The toast only fires when no amount of cleanup would help.

#### Browsers without `navigator.storage.estimate()`

A small minority of browsers (older Safari versions, some embedded engines) do not expose `navigator.storage.estimate()`. In that environment we cannot compute the budget, so we degrade to: attempt the write once; on `QuotaExceededError`, **do not evict** (we can't tell whether it would help), surface the toast with a generic message: *"Browser storage is full. Use Download JSON to save this document, or delete some recent documents from the picker."* This is safe — no surprise data loss — and the count-cap eviction path is unaffected.

Detection is feature-detection at the call site, not a separate probe: `'storage' in navigator && 'estimate' in navigator.storage`.

_Rejected: size-based eviction policy (e.g., "evict at 100 MB regardless of quota")_ — duplicates browser quota tracking and would either be too eager (delete when there's room) or too lax (don't delete when the browser refuses).
_Rejected: retry-after-evict without the budget check_ — would silently delete every other entry trying to make room for a write that can't succeed, as the reviewer flagged on the issue.
_Rejected: a manual "free up space" UI surface_ — the bin icon on each row already covers explicit deletion; the budget math + toast covers the rare case where eviction can't help.

### D9. Object-URL lifecycle

Today's bug ([App.tsx:32](src/App.tsx#L32)): the prior `documentUrl` is never `URL.revokeObjectURL`'d. This leaks until tab close. The change cycles object URLs more often (on every resume from picker), so we fix this now.

Single rule, enforced in `App.tsx`: whenever `documentUrl` is replaced, revoke the previous value. Implemented via a small effect that captures the current URL on mount/update and revokes on cleanup. The "Back to upload view" path also revokes.

We deliberately do NOT store the object URL in IndexedDB or attempt to persist it — `blob:` URLs are scoped to the document that created them and are not valid after a reload. The Blob is reconstructed from `source.bytes + source.mime` on every resume.

### D10. TDD ordering

Per project standing instructions, each task in tasks.md follows: write failing test → implement → confirm green → refactor. The implementation order is bottom-up:

1. `document-storage` IndexedDB wrapper + migrations (against `fake-indexeddb`).
2. Schema-version migration scaffolding (v1 only; structure ready for v2).
3. `useRecentDocuments` hook.
4. `useAutosave` hook.
5. Recents UI (list + delete dialog).
6. Quota toast.
7. App-level wiring: id generation on upload, autosave subscription, object-URL revoke, drop the unsaved-changes confirm.

### D11. Tests against `fake-indexeddb`

Vitest runs against jsdom, which has no IndexedDB. Use `fake-indexeddb/auto` in the Vitest setup file so the storage module under test sees a real-shaped IndexedDB. The dev dependency `fake-indexeddb` is small (~30 kB) and is the canonical choice.

Mock at the storage-module boundary for hook tests (`useAutosave`, `useRecentDocuments`) so they're not coupled to IDB internals.

### D12. App-state shape changes

Today, App.tsx holds:

```ts
document, documentUrl, fileName, view
```

After this change:

```ts
document, documentUrl, fileName, view, currentEntryId
```

`currentEntryId` is `null` only on the upload view. On the editor view it is always a string — the entry the autosave hook is writing to.

The `handleConvert` callback in [App.tsx:13](src/App.tsx#L13) gains an `entryId` parameter (generated by `LoadDocument` / `RecentDocumentsList` at the moment they create or load an entry). This keeps id generation and durable-write at the source-of-truth, not in App.

`handleBack` ([App.tsx:25](src/App.tsx#L25)) drops the `window.confirm` and gains a call to `URL.revokeObjectURL` for the outgoing `documentUrl`. Setting `currentEntryId` to null is part of returning to the upload view.

## Risks / Trade-offs

- **[Single browser, single profile]** → Mitigation: explicit non-goal; documented. Users who need cross-device must use Download JSON until Demokratis upload lands.
- **[Two tabs of the same entry → clobber]** → Mitigation: documented edge case; last-writer-wins. A future enhancement could use `BroadcastChannel` to detect & warn.
- **[Storage quotas vary by browser; a single huge DOCX can fail the first write]** → Mitigation: D8's measure-before-evict policy. If eviction can free enough space, it happens silently. If not — including the "this doc is too big to fit at all" case — nothing is deleted and the toast tells the user what's going on. The 20-entry cap bounds long-term growth.
- **[`byteSize` is approximate]** → Mitigation: order-of-magnitude is sufficient for the budget check. If the estimate underclaims and a post-eviction retry still fails, D8 step 5 catches the case and stops further eviction.
- **[Schema drift]** → Mitigation: `schemaVersion` + migration chain from day 1; incompatible entries are flagged, not deleted.
- **[Private/incognito surprises]** → Accepted, not mitigated. Modern browsers keep IDB working in private mode but wipe everything when the tab closes; there is no standard API to detect this reliably. Users in private mode get the same UX as normal mode within the session and lose their work on close. See D5 for the reasoning.
- **[`URL.createObjectURL` allocates memory per call]** → Mitigation: D9's revoke-on-switch rule. Tested explicitly.
- **[The picker reveals work to anyone on the same browser profile]** → Mitigation: out of scope here; same trust model as any locally-cached web app.
- **[`document.execCommand` and other browser APIs in the editor]** → Unchanged by this work; called out only because the editor's existing reliance on browser quirks is independent of the storage layer.

## Migration Plan

There is no production storage layer today, so nothing on-disk needs to migrate. The change is purely additive:

1. Ship the storage module, hooks, and UI in a single PR.
2. First-time users see the existing upload UI (recents list is empty → hidden).
3. Subsequent uploads start populating IndexedDB; recents appears on next load.
4. Rollback is a single revert. No on-disk artifacts to clean up — orphaned IndexedDB databases are bounded by browser storage policy.

Future schema changes follow D6: bump `SCHEMA_VERSION`, add a `migrateVNToVN+1` function, list it in the chain. The change to add a migration must include tests for the migration function itself plus a regression read-test against a fixture entry of the previous version.

## Open Questions

- **Tooltip on relative timestamps in the picker** — should the tooltip render ISO or the user's locale? Going with ISO (`YYYY-MM-DD HH:mm:ss`) for unambiguity; revisit after feedback.
- **Bin icon confirm dialog reuse** — do we have an existing modal/dialog primitive? Quick survey says no. The dialog can be a small inline component for v1; a shared `<ConfirmDialog>` may emerge if a second use case appears.
- **Should the picker show the storage cost per entry** (e.g., "3.2 MB")? Useful when triaging a quota error. Out of scope for v1; flagged for later.
- **Future: `BroadcastChannel` to warn on multi-tab conflicts** — out of scope, but the storage module's API should not preclude adding it later.

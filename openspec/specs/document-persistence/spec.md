# document-persistence Specification

## Purpose
Persist the user's work to IndexedDB so it survives reloads without an explicit save action: debounced autosave of the active tree, a recent-documents picker (resume, rename, delete), the original source stored alongside the tree so the side-by-side preview can be rebuilt, schema versioning with migrations, and a quota strategy that silently evicts old entries when that helps and surfaces a toast only when nothing can.
## Requirements
### Requirement: Autosave writes the active document to IndexedDB

The system SHALL persist the active document tree to IndexedDB whenever it changes, without requiring an explicit "Save" action from the user. Writes SHALL be debounced so that rapid edits do not open one transaction per keystroke. The user-facing in-memory document SHALL NOT depend on the success of any write; failed writes (quota, storage policy) SHALL surface to the user but SHALL NOT block editing.

#### Scenario: Editing a node triggers an autosave write

- **WHEN** the user edits a node inside an active editing session
- **THEN** within one debounce interval the corresponding entry in IndexedDB has an updated `tree` field reflecting the edit and an `updatedAt` timestamp greater than its prior value

#### Scenario: Rapid edits coalesce into a single write

- **WHEN** the user makes multiple changes within the debounce interval
- **THEN** at most one IndexedDB write is issued, and that write reflects the latest tree state

#### Scenario: Autosave is a no-op without an active entry

- **WHEN** there is no `currentEntryId` (the user is on the upload view)
- **THEN** no IndexedDB write is issued, regardless of any state changes

### Requirement: Source bytes are persisted alongside the tree

For each saved entry the system SHALL persist the original source bytes together with their MIME type and original filename, tagged with a `source.kind` recording the entry's origin: `'docx'` (uploaded DOCX), `'html'` (uploaded HTML file **or** a document fetched via a `loadFile` URL — see the remote-document-loading spec), `'pasted-text'`, or `'json-envelope'` (re-imported DocTree JSON). On resume, the system SHALL rebuild the side-by-side source preview from those bytes — the user SHALL NOT need to re-attach the original file — except for `'json-envelope'` entries, where the JSON *is* the tree and no separate "Original" preview exists.

#### Scenario: DOCX upload persists the renderable HTML produced by mammoth

- **WHEN** the user uploads a `.docx` file and an entry is created
- **THEN** the stored entry's `source.bytes` is the converted HTML string produced by mammoth, `source.mime` is `'text/html'`, `source.kind` is `'docx'` (origin tracking), and `source.originalFilename` is the uploaded filename
- **NOTE** The original DOCX bytes are not persisted because no browser renders `application/vnd.openxmlformats-officedocument.wordprocessingml.document` inline — a `blob:` URL with that MIME would be offered for download instead of showing the preview on resume. The converted HTML is exactly what the preview pane renders on fresh upload, so the resumed preview is bit-identical.

#### Scenario: Pasted text persists as text

- **WHEN** the user pastes text and converts it to an entry
- **THEN** the stored entry's `source.bytes` is a string equal to the pasted source, `source.mime` is `'text/plain'` or `'text/html'` per the existing HTML-detection rule, `source.kind` is `'pasted-text'`, and `source.originalFilename` is `null`

#### Scenario: Resuming an entry reconstructs the source preview

- **WHEN** the user clicks a recent entry in the picker
- **THEN** the editor opens with the entry's tree and a fresh blob URL constructed from `source.bytes` and `source.mime`, so the source-preview pane shows the original document

#### Scenario: DocTree JSON import persists the raw JSON but has no source preview

- **WHEN** the user uploads a DocTree-envelope `.json` file previously produced by "Download JSON"
- **THEN** the stored entry's `source.kind` is `'json-envelope'`, `source.mime` is `'application/json'`, `source.bytes` is the raw JSON text, and the entry's `name` is derived from `metadata.title` (German first, then any locale) falling back to the filename
- **AND** both at import and on resume the editor's `documentUrl` is `null`, so only the rendered Preview is shown — there is no "Original" pane to rebuild because the JSON is the tree itself

### Requirement: Every upload creates a new entry

The system SHALL create a new entry for every upload or conversion action, regardless of whether an entry with the same source already exists. The system SHALL NOT deduplicate by file hash or filename.

#### Scenario: Re-uploading the same file creates a second entry

- **WHEN** the user uploads `bill.docx`, edits it, then uploads `bill.docx` again
- **THEN** the recents list contains two entries — the older one with the prior edits intact, the newer one fresh from the file

#### Scenario: Pasted-text entries are always new

- **WHEN** the user converts pasted text twice with identical content
- **THEN** two separate entries exist, each with its own `id` and `createdAt`

### Requirement: Pasted-text entries receive an auto-generated name

The system SHALL name pasted-text entries `"Untitled (YYYY-MM-DD HH:mm)"` using the local-time creation timestamp, and SHALL store a subtitle equal to the first ~40 characters of the source (trimmed, with a trailing ellipsis when truncated). File-upload entries SHALL initially be named with the original filename and SHALL have a `null` subtitle. (Names can subsequently be changed by the user — see the rename requirement.)

#### Scenario: Pasted text yields a timestamped name and subtitle

- **WHEN** the user converts the pasted source `"Sehr geehrte Damen und Herren, hiermit teile ich Ihnen mit ..."` at local time 2026-05-12 18:04
- **THEN** the new entry's `name` equals `"Untitled (2026-05-12 18:04)"` and its `subtitle` equals `"Sehr geehrte Damen und Herren, hiermit teile ..."` (first 40 chars + ellipsis)

#### Scenario: File upload uses the filename verbatim

- **WHEN** the user uploads `Vorlage Botschaft.docx`
- **THEN** the new entry's `name` equals `"Vorlage Botschaft.docx"` and its `subtitle` is `null`

### Requirement: The document title is renameable and the rename persists

The system SHALL let the user rename the open document inline from the header (double-click, or focus + Enter/Space, opens an input; Enter or blur commits the trimmed value; Escape cancels; empty or unchanged input is a no-op). A committed rename SHALL update the in-memory title immediately and persist to the entry's `name` in IndexedDB via `updateEntryName`. When there is no current entry (the initial persist failed, e.g. storage full), the rename SHALL still apply in memory without blocking or erroring — it simply does not survive a reload. The persisted name flows into the JSON export.

#### Scenario: Committing a rename persists to the entry

- **WHEN** the user renames the open document from `"bill.docx"` to `"Revised bill"` and commits
- **THEN** the header shows `"Revised bill"`, the entry's `name` in IndexedDB equals `"Revised bill"`, and the recents picker shows the new name after returning to the upload view

#### Scenario: Rename without a persisted entry still applies in memory

- **WHEN** the initial persist failed (no `currentEntryId`) and the user commits a rename
- **THEN** the header shows the new title and no persistence error blocks the interaction

### Requirement: Recents are listed up to 20, sorted by most recent update

The system SHALL expose a "recent documents" list on the upload view containing up to 20 entries sorted by `updatedAt` descending. When the list is empty the picker SHALL be hidden so that first-time users see the existing upload UI unchanged.

#### Scenario: Empty list hides the picker

- **WHEN** the user opens the app and IndexedDB contains zero entries
- **THEN** no picker UI is rendered on the upload view

#### Scenario: Newest entry appears first

- **WHEN** three entries exist with `updatedAt` of 09:00, 12:00, and 16:00
- **THEN** the picker renders them in the order 16:00, 12:00, 09:00

#### Scenario: Cap at 20 in the rendered list

- **WHEN** IndexedDB contains exactly 20 entries
- **THEN** the picker renders 20 rows; the eviction behaviour for a 21st entry is defined in the "Eviction is silent when it would help" requirement

### Requirement: Eviction is silent when it would help, never destructive when it would not

Eviction deletes the entry with the oldest `updatedAt` and has two triggers — a 20-entry cap, and a quota-driven retry — that share one rule: **eviction only happens when it would actually allow the write to succeed**. Eviction is silent in both cases. The cap SHALL be exposed as a named constant `MAX_RECENTS = 20`.

The two triggers apply to different operations: the count cap applies only when **creating** a new entry; the quota-driven retry applies to **any** write that raises `QuotaExceededError` — including an autosave update of an existing entry, which may therefore evict *other* (older) entries under the same budget rules. The entry being written is never itself an eviction candidate.

#### Scenario: Creating a 21st entry silently evicts the oldest (count cap)

- **GIVEN** 20 entries in IndexedDB, with the oldest having `updatedAt = T0`
- **WHEN** the user uploads a new file, creating a 21st entry
- **THEN** at the end of the transaction IndexedDB contains 20 entries, the new one is present, the entry with `updatedAt = T0` is absent, and no toast or banner is shown

#### Scenario: Updating an existing entry never evicts on the count cap

- **GIVEN** 20 entries in IndexedDB
- **WHEN** an autosave updates one of them (`updateEntryTree`) without hitting a quota error
- **THEN** the count remains 20 and no entry is deleted (only quota pressure — never the count cap — can trigger eviction on an update)

#### Scenario: Quota-driven eviction silently makes room when it can

- **GIVEN** several stored entries and a pending write that would exceed the browser's storage quota by less than the total size of older evictable entries
- **WHEN** the storage layer attempts the write and `QuotaExceededError` would be raised
- **THEN** the storage layer evicts entries in `updatedAt`-ascending order — recomputing available space after each delete via `navigator.storage.estimate()` — until the pending write fits, then completes the write silently. No toast is shown.

#### Scenario: Eviction stops as soon as the budget is met

- **GIVEN** five entries with byte sizes `[5MB, 5MB, 5MB, 5MB, 5MB]` ordered oldest-first and a pending 8 MB write into a quota with 3 MB free
- **WHEN** quota-driven eviction runs
- **THEN** exactly one entry (the oldest 5 MB) is deleted, freeing enough space to write; the remaining four entries are intact

#### Scenario: When eviction cannot possibly help, nothing is deleted

- **GIVEN** a pending write whose `byteSize` exceeds `availableSpace + evictableSpace` (the sum of all other entries' sizes)
- **WHEN** the storage layer evaluates the budget for a quota-driven eviction
- **THEN** no entries are deleted, the write is not attempted, and a single toast is shown (see the next requirement). All existing entries remain in the picker, unchanged.

### Requirement: Recents can be loaded and deleted from the picker

The system SHALL let the user resume editing any listed entry by clicking its row. The system SHALL let the user delete any listed entry via a bin icon on the row, gated by a confirm dialog. Deletion SHALL be immediate and irreversible.

#### Scenario: Clicking a row resumes editing

- **WHEN** the user clicks a recent-document row (outside the bin icon)
- **THEN** the editor view opens with that entry's `tree`, the source-preview pane displays the entry's persisted source, and subsequent autosaves write to that entry's `id`

#### Scenario: Clicking the bin icon opens a confirm dialog

- **WHEN** the user clicks the bin icon on a recent-document row
- **THEN** a dialog appears asking "Delete this saved document? This cannot be undone." with Cancel and Delete buttons; clicking Cancel leaves the entry untouched

#### Scenario: Confirming deletion removes the entry

- **WHEN** the user confirms deletion of a row
- **THEN** the entry is removed from IndexedDB and the recents list refreshes without that row

### Requirement: Schema versioning surfaces incompatible entries without deleting them

Every stored entry SHALL carry a `schemaVersion: number` field. On read, the system SHALL run a migration chain to bring older entries up to the current schema. Entries that cannot be migrated, or whose migrated tree fails `isValidDocument`, SHALL be returned in an `incompatible` shape that carries `id`, `name`, and `updatedAt` only. Incompatible entries SHALL be listed in the picker as disabled rows with a `⚠ incompatible` badge; they SHALL NOT be silently deleted.

#### Scenario: A clean current-version entry round-trips

- **WHEN** an entry written with the current `SCHEMA_VERSION` is read back
- **THEN** `migrateEntry` returns the full `StoredDocumentEntry` shape with a valid tree

#### Scenario: An entry with an invalid tree is flagged incompatible

- **WHEN** an entry exists whose `tree` fails `isValidDocument`
- **THEN** `migrateEntry` returns `{ status: 'incompatible', id, name, updatedAt }` and the picker renders that entry as a disabled row with the incompatible badge

#### Scenario: An entry with a future schemaVersion is flagged incompatible

- **WHEN** an entry exists with a `schemaVersion` greater than the current `SCHEMA_VERSION`
- **THEN** `migrateEntry` returns the incompatible shape; the entry is NOT deleted

#### Scenario: Incompatible entries can still be deleted by the user

- **WHEN** the user clicks the bin icon on an incompatible row and confirms
- **THEN** the entry is removed from IndexedDB

### Requirement: A toast surfaces only when eviction cannot resolve a quota failure

The toast is the last-resort signal that **no amount of cleanup will let the write succeed**. The system SHALL show a single toast in exactly two cases: (a) the pending write is larger than `availableSpace + evictableSpace` so eviction is skipped, or (b) a post-eviction retry still throws `QuotaExceededError` (the size estimate was off, or another tab consumed space concurrently). In either case the in-memory document SHALL be untouched and editing SHALL continue. Repeated quota failures within the same session SHALL NOT stack multiple toasts.

The toast message SHALL include the document size and the free-space estimate when both are known (e.g. "This document is 47 MB; browser storage has 32 MB free.") and fall back to a generic message ("Browser storage is full. Use Download JSON to save this document, or delete some recent documents from the picker.") when `navigator.storage.estimate()` is unavailable.

#### Scenario: Toast fires when the write cannot possibly fit

- **GIVEN** a pending 60 MB write into a browser context with 40 MB total quota and 18 entries currently storing a combined 12 MB
- **WHEN** the storage layer evaluates the eviction budget
- **THEN** a single toast is shown with the size-aware message; no entries are deleted; the in-memory tree is unchanged

#### Scenario: Toast fires when post-eviction retry still fails

- **GIVEN** a pending write whose `byteSize` says it should fit after evicting two old entries
- **WHEN** the storage layer evicts those two entries, retries the write, and `QuotaExceededError` is raised again
- **THEN** further eviction stops, a single toast is shown, and the entries that were already deleted in the retry attempt remain deleted (they were valid eviction targets by the budget at the time)

#### Scenario: Subsequent quota failures do not stack

- **WHEN** a second quota failure occurs in the same session
- **THEN** at most one toast is visible at a time; new toasts replace or extend the existing one rather than queueing

#### Scenario: Browsers without `navigator.storage.estimate()` do not evict on quota

- **GIVEN** a browser that does not expose `navigator.storage.estimate()`
- **WHEN** an autosave write throws `QuotaExceededError`
- **THEN** no eviction is attempted (the budget cannot be computed), a single toast is shown with the generic fallback message, and the in-memory tree is unchanged

### Requirement: Object URLs are revoked when the active document changes

The system SHALL call `URL.revokeObjectURL` on any prior `documentUrl` whenever the active document changes — including returning to the upload view, uploading a new file, and resuming a recent entry. The system SHALL NOT leak more than one outstanding object URL at any time.

#### Scenario: Resuming a recent entry revokes the previous URL

- **GIVEN** an active editing session with `documentUrl = u1`
- **WHEN** the user resumes a different recent entry, producing `documentUrl = u2`
- **THEN** `URL.revokeObjectURL(u1)` is called before or as `u2` becomes active

#### Scenario: Returning to upload revokes the URL

- **WHEN** the user clicks Close Editor with `documentUrl = u1`
- **THEN** `URL.revokeObjectURL(u1)` is called and `documentUrl` becomes `null`

### Requirement: The unsaved-changes confirm is removed

Because the active document is autosaved, the existing `window.confirm("Are you sure you want to go back? Unsaved changes will be lost.")` on the Close-Editor action SHALL be removed. Returning to the upload view SHALL be a one-click action that surfaces the recents picker so the user can resume the same entry immediately if desired.

#### Scenario: Close Editor does not prompt

- **WHEN** the user clicks Close Editor while inside an editing session
- **THEN** no confirm dialog appears; the upload view is shown and the just-closed entry appears at the top of the recents picker


## ADDED Requirements

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

For each saved entry the system SHALL persist the original source bytes (the uploaded DOCX/HTML or the pasted text) together with their MIME type and original filename. On resume, the system SHALL rebuild the side-by-side source preview from those bytes — the user SHALL NOT need to re-attach the original file.

#### Scenario: DOCX upload persists its bytes

- **WHEN** the user uploads a `.docx` file and an entry is created
- **THEN** the stored entry's `source.bytes` is an `ArrayBuffer` containing the file's bytes, `source.mime` is the DOCX MIME type, `source.kind` is `'docx'`, and `source.originalFilename` is the uploaded filename

#### Scenario: Pasted text persists as text

- **WHEN** the user pastes text and converts it to an entry
- **THEN** the stored entry's `source.bytes` is a string equal to the pasted source, `source.mime` is `'text/plain'` or `'text/html'` per the existing HTML-detection rule, `source.kind` is `'pasted-text'`, and `source.originalFilename` is `null`

#### Scenario: Resuming an entry reconstructs the source preview

- **WHEN** the user clicks a recent entry in the picker
- **THEN** the editor opens with the entry's tree and a fresh blob URL constructed from `source.bytes` and `source.mime`, so the source-preview pane shows the original document

### Requirement: Every upload creates a new entry

The system SHALL create a new entry for every upload or conversion action, regardless of whether an entry with the same source already exists. The system SHALL NOT deduplicate by file hash or filename.

#### Scenario: Re-uploading the same file creates a second entry

- **WHEN** the user uploads `bill.docx`, edits it, then uploads `bill.docx` again
- **THEN** the recents list contains two entries — the older one with the prior edits intact, the newer one fresh from the file

#### Scenario: Pasted-text entries are always new

- **WHEN** the user converts pasted text twice with identical content
- **THEN** two separate entries exist, each with its own `id` and `createdAt`

### Requirement: Pasted-text entries receive an auto-generated name

The system SHALL name pasted-text entries `"Untitled (YYYY-MM-DD HH:mm)"` using the local-time creation timestamp, and SHALL store a subtitle equal to the first ~40 characters of the source (trimmed, with a trailing ellipsis when truncated). File-upload entries SHALL be named with the original filename and SHALL have a `null` subtitle.

#### Scenario: Pasted text yields a timestamped name and subtitle

- **WHEN** the user converts the pasted source `"Sehr geehrte Damen und Herren, hiermit teile ich Ihnen mit ..."` at local time 2026-05-12 18:04
- **THEN** the new entry's `name` equals `"Untitled (2026-05-12 18:04)"` and its `subtitle` equals `"Sehr geehrte Damen und Herren, hiermit teile ..."` (first 40 chars + ellipsis)

#### Scenario: File upload uses the filename verbatim

- **WHEN** the user uploads `Vorlage Botschaft.docx`
- **THEN** the new entry's `name` equals `"Vorlage Botschaft.docx"` and its `subtitle` is `null`

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
- **THEN** the picker renders 20 rows, and a 21st autosave-induced create has caused the oldest one to be evicted (covered by the next requirement)

### Requirement: Library is capped at 20 entries with LRU eviction

The system SHALL enforce a maximum of 20 entries in IndexedDB. When a write would cause the count to exceed 20, the system SHALL silently delete the entry with the oldest `updatedAt` in the same transaction as the new write. The cap SHALL be exposed as a named constant `MAX_RECENTS` so tests and UI reference the value by name, not literal.

#### Scenario: Creating a 21st entry evicts the oldest

- **GIVEN** 20 entries in IndexedDB, with the oldest having `updatedAt = T0`
- **WHEN** the user uploads a new file, creating a 21st entry
- **THEN** at the end of the transaction IndexedDB contains 20 entries, the new one is present, and the entry with `updatedAt = T0` is absent

#### Scenario: Updating an existing entry never evicts

- **GIVEN** 20 entries in IndexedDB
- **WHEN** an autosave updates one of them (`updateEntryTree`)
- **THEN** the count remains 20 and no entry is deleted

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

### Requirement: Storage quota errors surface a toast without disrupting editing

When an IndexedDB write fails with a quota error, the system SHALL surface a single toast: "Storage full — delete some saved documents to continue saving." The in-memory document SHALL be untouched. Repeated quota errors within the same session SHALL NOT stack multiple toasts.

#### Scenario: Quota error shows a single toast

- **GIVEN** an editing session with a tree in memory
- **WHEN** an autosave write throws `QuotaExceededError`
- **THEN** a toast appears with the storage-full message, and the in-memory tree is unchanged

#### Scenario: Subsequent quota errors do not stack

- **WHEN** a second autosave within the same session also throws `QuotaExceededError`
- **THEN** at most one toast is visible at a time; new toasts replace or extend the existing one rather than queueing

### Requirement: Ephemeral storage is detected and surfaced

On app start the system SHALL probe IndexedDB by writing and reading back a small record. When the probe fails (e.g. private browsing, storage policy), the system SHALL render a sticky banner above the upload view: "Autosave unavailable in private browsing." The picker SHALL be hidden in this mode, and entry creation on upload SHALL be skipped (no writes are attempted).

#### Scenario: Private browsing shows the banner and hides the picker

- **WHEN** the user opens the app in a context where IndexedDB writes do not persist
- **THEN** the upload view renders the private-mode banner and no recents picker

#### Scenario: Editing still works in private mode

- **WHEN** the user uploads a file in private mode
- **THEN** the editor opens and the in-memory tree is fully editable; no IndexedDB writes are attempted; closing the tab loses the work as today

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

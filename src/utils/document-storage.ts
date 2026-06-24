import type { DocumentRootNode, Language } from '../types/document';
import { migrateEntry, SCHEMA_VERSION } from './document-storage-migrations';

export const MAX_RECENTS = 20;
export { SCHEMA_VERSION };

const DB_NAME = 'structedit';
const DB_VERSION = 1;
const STORE = 'documents';
const UPDATED_AT_INDEX = 'updatedAt';

export type SourceKind = 'docx' | 'html' | 'pasted-text' | 'json-envelope';

export interface StoredEntrySource {
  kind: SourceKind;
  mime: string;
  bytes: ArrayBuffer | string;
  originalFilename: string | null;
}

export interface StoredDocumentEntry {
  id: string;
  schemaVersion: number;
  name: string;
  subtitle: string | null;
  language: Language;
  tree: DocumentRootNode;
  source: StoredEntrySource;
  createdAt: number;
  updatedAt: number;
  byteSize: number;
}

/** Type guard: `true` when the entry is the incompatible variant of {@link RecentEntry}. */
export function isIncompatibleEntry(entry: RecentEntry): entry is IncompatibleEntry {
  return 'status' in entry && entry.status === 'incompatible';
}

/**
 * Render a user-visible message for a {@link StorageQuotaUnresolvableError}.
 * Size-aware when the sizes are known; generic when they aren't (e.g. no
 * `navigator.storage.estimate()` available).
 */
export function formatQuotaMessage(err: StorageQuotaUnresolvableError): string {
  if (typeof err.pendingSize === 'number' && typeof err.availableSpace === 'number') {
    const docMB = Math.ceil(err.pendingSize / (1024 * 1024));
    const freeMB = Math.floor(err.availableSpace / (1024 * 1024));
    return `This document is ${docMB} MB; browser storage has ${freeMB} MB free.`;
  }
  return 'Browser storage is full. Use Download JSON to save this document, or delete some recent documents from the picker.';
}

export interface IncompatibleEntry {
  status: 'incompatible';
  id: string;
  name: string;
  updatedAt: number;
}

export type RecentEntry = StoredDocumentEntry | IncompatibleEntry;

export interface CreateEntryInput {
  id: string;
  name: string;
  subtitle: string | null;
  language: Language;
  tree: DocumentRootNode;
  source: StoredEntrySource;
}

/**
 * Thrown when a `QuotaExceededError` from IndexedDB cannot be resolved by silent
 * eviction — either the pending write is larger than `availableSpace + evictableSpace`,
 * a post-eviction retry still failed, or no `navigator.storage.estimate()` is exposed
 * by the browser. The autosave path turns this into a single user-visible toast.
 */
export class StorageQuotaUnresolvableError extends Error {
  readonly kind: 'too-big' | 'retry-failed' | 'no-estimate';
  readonly pendingSize?: number;
  readonly availableSpace?: number;

  constructor(details: {
    kind: 'too-big' | 'retry-failed' | 'no-estimate';
    pendingSize?: number;
    availableSpace?: number;
  }) {
    super(`Storage quota exceeded (${details.kind})`);
    this.name = 'StorageQuotaUnresolvableError';
    this.kind = details.kind;
    this.pendingSize = details.pendingSize;
    this.availableSpace = details.availableSpace;
  }
}

// ----- Test injection points ----------------------------------------------------

type WriteFailHook = () => Error | null;
let _writeFailHook: WriteFailHook | null = null;

/**
 * Test-only: when set, the hook fires before every storage write attempt. If it
 * returns an Error, that error is thrown instead of running the write — letting
 * tests force `QuotaExceededError` deterministically.
 */
export function __setWriteFailHookForTesting(hook: WriteFailHook | null): void {
  _writeFailHook = hook;
}

type StorageEstimate = { available: number; totalQuota: number };
type StorageEstimator = () => Promise<StorageEstimate | null> | StorageEstimate | null;
let _storageEstimator: StorageEstimator | null = null;

/**
 * Test-only: override the `navigator.storage.estimate()` lookup. Pass a function
 * that returns `null` to simulate browsers without the API.
 */
export function __setStorageEstimatorForTesting(estimator: StorageEstimator | null): void {
  _storageEstimator = estimator;
}

// ----- Structural-change notifier (for reactive consumers) ----------------------

type StructuralChangeListener = () => void;
const structuralChangeListeners = new Set<StructuralChangeListener>();

/**
 * Subscribe to "the set of entries changed" events. Fires after a successful
 * `createEntry` or `deleteEntry` — but **not** on `updateEntryTree`, because
 * tree updates only touch existing entries' data, not the list composition.
 *
 * This keeps reactive consumers (e.g. the recents picker) from re-reading the
 * entire object store on every autosave debounce while the user is typing.
 */
export function subscribeToStructuralChanges(fn: StructuralChangeListener): () => void {
  structuralChangeListeners.add(fn);
  return () => {
    structuralChangeListeners.delete(fn);
  };
}

function notifyStructuralChange() {
  for (const l of structuralChangeListeners) {
    try {
      l();
    } catch (err) {
      console.error('storage structural-change listener threw', err);
    }
  }
}

// ----- DB plumbing --------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

// Track in-flight write promises so test teardown (`closeDb`) can drain them
// before resetting the IDB factory — without this the fire-and-forget autosave
// flush in `useAutosave`'s cleanup can land a write into a fresh, empty DB
// between tests and log a spurious "missing entry" error.
const pendingWrites = new Set<Promise<unknown>>();

function trackWrite<T>(p: Promise<T>): Promise<T> {
  const tracked = p.finally(() => pendingWrites.delete(tracked));
  pendingWrites.add(tracked);
  return tracked;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(UPDATED_AT_INDEX, 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  // Drain anything fire-and-forwarded by autosave's beforeunload / unmount paths
  // so a late write doesn't land against the next test's fresh database.
  await Promise.allSettled([...pendingWrites]);
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    db.close();
  } catch {
    // Connection failed to open — nothing to close.
  } finally {
    dbPromise = null;
  }
}

function computeByteSize(tree: DocumentRootNode, source: StoredEntrySource): number {
  const treeBytes = new TextEncoder().encode(JSON.stringify(tree)).byteLength;
  const sourceBytes =
    typeof source.bytes === 'string'
      ? new TextEncoder().encode(source.bytes).byteLength
      : source.bytes.byteLength;
  return treeBytes + sourceBytes;
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'QuotaExceededError';
}

function checkWriteFailHook(): void {
  const err = _writeFailHook?.();
  if (err) throw err;
}

async function getEstimate(): Promise<StorageEstimate | null> {
  if (_storageEstimator !== null) {
    return await _storageEstimator();
  }
  if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    if (typeof est.quota === 'number' && typeof est.usage === 'number') {
      return { available: Math.max(est.quota - est.usage, 0), totalQuota: est.quota };
    }
  }
  return null;
}

// ----- Public API ---------------------------------------------------------------

export function createEntry(input: CreateEntryInput): Promise<StoredDocumentEntry> {
  return trackWrite(createEntryImpl(input));
}

async function createEntryImpl(input: CreateEntryInput): Promise<StoredDocumentEntry> {
  const now = Date.now();
  const entry: StoredDocumentEntry = {
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    name: input.name,
    subtitle: input.subtitle,
    language: input.language,
    tree: input.tree,
    source: input.source,
    createdAt: now,
    updatedAt: now,
    byteSize: computeByteSize(input.tree, input.source),
  };

  try {
    await attemptCreate(entry);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    await recoverFromQuota(entry, () => attemptCreate(entry));
  }
  notifyStructuralChange();
  return entry;
}

async function attemptCreate(entry: StoredDocumentEntry): Promise<void> {
  checkWriteFailHook();

  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);

  store.add(entry);

  // Count-cap LRU eviction: if we exceed MAX_RECENTS, delete oldest until count == MAX_RECENTS.
  const total = await promisifyRequest(store.count());
  if (total > MAX_RECENTS) {
    const overflow = total - MAX_RECENTS;
    const index = store.index(UPDATED_AT_INDEX);
    await new Promise<void>((resolve, reject) => {
      let deleted = 0;
      const cursorReq = index.openCursor();
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || deleted >= overflow) {
          resolve();
          return;
        }
        cursor.delete();
        deleted += 1;
        cursor.continue();
      };
    });
  }

  await awaitTransaction(tx);
}

export function updateEntryTree(id: string, tree: DocumentRootNode): Promise<void> {
  return trackWrite(updateEntryTreeImpl(id, tree));
}

async function updateEntryTreeImpl(id: string, tree: DocumentRootNode): Promise<void> {
  try {
    await attemptUpdate(id, tree);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    // For quota recovery we need a pending byteSize. We compute it from a *projection*
    // of the would-be updated entry; the source bytes don't change so byteSize uses the
    // existing source.
    const projected = await projectUpdatedEntry(id, tree);
    if (!projected) throw err; // entry vanished concurrently — fall through
    await recoverFromQuota(projected, () => attemptUpdate(id, tree));
  }
  // No notifyStructuralChange here: updating an existing entry never changes
  // the set of entries, only one entry's contents. Picker order will be
  // refreshed on the next structural change or on view transition.
}

async function attemptUpdate(id: string, tree: DocumentRootNode): Promise<void> {
  checkWriteFailHook();

  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const existing = await promisifyRequest<StoredDocumentEntry | undefined>(store.get(id));
  if (!existing) {
    tx.abort();
    throw new Error(`Cannot update missing entry: ${id}`);
  }
  const updated: StoredDocumentEntry = {
    ...existing,
    tree,
    updatedAt: Date.now(),
    byteSize: computeByteSize(tree, existing.source),
  };
  store.put(updated);
  await awaitTransaction(tx);
}

async function projectUpdatedEntry(
  id: string,
  tree: DocumentRootNode
): Promise<StoredDocumentEntry | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const existing = await promisifyRequest<StoredDocumentEntry | undefined>(store.get(id));
  await awaitTransaction(tx);
  if (!existing) return null;
  return {
    ...existing,
    tree,
    updatedAt: Date.now(),
    byteSize: computeByteSize(tree, existing.source),
  };
}

export async function loadEntry(id: string): Promise<RecentEntry | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const raw = await promisifyRequest<unknown>(store.get(id));
  await awaitTransaction(tx);
  if (raw === undefined) return null;
  return migrateEntry(raw);
}

export async function listRecents(): Promise<RecentEntry[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const all = await promisifyRequest<unknown[]>(store.getAll());
  await awaitTransaction(tx);
  return all.map(migrateEntry).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await awaitTransaction(tx);
  notifyStructuralChange();
}

// ----- Quota recovery -----------------------------------------------------------

async function recoverFromQuota(
  pending: StoredDocumentEntry,
  retry: () => Promise<void>
): Promise<void> {
  const estimate = await getEstimate();
  if (!estimate) {
    throw new StorageQuotaUnresolvableError({ kind: 'no-estimate' });
  }

  const evictable = await getEvictableBytes(pending.id);
  if (pending.byteSize > estimate.available + evictable) {
    throw new StorageQuotaUnresolvableError({
      kind: 'too-big',
      pendingSize: pending.byteSize,
      availableSpace: estimate.available,
    });
  }

  let available = estimate.available;
  while (available < pending.byteSize) {
    const oldest = await getOldestEntryOtherThan(pending.id);
    if (!oldest) break;
    await deleteEntryInternal(oldest.id);
    const next = await getEstimate();
    if (!next) break;
    available = next.available;
  }

  try {
    await retry();
  } catch (retryErr) {
    if (!isQuotaError(retryErr)) throw retryErr;
    throw new StorageQuotaUnresolvableError({
      kind: 'retry-failed',
      pendingSize: pending.byteSize,
      availableSpace: available,
    });
  }
}

async function getEvictableBytes(excludeId: string): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const all = await promisifyRequest<StoredDocumentEntry[]>(tx.objectStore(STORE).getAll());
  await awaitTransaction(tx);
  return all.reduce((sum, e) => (e.id === excludeId ? sum : sum + (e.byteSize ?? 0)), 0);
}

async function getOldestEntryOtherThan(
  excludeId: string
): Promise<{ id: string; updatedAt: number } | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const index = tx.objectStore(STORE).index(UPDATED_AT_INDEX);
  const found = await new Promise<{ id: string; updatedAt: number } | null>((resolve, reject) => {
    const cursorReq = index.openCursor();
    cursorReq.onerror = () => reject(cursorReq.error);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      const value = cursor.value as StoredDocumentEntry;
      if (value.id === excludeId) {
        cursor.continue();
        return;
      }
      resolve({ id: value.id, updatedAt: value.updatedAt });
    };
  });
  await awaitTransaction(tx);
  return found;
}

async function deleteEntryInternal(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await awaitTransaction(tx);
}

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DocumentRootNode } from '../types/document';
import {
  __setStorageEstimatorForTesting,
  __setWriteFailHookForTesting,
  type CreateEntryInput,
  closeDb,
  createEntry,
  deleteEntry,
  listRecents,
  loadEntry,
  MAX_RECENTS,
  StorageQuotaUnresolvableError,
  updateEntryTree,
} from './document-storage';

function makeTree(text = 'hello'): DocumentRootNode {
  return {
    id: 'root',
    type: 'DOCUMENT',
    children: [
      {
        id: 'n1',
        number: null,
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: text },
        children: [],
      },
    ],
  };
}

function makeFileEntryInput(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'bill.docx',
    subtitle: overrides.subtitle ?? null,
    language: overrides.language ?? 'de',
    tree: overrides.tree ?? makeTree(),
    source: overrides.source ?? {
      kind: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: new ArrayBuffer(8),
      originalFilename: 'bill.docx',
    },
  };
}

function makePastedTextEntryInput(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return makeFileEntryInput({
    name: 'Untitled (2026-05-12 18:04)',
    subtitle: 'Sehr geehrte Damen und Herren, hiermit teile ...',
    source: {
      kind: 'pasted-text',
      mime: 'text/plain',
      bytes: 'Sehr geehrte Damen und Herren, hiermit teile ich Ihnen mit ...',
      originalFilename: null,
    },
    ...overrides,
  });
}

beforeEach(() => {
  // Fresh IndexedDB per test
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

afterEach(async () => {
  await closeDb();
  __setWriteFailHookForTesting(null);
  __setStorageEstimatorForTesting(null);
});

function quotaError(message = 'quota'): DOMException {
  return new DOMException(message, 'QuotaExceededError');
}

describe('document-storage', () => {
  describe('MAX_RECENTS', () => {
    it('exposes the 20-entry cap as a named constant', () => {
      expect(MAX_RECENTS).toBe(20);
    });
  });

  describe('createEntry', () => {
    it('persists the entry and returns it with timestamps and schemaVersion filled in', async () => {
      const before = Date.now();
      const input = makeFileEntryInput();
      const stored = await createEntry(input);
      const after = Date.now();

      expect(stored.id).toBe(input.id);
      expect(stored.name).toBe('bill.docx');
      expect(stored.schemaVersion).toBe(2);
      expect(stored.createdAt).toBeGreaterThanOrEqual(before);
      expect(stored.createdAt).toBeLessThanOrEqual(after);
      expect(stored.updatedAt).toBe(stored.createdAt);
      expect(stored.byteSize).toBeGreaterThan(0);
    });

    it('persists source bytes for DOCX uploads (ArrayBuffer + mime + filename)', async () => {
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
      const input = makeFileEntryInput({
        source: {
          kind: 'docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes,
          originalFilename: 'bill.docx',
        },
      });
      await createEntry(input);
      const loaded = await loadEntry(input.id);
      if (!loaded || 'status' in loaded) throw new Error('entry should be valid');

      expect(loaded.source.kind).toBe('docx');
      expect(loaded.source.mime).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(loaded.source.originalFilename).toBe('bill.docx');
      // fake-indexeddb structured-clones through a different realm in jsdom, so
      // `instanceof ArrayBuffer` is not reliable — check the shape and content instead.
      expect(Object.prototype.toString.call(loaded.source.bytes)).toBe('[object ArrayBuffer]');
      expect(new Uint8Array(loaded.source.bytes as ArrayBuffer)).toEqual(new Uint8Array(bytes));
    });

    it('persists pasted-text source as a string with text mime and null filename', async () => {
      const input = makePastedTextEntryInput();
      await createEntry(input);
      const loaded = await loadEntry(input.id);
      if (!loaded || 'status' in loaded) throw new Error('entry should be valid');

      expect(loaded.source.kind).toBe('pasted-text');
      expect(loaded.source.mime).toBe('text/plain');
      expect(loaded.source.originalFilename).toBeNull();
      expect(typeof loaded.source.bytes).toBe('string');
    });

    it('creates a fresh entry each call — no dedup by filename', async () => {
      const a = makeFileEntryInput({ name: 'bill.docx' });
      const b = makeFileEntryInput({ name: 'bill.docx' });
      await createEntry(a);
      // Force a clear update gap so the second entry sorts strictly newer
      await new Promise((r) => setTimeout(r, 5));
      await createEntry(b);

      const recents = await listRecents();
      expect(recents).toHaveLength(2);
      const ids = recents.map((r) => ('status' in r ? r.id : r.id));
      expect(ids).toContain(a.id);
      expect(ids).toContain(b.id);
    });
  });

  describe('listRecents', () => {
    it('returns an empty list when no entries exist', async () => {
      const recents = await listRecents();
      expect(recents).toEqual([]);
    });

    it('sorts by updatedAt descending', async () => {
      const oldest = makeFileEntryInput({ name: 'a.docx' });
      const middle = makeFileEntryInput({ name: 'b.docx' });
      const newest = makeFileEntryInput({ name: 'c.docx' });

      await createEntry(oldest);
      await new Promise((r) => setTimeout(r, 5));
      await createEntry(middle);
      await new Promise((r) => setTimeout(r, 5));
      await createEntry(newest);

      const recents = await listRecents();
      expect(recents).toHaveLength(3);
      const names = recents.map((r) => ('status' in r ? '' : r.name));
      expect(names).toEqual(['c.docx', 'b.docx', 'a.docx']);
    });
  });

  describe('updateEntryTree', () => {
    it('replaces only the tree and bumps updatedAt — source bytes untouched', async () => {
      const input = makeFileEntryInput();
      const created = await createEntry(input);
      await new Promise((r) => setTimeout(r, 5));

      const newTree = makeTree('edited');
      await updateEntryTree(input.id, newTree);

      const loaded = await loadEntry(input.id);
      if (!loaded || 'status' in loaded) throw new Error('entry should be valid');

      expect(loaded.tree).toEqual(newTree);
      expect(loaded.updatedAt).toBeGreaterThan(created.updatedAt);
      expect(loaded.createdAt).toBe(created.createdAt);
      // Source bytes round-trip identical
      expect(loaded.source.kind).toBe('docx');
      expect(loaded.source.originalFilename).toBe('bill.docx');
    });

    it('throws when the entry does not exist', async () => {
      await expect(updateEntryTree('missing-id', makeTree())).rejects.toThrow();
    });
  });

  describe('deleteEntry', () => {
    it('removes the entry from the store', async () => {
      const input = makeFileEntryInput();
      await createEntry(input);
      expect(await listRecents()).toHaveLength(1);

      await deleteEntry(input.id);
      expect(await listRecents()).toHaveLength(0);
      expect(await loadEntry(input.id)).toBeNull();
    });
  });

  describe('count-cap LRU eviction', () => {
    it(`silently evicts the oldest entry when a new one would exceed MAX_RECENTS`, async () => {
      // Fill to exactly MAX_RECENTS
      const created: { id: string; name: string }[] = [];
      for (let i = 0; i < MAX_RECENTS; i++) {
        const input = makeFileEntryInput({ name: `doc-${i}.docx` });
        await createEntry(input);
        created.push({ id: input.id, name: input.name });
        // Tiny gap so updatedAt is strictly ordered
        await new Promise((r) => setTimeout(r, 2));
      }
      const oldest = created[0];

      expect((await listRecents()).length).toBe(MAX_RECENTS);

      // 21st entry triggers eviction of the oldest
      const newEntry = makeFileEntryInput({ name: 'newest.docx' });
      await createEntry(newEntry);

      const recents = await listRecents();
      expect(recents).toHaveLength(MAX_RECENTS);

      const ids = recents.map((r) => ('status' in r ? r.id : r.id));
      expect(ids).toContain(newEntry.id);
      expect(ids).not.toContain(oldest.id);
    });

    it('an update to an existing entry never triggers eviction', async () => {
      // Fill to exactly MAX_RECENTS
      const ids: string[] = [];
      for (let i = 0; i < MAX_RECENTS; i++) {
        const input = makeFileEntryInput({ name: `doc-${i}.docx` });
        await createEntry(input);
        ids.push(input.id);
        await new Promise((r) => setTimeout(r, 2));
      }

      // Update the oldest — this should NOT remove anything
      await updateEntryTree(ids[0], makeTree('edited'));

      const recents = await listRecents();
      expect(recents).toHaveLength(MAX_RECENTS);
      const recentIds = recents.map((r) => ('status' in r ? r.id : r.id));
      for (const id of ids) {
        expect(recentIds).toContain(id);
      }
    });
  });

  describe('schema versioning', () => {
    // Helper: write a raw record straight to the documents store, bypassing createEntry's
    // schemaVersion / shape enforcement. Used to inject "incompatible" records.
    async function writeRawRecord(record: Record<string, unknown>): Promise<void> {
      // Open via the same DB_NAME / DB_VERSION the module uses by triggering openDb first
      // through a no-op listRecents call, then put directly on the underlying connection.
      await listRecents();
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('structedit', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('documents', 'readwrite');
          tx.objectStore('documents').put(record);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    }

    it('round-trips a clean current-version entry through loadEntry', async () => {
      const input = makeFileEntryInput();
      await createEntry(input);
      const loaded = await loadEntry(input.id);
      expect(loaded).not.toBeNull();
      if (!loaded || 'status' in loaded) throw new Error('expected valid entry');
      expect(loaded.id).toBe(input.id);
      expect(loaded.tree.type).toBe('DOCUMENT');
      expect(loaded.schemaVersion).toBe(2);
    });

    it('flags an entry with an invalid tree as incompatible (not deleted)', async () => {
      const now = Date.now();
      await writeRawRecord({
        id: 'bad-tree-id',
        schemaVersion: 1,
        name: 'broken.docx',
        subtitle: null,
        language: 'de',
        tree: { type: 'not-a-document', children: 'nope' }, // fails isValidDocument
        source: {
          kind: 'docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes: new ArrayBuffer(0),
          originalFilename: 'broken.docx',
        },
        createdAt: now,
        updatedAt: now,
        byteSize: 0,
      });

      const recents = await listRecents();
      expect(recents).toHaveLength(1);
      const entry = recents[0];
      expect('status' in entry && entry.status).toBe('incompatible');
      if ('status' in entry) {
        expect(entry.id).toBe('bad-tree-id');
        expect(entry.name).toBe('broken.docx');
        expect(entry.updatedAt).toBe(now);
      }

      // loadEntry also surfaces it
      const loaded = await loadEntry('bad-tree-id');
      expect(loaded && 'status' in loaded && loaded.status).toBe('incompatible');
    });

    it('flags an entry with a future schemaVersion as incompatible (not deleted)', async () => {
      const now = Date.now();
      await writeRawRecord({
        id: 'future-id',
        schemaVersion: 999,
        name: 'futuristic.docx',
        subtitle: null,
        language: 'de',
        tree: { id: 'r', type: 'DOCUMENT', children: [] },
        source: {
          kind: 'docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes: new ArrayBuffer(0),
          originalFilename: 'futuristic.docx',
        },
        createdAt: now,
        updatedAt: now,
        byteSize: 0,
      });

      const recents = await listRecents();
      expect(recents).toHaveLength(1);
      const first = recents[0];
      expect('status' in first && first.status).toBe('incompatible');
      if ('status' in first) {
        expect(first.id).toBe('future-id');
        expect(first.name).toBe('futuristic.docx');
      }
    });

    it('lets the user delete an incompatible entry', async () => {
      const now = Date.now();
      await writeRawRecord({
        id: 'incompat-id',
        schemaVersion: 999,
        name: 'futuristic.docx',
        subtitle: null,
        language: 'de',
        tree: { id: 'r', type: 'DOCUMENT', children: [] },
        source: {
          kind: 'docx',
          mime: 'application/octet-stream',
          bytes: new ArrayBuffer(0),
          originalFilename: 'futuristic.docx',
        },
        createdAt: now,
        updatedAt: now,
        byteSize: 0,
      });

      expect((await listRecents()).length).toBe(1);
      await deleteEntry('incompat-id');
      expect(await listRecents()).toHaveLength(0);
    });

    it('mixes compatible and incompatible entries in updatedAt-desc order', async () => {
      const now = Date.now();
      await writeRawRecord({
        id: 'bad',
        schemaVersion: 1,
        name: 'broken.docx',
        subtitle: null,
        language: 'de',
        tree: { type: 'not-a-document' },
        source: { kind: 'docx', mime: 'x', bytes: new ArrayBuffer(0), originalFilename: null },
        createdAt: now,
        updatedAt: now,
        byteSize: 0,
      });
      await new Promise((r) => setTimeout(r, 5));
      const good = makeFileEntryInput({ name: 'good.docx' });
      await createEntry(good);

      const recents = await listRecents();
      expect(recents).toHaveLength(2);
      // newest first
      expect('status' in recents[0]).toBe(false);
      expect('status' in recents[1] && recents[1].status).toBe('incompatible');
    });
  });

  describe('quota-driven eviction', () => {
    it('silently evicts the oldest entry(ies) until the pending write fits, then writes', async () => {
      // Three small entries; pending small write should fit after evicting some.
      const e1 = makeFileEntryInput({ name: 'old1.docx' });
      await createEntry(e1);
      await new Promise((r) => setTimeout(r, 2));
      const e2 = makeFileEntryInput({ name: 'old2.docx' });
      await createEntry(e2);
      await new Promise((r) => setTimeout(r, 2));
      const e3 = makeFileEntryInput({ name: 'mid.docx' });
      await createEntry(e3);

      // Estimate: starts at 200 bytes available; each delete frees byteSize.
      const available = 200;
      __setStorageEstimatorForTesting(async () => ({ available, totalQuota: 1000 }));

      // Force the very next write to throw QuotaExceededError, then succeed on retry.
      let failsRemaining = 1;
      __setWriteFailHookForTesting(() => {
        if (failsRemaining > 0) {
          failsRemaining--;
          return quotaError();
        }
        return null;
      });

      // Pending size will exceed `available` so eviction must occur. Make each delete free 100.
      // We'll override eviction's recompute by tracking deletes via a wrapper.
      const oldEstimator = async () => ({ available, totalQuota: 1000 });
      __setStorageEstimatorForTesting(async () => {
        return oldEstimator();
      });

      const pending = makeFileEntryInput({ name: 'newest.docx' });
      // Simulate the world: every time the storage layer issues a delete, available grows.
      // We hook listRecents/deleteEntry indirectly by counting state changes between checks.
      const before = (await listRecents()).length;

      // Available is 200; pending byteSize > 200 only if we make it so. Force the budget logic
      // by raising perceived pending: simulate via override.
      // For test isolation, manually set available to be less than pending.byteSize, but more
      // than (pending.byteSize - sum-of-evictables). The estimator above recomputes after each delete.
      const deletes = 0;
      const baseAvailable = 0;
      __setStorageEstimatorForTesting(async () => ({
        available: baseAvailable + deletes * 1_000_000, // each evicted entry "frees" 1 MB in our mock
        totalQuota: 100_000_000,
      }));
      // Intercept deletions by polling list length changes — simpler: just trust the storage
      // layer to evict in order, and assert at the end.
      // We need a way to observe deletes for the recompute mock. Approach: subscribe via
      // listRecents before/after.
      // For determinism, we instead let the storage layer evict at most 1 entry and stop:
      // make `available` jump above the pending size after one delete.
      // (deletes is a closure variable that the storage layer will increment by calling our
      // delete hook — but we don't have a delete hook. So instead we use a count-based
      // estimator: each call returns a higher value.)
      let estimateCalls = 0;
      __setStorageEstimatorForTesting(async () => {
        estimateCalls++;
        return {
          available: estimateCalls === 1 ? 0 : 100_000_000, // first call says full; after one evict, plenty
          totalQuota: 100_000_000,
        };
      });
      // pending byteSize is small (~100 bytes from the tree + ArrayBuffer(8)). The budget says
      // pending(100) > available(0), evictable = e1 + e2 + e3 byteSizes (all > 100). So evict the
      // oldest (e1), then estimate returns 100MB available → write succeeds.

      await createEntry(pending);

      const recents = await listRecents();
      // oldest (e1) should be gone; e2, e3, pending remain.
      expect(recents).toHaveLength(3);
      const ids = recents.map((r) => ('status' in r ? r.id : r.id));
      expect(ids).toContain(pending.id);
      expect(ids).toContain(e2.id);
      expect(ids).toContain(e3.id);
      expect(ids).not.toContain(e1.id);

      // No second-or-more evictions happened.
      expect(before).toBe(3);
    });

    it('throws StorageQuotaUnresolvableError without evicting when budget cannot help', async () => {
      const e1 = makeFileEntryInput({ name: 'old1.docx' });
      await createEntry(e1);

      // Available = 10 bytes; evictable = e1.byteSize (small); pending will be huge.
      // Make the pending entry carry a large source so its byteSize is large.
      const pending = makeFileEntryInput({
        name: 'too-big.docx',
        source: {
          kind: 'docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes: new ArrayBuffer(50_000_000), // 50 MB
          originalFilename: 'too-big.docx',
        },
      });

      __setStorageEstimatorForTesting(async () => ({ available: 10, totalQuota: 60_000_000 }));

      let failsRemaining = 1;
      __setWriteFailHookForTesting(() => {
        if (failsRemaining > 0) {
          failsRemaining--;
          return quotaError();
        }
        return null;
      });

      await expect(createEntry(pending)).rejects.toBeInstanceOf(StorageQuotaUnresolvableError);

      // No entries deleted; e1 still there; pending NOT written.
      const recents = await listRecents();
      expect(recents).toHaveLength(1);
      const remainingIds = recents.map((r) => ('status' in r ? r.id : r.id));
      expect(remainingIds).toContain(e1.id);
      expect(remainingIds).not.toContain(pending.id);
    });

    it('stops further eviction when the post-eviction retry also fails', async () => {
      const e1 = makeFileEntryInput({ name: 'old1.docx' });
      await createEntry(e1);
      await new Promise((r) => setTimeout(r, 2));
      const e2 = makeFileEntryInput({ name: 'old2.docx' });
      await createEntry(e2);
      await new Promise((r) => setTimeout(r, 2));
      const e3 = makeFileEntryInput({ name: 'mid.docx' });
      await createEntry(e3);

      // Budget claims plenty of room after evicting one — but real writes keep failing.
      __setStorageEstimatorForTesting(async () => ({
        available: 100_000_000,
        totalQuota: 100_000_000,
      }));

      // Fail every write.
      __setWriteFailHookForTesting(() => quotaError());

      const pending = makeFileEntryInput({ name: 'never.docx' });

      await expect(createEntry(pending)).rejects.toBeInstanceOf(StorageQuotaUnresolvableError);

      // Per spec: "the entries that were already deleted in the retry attempt remain deleted"
      // and "further eviction stops". So at most one delete is allowed before we bail.
      const recents = await listRecents();
      const ids = recents.map((r) => ('status' in r ? r.id : r.id));
      // pending was never written
      expect(ids).not.toContain(pending.id);
      // Two of the original three remain (at most one was evicted)
      expect(recents.length).toBeGreaterThanOrEqual(2);
    });

    it('does not evict when navigator.storage.estimate() is unavailable; throws unresolvable error', async () => {
      const e1 = makeFileEntryInput({ name: 'old1.docx' });
      await createEntry(e1);

      // No estimator available
      __setStorageEstimatorForTesting(() => null);

      let failsRemaining = 1;
      __setWriteFailHookForTesting(() => {
        if (failsRemaining > 0) {
          failsRemaining--;
          return quotaError();
        }
        return null;
      });

      const pending = makeFileEntryInput({ name: 'will-fail.docx' });
      await expect(createEntry(pending)).rejects.toBeInstanceOf(StorageQuotaUnresolvableError);

      // No deletions happened — degradation path.
      const recents = await listRecents();
      const ids = recents.map((r) => ('status' in r ? r.id : r.id));
      expect(ids).toContain(e1.id);
      expect(ids).not.toContain(pending.id);
    });

    it('StorageQuotaUnresolvableError carries pendingSize and availableSpace when known', async () => {
      const pending = makeFileEntryInput({
        name: 'huge.docx',
        source: {
          kind: 'docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes: new ArrayBuffer(50_000_000),
          originalFilename: 'huge.docx',
        },
      });
      __setStorageEstimatorForTesting(async () => ({ available: 100, totalQuota: 60_000_000 }));
      __setWriteFailHookForTesting(() => quotaError());

      try {
        await createEntry(pending);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StorageQuotaUnresolvableError);
        const sqe = err as StorageQuotaUnresolvableError;
        expect(sqe.pendingSize).toBeGreaterThanOrEqual(50_000_000);
        expect(sqe.availableSpace).toBe(100);
      }
    });

    it('the no-estimate failure carries no pendingSize/availableSpace', async () => {
      const pending = makeFileEntryInput({ name: 'will-fail.docx' });
      __setStorageEstimatorForTesting(() => null);
      __setWriteFailHookForTesting(() => quotaError());

      try {
        await createEntry(pending);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StorageQuotaUnresolvableError);
        const sqe = err as StorageQuotaUnresolvableError;
        expect(sqe.pendingSize).toBeUndefined();
        expect(sqe.availableSpace).toBeUndefined();
      }
    });
  });
});

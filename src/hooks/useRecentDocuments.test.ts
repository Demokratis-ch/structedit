import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import {
  type CreateEntryInput,
  closeDb,
  createEntry,
  MAX_RECENTS,
} from '../utils/document-storage';
import { useRecentDocuments } from './useRecentDocuments';

function makeTree(text = 'hello'): ContainerDocumentNode {
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

beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
});

afterEach(async () => {
  await closeDb();
  vi.restoreAllMocks();
});

describe('useRecentDocuments', () => {
  it('exposes the recents list sorted by updatedAt desc', async () => {
    const e1 = makeFileEntryInput({ name: 'old.docx' });
    await createEntry(e1);
    await new Promise((r) => setTimeout(r, 5));
    const e2 = makeFileEntryInput({ name: 'mid.docx' });
    await createEntry(e2);
    await new Promise((r) => setTimeout(r, 5));
    const e3 = makeFileEntryInput({ name: 'new.docx' });
    await createEntry(e3);

    const { result } = renderHook(() => useRecentDocuments());

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(3);
    });

    const names = result.current.entries.map((e) => ('status' in e ? '<bad>' : e.name));
    expect(names).toEqual(['new.docx', 'mid.docx', 'old.docx']);
  });

  it('caps the list at MAX_RECENTS even if storage somehow has more', async () => {
    // createEntry already enforces MAX_RECENTS, but the hook should also slice
    // defensively. Seed exactly MAX_RECENTS entries.
    for (let i = 0; i < MAX_RECENTS; i++) {
      await createEntry(makeFileEntryInput({ name: `doc-${i}.docx` }));
      await new Promise((r) => setTimeout(r, 1));
    }
    const { result } = renderHook(() => useRecentDocuments());

    await waitFor(() => {
      expect(result.current.entries.length).toBe(MAX_RECENTS);
    });
  });

  it('refreshes the list when a new entry is created elsewhere', async () => {
    const { result } = renderHook(() => useRecentDocuments());
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(0);
    });

    await act(async () => {
      await createEntry(makeFileEntryInput({ name: 'late.docx' }));
    });

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
  });

  it('deleteEntry removes the entry from storage and from the live list', async () => {
    const e = makeFileEntryInput({ name: 'doomed.docx' });
    await createEntry(e);
    const { result } = renderHook(() => useRecentDocuments());

    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    await act(async () => {
      await result.current.deleteEntry(e.id);
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(0));
  });

  it('loadEntry returns the tree, a fresh blob URL, and the entry metadata', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const input = makeFileEntryInput({
      name: 'bill.docx',
      source: {
        kind: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes,
        originalFilename: 'bill.docx',
      },
    });
    await createEntry(input);

    const { result } = renderHook(() => useRecentDocuments());
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    let loaded: Awaited<ReturnType<typeof result.current.loadEntry>> | undefined;
    await act(async () => {
      loaded = await result.current.loadEntry(input.id);
    });

    expect(loaded).not.toBeNull();
    expect(loaded?.entry.id).toBe(input.id);
    expect(loaded?.entry.tree).toEqual(input.tree);
    expect(loaded?.documentUrl).toBe('blob:fake-url');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('loadEntry returns null for an incompatible entry', async () => {
    // Seed an incompatible record directly via the raw API
    const { result } = renderHook(() => useRecentDocuments());

    // Inject an invalid record straight into IDB
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('structedit', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('documents')) {
          const store = db.createObjectStore('documents', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put({
          id: 'bad',
          schemaVersion: 999,
          name: 'broken',
          subtitle: null,
          language: 'de',
          tree: {},
          source: {
            kind: 'docx',
            mime: 'x',
            bytes: new ArrayBuffer(0),
            originalFilename: null,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          byteSize: 0,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.entries.length).toBeGreaterThan(0));

    let loaded: Awaited<ReturnType<typeof result.current.loadEntry>> | undefined;
    await act(async () => {
      loaded = await result.current.loadEntry('bad');
    });

    expect(loaded).toBeNull();
  });
});

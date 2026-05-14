import { renderHook } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import {
  __setStorageEstimatorForTesting,
  __setWriteFailHookForTesting,
  type CreateEntryInput,
  closeDb,
  createEntry,
  loadEntry,
} from '../utils/document-storage';
import { useAutosave } from './useAutosave';

// Toast spy
const showToastSpy = vi.fn();
vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ showToast: showToastSpy, dismissToast: vi.fn() }),
}));

function makeTree(text = 'hello'): ContainerDocumentNode {
  return {
    id: 'root',
    number: null,
    type: 'document',
    children: [
      {
        id: 'n1',
        number: null,
        type: 'content',
        format: 'TEXT',
        contents: { de: text },
        children: [],
      },
    ],
  };
}

function makeInput(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
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
  showToastSpy.mockClear();
});

afterEach(async () => {
  await closeDb();
  __setWriteFailHookForTesting(null);
  __setStorageEstimatorForTesting(null);
});

const DEBOUNCE_MS = 500;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useAutosave', () => {
  it('writes the active tree to IndexedDB after the debounce interval', async () => {
    const input = makeInput();
    await createEntry(input);
    const originalUpdatedAt = ((await loadEntry(input.id)) as { updatedAt: number }).updatedAt;

    const t1 = makeTree('edited once');
    renderHook(() => useAutosave(input.id, t1));

    // Before the debounce elapses the stored tree is still the original.
    await wait(150);
    let loaded = await loadEntry(input.id);
    if (!loaded || 'status' in loaded) throw new Error('expected valid entry');
    expect(loaded.tree).toEqual(input.tree);

    // After the debounce elapses, the write lands.
    await wait(DEBOUNCE_MS);
    loaded = await loadEntry(input.id);
    if (!loaded || 'status' in loaded) throw new Error('expected valid entry');
    expect(loaded.tree).toEqual(t1);
    expect(loaded.updatedAt).toBeGreaterThan(originalUpdatedAt);
  });

  it('coalesces rapid edits into a single write', async () => {
    const input = makeInput();
    await createEntry(input);

    const t1 = makeTree('a');
    const t2 = makeTree('b');
    const t3 = makeTree('c');

    const { rerender } = renderHook(({ id, tree }) => useAutosave(id, tree), {
      initialProps: { id: input.id, tree: t1 as ContainerDocumentNode | null },
    });

    // Within the debounce window we rerender twice — each rerender resets the timer.
    await wait(100);
    rerender({ id: input.id, tree: t2 });
    await wait(100);
    rerender({ id: input.id, tree: t3 });

    // Wait past the (most recent) debounce.
    await wait(DEBOUNCE_MS + 100);

    const loaded = await loadEntry(input.id);
    if (!loaded || 'status' in loaded) throw new Error('expected valid entry');
    expect(loaded.tree).toEqual(t3);
  });

  it('flushes the pending write when currentEntryId changes', async () => {
    const a = makeInput({ name: 'a.docx' });
    const b = makeInput({ name: 'b.docx' });
    await createEntry(a);
    await createEntry(b);

    const edited = makeTree('flushed-on-switch');
    const { rerender } = renderHook(({ id, tree }) => useAutosave(id, tree), {
      initialProps: { id: a.id, tree: edited as ContainerDocumentNode | null },
    });

    // Don't wait for debounce. Switch entry — the pending write to A should still flush.
    rerender({ id: b.id, tree: makeTree('on-b') });

    // Give the async flush a tick to land.
    await wait(50);

    const loadedA = await loadEntry(a.id);
    if (!loadedA || 'status' in loadedA) throw new Error('expected valid entry');
    expect(loadedA.tree).toEqual(edited);
  });

  it('is a no-op when currentEntryId is null', async () => {
    const input = makeInput();
    await createEntry(input);

    const beforeTimestamp = (await loadEntry(input.id)) as { updatedAt: number };
    const initial = beforeTimestamp.updatedAt;

    renderHook(() => useAutosave(null, makeTree('should-not-save')));

    // Wait well past the debounce — no writes should happen.
    await wait(DEBOUNCE_MS + 200);

    const after = await loadEntry(input.id);
    if (!after || 'status' in after) throw new Error('expected valid entry');
    expect(after.updatedAt).toBe(initial);
    expect(after.tree).toEqual(input.tree);
  });

  it('surfaces a toast on StorageQuotaUnresolvableError without crashing the editor', async () => {
    const input = makeInput();
    await createEntry(input);

    // Force every write to fail; no estimator → no-estimate variant.
    __setStorageEstimatorForTesting(() => null);
    __setWriteFailHookForTesting(() => new DOMException('quota', 'QuotaExceededError'));

    const edited = makeTree('edit during quota fail');
    renderHook(() => useAutosave(input.id, edited));

    await wait(DEBOUNCE_MS + 200);

    expect(showToastSpy).toHaveBeenCalledTimes(1);
    const msg = showToastSpy.mock.calls[0][0] as string;
    expect(msg.toLowerCase()).toContain('storage');
  });

  it('the toast carries the size-aware message when sizes are known', async () => {
    const input = makeInput();
    await createEntry(input);

    // Tiny available (10 bytes) and no other entries to evict — any non-trivial
    // pending tree blows the budget. Keeping the tree small avoids the
    // 100 MB-string allocation that was making CI flake on the wait window.
    __setStorageEstimatorForTesting(async () => ({
      available: 10,
      totalQuota: 60_000_000,
    }));
    __setWriteFailHookForTesting(() => new DOMException('quota', 'QuotaExceededError'));

    const newTree = makeTree('a moderately sized but cheap string');
    renderHook(() => useAutosave(input.id, newTree));

    await wait(DEBOUNCE_MS + 500);

    expect(showToastSpy).toHaveBeenCalledTimes(1);
    const msg = showToastSpy.mock.calls[0][0] as string;
    // Size-aware message mentions both numbers (in MB)
    expect(msg).toMatch(/MB/);
    expect(msg).toMatch(/free/);
  });
});

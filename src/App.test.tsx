import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  __setStorageEstimatorForTesting,
  __setWriteFailHookForTesting,
  type CreateEntryInput,
  closeDb,
  createEntry,
  listRecents,
} from './utils/document-storage';

function makeTree() {
  return {
    id: 'root',
    number: null,
    type: 'document' as const,
    children: [
      {
        id: 'n1',
        number: null,
        type: 'content' as const,
        format: 'TEXT' as const,
        contents: { de: 'hello' },
        children: [],
      },
    ],
  };
}

function makeInput(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'seeded.docx',
    subtitle: overrides.subtitle ?? null,
    language: 'de',
    tree: overrides.tree ?? makeTree(),
    source: overrides.source ?? {
      kind: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: new ArrayBuffer(8),
      originalFilename: overrides.name ?? 'seeded.docx',
    },
  };
}

let revokedUrls: string[] = [];

beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  revokedUrls = [];
  URL.createObjectURL = vi.fn(() => `blob:fake-${Math.random()}`);
  URL.revokeObjectURL = vi.fn((url: string) => {
    revokedUrls.push(url);
  });
});

afterEach(async () => {
  // Unmount before draining so that useAutosave's flush-on-unmount registers its
  // write into the storage module's pendingWrites set; otherwise closeDb sees an
  // empty set and the late write lands in the next test's fresh IDB.
  cleanup();
  await closeDb();
  __setWriteFailHookForTesting(null);
  __setStorageEstimatorForTesting(null);
  vi.restoreAllMocks();
});

describe('App', () => {
  it('uploading pasted text creates a new entry in IndexedDB and transitions to the editor', async () => {
    render(<App />);

    // The textarea should be visible on the upload view
    const textarea = await screen.findByPlaceholderText(/paste unstructured text/i);
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /convert text/i }));

    // The editor view should appear (Close Editor button is the proxy)
    await screen.findByRole('button', { name: /close editor/i });

    const recents = await listRecents();
    expect(recents).toHaveLength(1);
    const entry = recents[0];
    expect('status' in entry).toBe(false);
    if (!('status' in entry)) {
      expect(entry.name).toMatch(/^Untitled \(/);
      expect(entry.source.bytes).toBe('Hello world');
    }
  });

  it('clicking a recent entry routes to the editor with the entry tree and a fresh blob URL', async () => {
    const seeded = makeInput({ name: 'resumable.docx' });
    await createEntry(seeded);

    render(<App />);

    const row = await screen.findByText('resumable.docx');
    fireEvent.click(row);

    await screen.findByRole('button', { name: /close editor/i });

    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('clicking Close Editor returns to the upload view without a confirm dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const seeded = makeInput({ name: 'closer.docx' });
    await createEntry(seeded);

    render(<App />);

    fireEvent.click(await screen.findByText('closer.docx'));
    const closeBtn = await screen.findByRole('button', { name: /close editor/i });

    fireEvent.click(closeBtn);

    // No window.confirm should have been called
    expect(confirmSpy).not.toHaveBeenCalled();

    // Back on the upload view
    await screen.findByPlaceholderText(/paste unstructured text/i);
  });

  it('returning to upload revokes the prior documentUrl', async () => {
    const seeded = makeInput({ name: 'leakcheck.docx' });
    await createEntry(seeded);

    render(<App />);

    fireEvent.click(await screen.findByText('leakcheck.docx'));
    const closeBtn = await screen.findByRole('button', { name: /close editor/i });

    // Capture the URL created for the source preview
    const createCalls = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.results;
    expect(createCalls.length).toBeGreaterThan(0);
    const documentUrl = createCalls[createCalls.length - 1].value as string;

    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(revokedUrls).toContain(documentUrl);
    });
  });

  it('shows a quota toast when the initial create fails — editor still opens', async () => {
    // Force every storage write to fail; no estimator -> generic message.
    __setStorageEstimatorForTesting(() => null);
    __setWriteFailHookForTesting(() => new DOMException('quota', 'QuotaExceededError'));

    render(<App />);

    const textarea = await screen.findByPlaceholderText(/paste unstructured text/i);
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /convert text/i }));

    // The toast surfaces with the storage-full message. Radix renders the
    // visible toast inside a region viewport (the role="status" element is a
    // separate sr-only announce region); query the visible side.
    const viewport = await screen.findByRole('region', { name: /notifications/i });
    expect(viewport.textContent?.toLowerCase()).toContain('storage');

    // The editor still opens — the in-memory tree is unaffected by the failed write.
    expect(screen.getByRole('button', { name: /close editor/i })).toBeInTheDocument();

    // No entry was persisted (the failed write left no record).
    const recents = await listRecents();
    expect(recents).toHaveLength(0);
  });
});

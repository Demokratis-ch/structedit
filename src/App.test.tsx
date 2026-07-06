import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  __setStorageEstimatorForTesting,
  __setWriteFailHookForTesting,
  type CreateEntryInput,
  closeDb,
  createEntry,
  listRecents,
  loadEntry,
} from './utils/document-storage';

function makeTree() {
  return {
    id: 'root',
    type: 'DOCUMENT' as const,
    children: [
      {
        id: 'n1',
        number: null,
        type: 'CONTENT' as const,
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
  // Reset the URL so a loadFile param from one test never leaks into the next.
  window.history.replaceState({}, '', '/');
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

  it('renaming in the header updates the breadcrumb and persists to the stored entry', async () => {
    const seeded = makeInput({ name: 'renameme.docx' });
    await createEntry(seeded);

    render(<App />);

    fireEvent.click(await screen.findByText('renameme.docx'));
    await screen.findByRole('button', { name: /close editor/i });

    fireEvent.doubleClick(screen.getByText('renameme.docx'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Vernehmlassung Q3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('Vernehmlassung Q3')).toBeInTheDocument();
    expect(screen.queryByText('renameme.docx')).not.toBeInTheDocument();

    await waitFor(async () => {
      const entry = await loadEntry(seeded.id);
      if (!entry || 'status' in entry) throw new Error('entry should be valid');
      expect(entry.name).toBe('Vernehmlassung Q3');
    });
  });

  it('renaming still updates the breadcrumb when the entry was never stored', async () => {
    // Force the initial create to fail so currentEntryId stays null.
    __setStorageEstimatorForTesting(() => null);
    __setWriteFailHookForTesting(() => new DOMException('quota', 'QuotaExceededError'));

    render(<App />);

    const textarea = await screen.findByPlaceholderText(/paste unstructured text/i);
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /convert text/i }));
    await screen.findByRole('button', { name: /close editor/i });

    fireEvent.doubleClick(screen.getByText(/^Untitled \(/));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed anyway' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('Renamed anyway')).toBeInTheDocument();
    expect(await listRecents()).toHaveLength(0);
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

/** Build a minimal Response good enough for fetchRemoteDocument under jsdom. */
function makeFetchResponse(
  body: string,
  init: { status?: number; contentType?: string | null } = {}
): Response {
  const { status = 200, contentType = 'text/html; charset=utf-8' } = init;
  const headers = new Headers();
  if (contentType !== null) headers.set('content-type', contentType);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('App — loadFile URL import', () => {
  function setLoadFile(url: string) {
    window.history.pushState({}, '', `/?loadFile=${encodeURIComponent(url)}`);
  }

  it('loads a valid loadFile document into the editor and creates a recents entry', async () => {
    setLoadFile('https://demokratis.ch/file/abc-123');
    const fetchMock = vi.fn().mockResolvedValue(makeFetchResponse('<h1>Title</h1><p>Body</p>'));
    globalThis.fetch = fetchMock;

    render(<App />);

    await screen.findByRole('button', { name: /close editor/i });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const recents = await listRecents();
    expect(recents).toHaveLength(1);
  });

  it('strips the loadFile param after a load so a refresh would not re-fetch', async () => {
    setLoadFile('https://demokratis.ch/file/abc-123');
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse('<h1>Title</h1>'));

    render(<App />);

    await screen.findByRole('button', { name: /close editor/i });
    expect(window.location.search).toBe('');
  });

  it('shows the expiry message on 410 and does not open the editor', async () => {
    setLoadFile('https://demokratis.ch/file/expired');
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse('', { status: 410 }));

    render(<App />);

    expect(
      await screen.findByText('Link expired, re-open from demokratis.ch.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close editor/i })).not.toBeInTheDocument();
  });

  it('shows a distinct invalid-link message on 404', async () => {
    setLoadFile('https://demokratis.ch/file/missing');
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse('', { status: 404 }));

    render(<App />);

    const msg = await screen.findByText(/invalid/i);
    expect(msg.textContent).not.toBe('Link expired, re-open from demokratis.ch.');
  });

  it('shows a generic load error on a network/CORS failure', async () => {
    setLoadFile('https://demokratis.ch/file/x');
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    render(<App />);

    expect(await screen.findByText(/couldn.t load the document/i)).toBeInTheDocument();
  });

  it('shows an unsupported-format error when the document parses to nothing', async () => {
    setLoadFile('https://demokratis.ch/file/empty');
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse('<div>   </div>'));

    render(<App />);

    expect(await screen.findByText(/couldn.t read the document/i)).toBeInTheDocument();
  });

  it('rejects a non-allowlisted host without fetching', async () => {
    setLoadFile('https://evil.example.com/file/x');
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    render(<App />);

    await screen.findByText(/invalid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers a path back to the upload screen from an error surface', async () => {
    setLoadFile('https://demokratis.ch/file/expired');
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse('', { status: 410 }));

    render(<App />);

    await screen.findByText('Link expired, re-open from demokratis.ch.');
    fireEvent.click(screen.getByRole('button', { name: /go to upload/i }));

    await screen.findByPlaceholderText(/paste unstructured text/i);
  });

  it('leaves the upload flow unchanged and does not fetch when no loadFile param is present', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    render(<App />);

    await screen.findByPlaceholderText(/paste unstructured text/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches at most once under StrictMode', async () => {
    setLoadFile('https://demokratis.ch/file/abc-123');
    const fetchMock = vi.fn().mockResolvedValue(makeFetchResponse('<h1>Hi</h1>'));
    globalThis.fetch = fetchMock;

    render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    await screen.findByRole('button', { name: /close editor/i });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

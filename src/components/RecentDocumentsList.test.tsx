import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IncompatibleEntry, StoredDocumentEntry } from '../utils/document-storage';
import { RecentDocumentsList } from './RecentDocumentsList';

function makeStoredEntry(overrides: Partial<StoredDocumentEntry> = {}): StoredDocumentEntry {
  const now = Date.now();
  return {
    id: overrides.id ?? `id-${Math.random()}`,
    schemaVersion: 1,
    name: overrides.name ?? 'bill.docx',
    subtitle: overrides.subtitle ?? null,
    language: 'de',
    tree: { id: 'root', number: null, type: 'document', children: [] },
    source: {
      kind: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: new ArrayBuffer(0),
      originalFilename: overrides.name ?? 'bill.docx',
    },
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    byteSize: 0,
  };
}

function makeIncompatibleEntry(overrides: Partial<IncompatibleEntry> = {}): IncompatibleEntry {
  return {
    status: 'incompatible',
    id: overrides.id ?? 'incompat-id',
    name: overrides.name ?? 'broken.docx',
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

describe('RecentDocumentsList', () => {
  it('renders nothing when the list is empty', () => {
    const { container } = render(
      <RecentDocumentsList entries={[]} onLoad={vi.fn()} onDelete={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders rows for each entry, newest first per the supplied order', () => {
    const entries: StoredDocumentEntry[] = [
      makeStoredEntry({ id: '1', name: 'newest.docx', updatedAt: 3000 }),
      makeStoredEntry({ id: '2', name: 'middle.docx', updatedAt: 2000 }),
      makeStoredEntry({ id: '3', name: 'oldest.docx', updatedAt: 1000 }),
    ];
    render(<RecentDocumentsList entries={entries} onLoad={vi.fn()} onDelete={vi.fn()} />);

    const rows = screen.getAllByTestId('recent-entry');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('newest.docx');
    expect(rows[1]).toHaveTextContent('middle.docx');
    expect(rows[2]).toHaveTextContent('oldest.docx');
  });

  it('renders the subtitle for pasted-text entries (and not for file entries)', () => {
    const entries: StoredDocumentEntry[] = [
      makeStoredEntry({
        id: 'pt',
        name: 'Untitled (2026-05-12 18:04)',
        subtitle: 'Sehr geehrte Damen ...',
      }),
      makeStoredEntry({ id: 'fl', name: 'bill.docx', subtitle: null }),
    ];
    render(<RecentDocumentsList entries={entries} onLoad={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Sehr geehrte Damen ...')).toBeInTheDocument();
    expect(screen.queryByText(/bill.docx subtitle/)).toBeNull();
  });

  it('clicking a row calls onLoad with the entry id', () => {
    const onLoad = vi.fn();
    const entry = makeStoredEntry({ id: 'load-me' });
    render(<RecentDocumentsList entries={[entry]} onLoad={onLoad} onDelete={vi.fn()} />);

    const row = screen.getByTestId('recent-entry');
    // Click on the row (but not on the bin)
    fireEvent.click(within(row).getByText('bill.docx'));
    expect(onLoad).toHaveBeenCalledWith('load-me');
  });

  it('clicking the bin opens a confirm dialog and Cancel leaves the entry alone', () => {
    const onDelete = vi.fn();
    const entry = makeStoredEntry({ id: 'doomed' });
    render(<RecentDocumentsList entries={[entry]} onLoad={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('confirming the dialog calls onDelete with the entry id', () => {
    const onDelete = vi.fn();
    const entry = makeStoredEntry({ id: 'gone' });
    render(<RecentDocumentsList entries={[entry]} onLoad={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    // The "Delete" inside the dialog (different from the bin icon button label)
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith('gone');
  });

  it('the confirm dialog dismisses on Escape', () => {
    const entry = makeStoredEntry({ id: 'x' });
    render(<RecentDocumentsList entries={[entry]} onLoad={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the confirm dialog dismisses on click outside (backdrop)', () => {
    const onDelete = vi.fn();
    const entry = makeStoredEntry({ id: 'x' });
    render(<RecentDocumentsList entries={[entry]} onLoad={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    // The backdrop is the dialog's parent — clicking it dismisses without deleting.
    const backdrop = dialog.parentElement!;
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('incompatible entries render disabled and not clickable, but the bin still works', () => {
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    const goodEntry = makeStoredEntry({ id: 'good', name: 'good.docx', updatedAt: 2000 });
    const badEntry = makeIncompatibleEntry({ id: 'bad', name: 'broken.docx', updatedAt: 1000 });
    render(
      <RecentDocumentsList entries={[goodEntry, badEntry]} onLoad={onLoad} onDelete={onDelete} />
    );

    const rows = screen.getAllByTestId('recent-entry');
    expect(rows[1]).toHaveTextContent(/incompatible/i);

    // Clicking the disabled row does NOT trigger load
    fireEvent.click(within(rows[1]).getByText('broken.docx'));
    expect(onLoad).not.toHaveBeenCalled();

    // Bin still works
    const binButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(binButtons[1]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith('bad');
  });
});

import { AlertTriangle, FileText, Trash2 } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import type { RecentEntry } from '../utils/document-storage';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  if (diff < MINUTE_MS) return 'Just now';
  if (diff < HOUR_MS) {
    const m = Math.floor(diff / MINUTE_MS);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY_MS) {
    const h = Math.floor(diff / HOUR_MS);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (diff < 2 * DAY_MS) return 'Yesterday';
  if (diff < 7 * DAY_MS) {
    const d = Math.floor(diff / DAY_MS);
    return `${d} days ago`;
  }
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatTooltipTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

interface RecentDocumentsListProps {
  entries: RecentEntry[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

export function RecentDocumentsList({ entries, onLoad, onDelete }: RecentDocumentsListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  const handleConfirmDelete = () => {
    if (pendingDeleteId !== null) {
      onDelete(pendingDeleteId);
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="space-y-2">
      <ul className="rounded-lg border border-gray-200 divide-y divide-gray-200 bg-white">
        {entries.map((entry) => (
          <RecentRow
            key={entry.id}
            entry={entry}
            onLoad={onLoad}
            onRequestDelete={() => setPendingDeleteId(entry.id)}
          />
        ))}
      </ul>
      {pendingDeleteId !== null && (
        <DeleteConfirmDialog
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

interface RecentRowProps {
  entry: RecentEntry;
  onLoad: (id: string) => void;
  onRequestDelete: () => void;
}

const RecentRow: FC<RecentRowProps> = ({ entry, onLoad, onRequestDelete }) => {
  const isIncompatible = 'status' in entry;
  const subtitle = isIncompatible ? null : entry.subtitle;

  return (
    <li
      data-testid="recent-entry"
      className={`flex items-center gap-3 px-4 py-3 ${
        isIncompatible ? 'opacity-60' : 'hover:bg-gray-50 cursor-pointer'
      }`}
      onClick={() => {
        if (!isIncompatible) onLoad(entry.id);
      }}
    >
      <FileText className="w-5 h-5 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-900 truncate">{entry.name}</span>
          {isIncompatible && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
              <AlertTriangle className="w-3 h-3" />
              incompatible
            </span>
          )}
        </div>
        {subtitle && <div className="text-xs text-gray-500 truncate">{subtitle}</div>}
      </div>
      <span
        className="text-xs text-gray-500 shrink-0"
        title={formatTooltipTimestamp(entry.updatedAt)}
      >
        {formatRelativeTime(entry.updatedAt)}
      </span>
      <button
        type="button"
        aria-label="Delete saved document"
        className="p-1.5 text-gray-400 hover:text-red-600 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete();
        }}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
};

interface DeleteConfirmDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmDialog({ onCancel, onConfirm }: DeleteConfirmDialogProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">Delete this saved document?</h2>
        <p className="text-sm text-gray-600 mb-6">This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

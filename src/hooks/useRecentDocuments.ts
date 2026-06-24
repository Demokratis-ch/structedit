import { useCallback, useEffect, useState } from 'react';
import {
  deleteEntry as deleteEntryFromStorage,
  listRecents,
  loadEntry as loadEntryFromStorage,
  MAX_RECENTS,
  type RecentEntry,
  type StoredDocumentEntry,
  subscribeToStructuralChanges,
} from '../utils/document-storage';

export interface LoadedEntry {
  entry: StoredDocumentEntry;
  /** Blob URL for the "Original" preview, or null when the source has no separate
   *  original to render (e.g. a re-imported DocTree JSON, which *is* the tree). */
  documentUrl: string | null;
}

export interface UseRecentDocuments {
  entries: RecentEntry[];
  loadEntry: (id: string) => Promise<LoadedEntry | null>;
  deleteEntry: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRecentDocuments(): UseRecentDocuments {
  const [entries, setEntries] = useState<RecentEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await listRecents();
      setEntries(list.slice(0, MAX_RECENTS));
    } catch (err) {
      // Reading recents must never crash the app — fall back to an empty list
      // (consistent with how ephemeral storage is handled at the banner level).
      console.warn('Failed to list recent documents', err);
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToStructuralChanges(() => {
      refresh();
    });
    return unsubscribe;
  }, [refresh]);

  const loadEntry = useCallback(async (id: string): Promise<LoadedEntry | null> => {
    const raw = await loadEntryFromStorage(id);
    if (!raw || 'status' in raw) return null;
    // A re-imported DocTree JSON has no separate original to preview — the stored bytes
    // are the tree itself — so skip the blob URL and let the editor show Preview only.
    if (raw.source.kind === 'json-envelope') {
      return { entry: raw, documentUrl: null };
    }
    const blob = new Blob([raw.source.bytes], { type: raw.source.mime });
    const documentUrl = URL.createObjectURL(blob);
    return { entry: raw, documentUrl };
  }, []);

  const deleteEntry = useCallback(async (id: string) => {
    try {
      await deleteEntryFromStorage(id);
    } catch (err) {
      console.warn('Failed to delete entry', err);
    }
  }, []);

  return { entries, loadEntry, deleteEntry, refresh };
}

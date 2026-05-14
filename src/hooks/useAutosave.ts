import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '../components/ui/Toast';
import type { ContainerDocumentNode } from '../types/document';
import {
  formatQuotaMessage,
  StorageQuotaUnresolvableError,
  updateEntryTree,
} from '../utils/document-storage';

const DEBOUNCE_MS = 500;

/**
 * Autosave the current tree to the entry identified by `currentEntryId`. Writes
 * are debounced (500 ms), flushed on entry switch / unmount, and best-effort
 * flushed on `beforeunload`. Quota-unresolvable errors surface as a toast — the
 * in-memory tree is never blocked by storage failures.
 *
 * Returns a `flush()` function that callers can await to drain any pending
 * debounced write (e.g. before transitioning back to the upload view so the
 * picker shows the freshest `updatedAt`).
 *
 * No-op when `currentEntryId` is null (e.g. on the upload view, in private mode).
 */
export function useAutosave(
  currentEntryId: string | null,
  tree: ContainerDocumentNode | null
): { flush: () => Promise<void> } {
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const pendingRef = useRef<{ id: string; tree: ContainerDocumentNode } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performWrite = useCallback((): Promise<void> => {
    const target = pendingRef.current;
    if (!target) return Promise.resolve();
    pendingRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return updateEntryTree(target.id, target.tree).catch((err) => {
      if (err instanceof StorageQuotaUnresolvableError) {
        showToastRef.current(formatQuotaMessage(err));
      } else {
        console.error('Autosave write failed', err);
      }
    });
  }, []);

  // Effect A: schedule a debounced write whenever id or tree changes.
  useEffect(() => {
    if (!currentEntryId || !tree) return;
    pendingRef.current = { id: currentEntryId, tree };
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      performWrite();
    }, DEBOUNCE_MS);
  }, [currentEntryId, tree, performWrite]);

  // Effect B: flush pending writes when the id changes or the component unmounts.
  // (Tree-only changes never trigger this — that's how debouncing works.)
  useEffect(() => {
    return () => {
      performWrite();
    };
  }, [currentEntryId, performWrite]);

  // beforeunload: best-effort sync flush.
  useEffect(() => {
    const handler = () => performWrite();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [performWrite]);

  return { flush: performWrite };
}

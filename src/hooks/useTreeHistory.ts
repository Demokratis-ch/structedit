import { useState, useCallback, useMemo } from 'react';
import type { ContainerDocumentNode } from '../types/document';
import type { NodePath } from '../types/editor';
import { buildIndices } from '../utils/tree-utils';

const MAX_HISTORY_LENGTH = 50;

export const useTreeHistory = (initialDocument: ContainerDocumentNode) => {
  const [document, setDocument] = useState<ContainerDocumentNode>(initialDocument);
  const [history, setHistory] = useState<ContainerDocumentNode[]>([initialDocument]);
  const [historyIndex, setHistoryIndex] = useState(0);

  /**
   * Commit a new document state.
   * @param newDoc - The new document state
   * @param saveHistory - Whether to save to undo history (default true)
   */
  const commit = useCallback((newDoc: ContainerDocumentNode, saveHistory = true) => {
    setDocument(newDoc);

    if (saveHistory) {
      setHistory(prev => {
        // Truncate any redo history (entries after current index)
        const currentHistory = prev.slice(0, historyIndex + 1);

        // Add new entry
        const newHistory = [...currentHistory, newDoc];

        // Cap at max length by removing oldest entries
        if (newHistory.length > MAX_HISTORY_LENGTH) {
          return newHistory.slice(newHistory.length - MAX_HISTORY_LENGTH);
        }

        return newHistory;
      });

      setHistoryIndex(prev => {
        // New index is at the end, but capped by max history length
        const newIndex = prev + 1;
        return Math.min(newIndex, MAX_HISTORY_LENGTH - 1);
      });
    }
  }, [historyIndex]);

  /**
   * Undo to previous state.
   * @returns true if undo was successful, false if at beginning of history
   */
  const undo = useCallback((): boolean => {
    if (historyIndex <= 0) {
      return false;
    }

    const prevIndex = historyIndex - 1;
    setDocument(history[prevIndex]);
    setHistoryIndex(prevIndex);
    return true;
  }, [history, historyIndex]);

  /**
   * Redo to next state.
   * @returns true if redo was successful, false if at end of history
   */
  const redo = useCallback((): boolean => {
    if (historyIndex >= history.length - 1) {
      return false;
    }

    const nextIndex = historyIndex + 1;
    setDocument(history[nextIndex]);
    setHistoryIndex(nextIndex);
    return true;
  }, [history, historyIndex]);

  /**
   * Reset history with a new document.
   */
  const reset = useCallback((newDoc: ContainerDocumentNode) => {
    setDocument(newDoc);
    setHistory([newDoc]);
    setHistoryIndex(0);
  }, []);

  // Rebuild indices whenever document changes
  const { nodeIndex, parentIndex } = useMemo(
    () => buildIndices(document),
    [document]
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return {
    document,
    commit,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
    historyIndex,
    historyLength: history.length,
    nodeIndex,
    parentIndex,
  };
};

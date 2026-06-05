import { useCallback, useRef } from 'react';
import type { TreeUIStore } from '../stores/TreeUIStore';
import type { FlattenedNode } from '../types/editor';

export interface ClickModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

interface UseSelectionProps {
  store: TreeUIStore;
  flattenedNodes: FlattenedNode[];
  nodeIdToFlatIndex: Map<string, number>;
}

/**
 * Owns node selection: click modifiers (single / ctrl-toggle / shift-range),
 * keyboard move-selection, edit-mode entry, and anchor tracking. Decoupled from
 * tree operations so the range math is testable on its own.
 *
 * `anchorId` is the fixed end of a range selection; `lastSelectedId` is the most
 * recently touched node (the moving end). Both are returned so the orchestrating
 * hook can reset them after operations that reshape the selection.
 */
export const useSelection = ({ store, flattenedNodes, nodeIdToFlatIndex }: UseSelectionProps) => {
  // Refs for selection anchoring
  const anchorId = useRef<string | null>(null);
  const lastSelectedId = useRef<string | null>(null);

  /**
   * Handle single click on a node.
   * Supports shift-click for range selection and ctrl/meta-click for multi-select.
   */
  const handleNodeClick = useCallback(
    (id: string, modifiers: ClickModifiers) => {
      const { shiftKey, ctrlKey, metaKey } = modifiers;

      if (shiftKey && anchorId.current) {
        // Range selection from anchor to clicked node
        const anchorIndex = nodeIdToFlatIndex.get(anchorId.current);
        const clickedIndex = nodeIdToFlatIndex.get(id);

        if (anchorIndex !== undefined && clickedIndex !== undefined) {
          const start = Math.min(anchorIndex, clickedIndex);
          const end = Math.max(anchorIndex, clickedIndex);

          const rangeIds = new Set<string>();
          for (let i = start; i <= end; i++) {
            rangeIds.add(flattenedNodes[i].node.id);
          }

          store.setSelection(rangeIds);
          lastSelectedId.current = id;
        }
      } else if (ctrlKey || metaKey) {
        // Toggle selection
        const prev = store.getSelectedIds();
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        store.setSelection(next);
        lastSelectedId.current = id;
        anchorId.current = id;
      } else {
        // Single selection
        store.setSelection(new Set([id]));
        lastSelectedId.current = id;
        anchorId.current = id;
      }

      // Clear edit mode on click (unless double-click handles it)
      const currentEditingId = store.getEditingId();
      if (currentEditingId && currentEditingId !== id) {
        store.setEditingId(null);
      }
    },
    [flattenedNodes, nodeIdToFlatIndex, store]
  );

  /**
   * Handle double click to enter edit mode.
   */
  const handleNodeDoubleClick = useCallback(
    (id: string) => {
      store.batch(() => {
        store.setEditingNumberId(null);
        store.setSelection(new Set([id]));
        store.setEditingId(id);
      });
      lastSelectedId.current = id;
      anchorId.current = id;
    },
    [store]
  );

  /**
   * Handle double click on a node's number to enter number edit mode.
   */
  const handleNumberDoubleClick = useCallback(
    (id: string) => {
      store.batch(() => {
        store.setEditingId(null);
        store.setEditingNumberId(id);
        store.setSelection(new Set([id]));
      });
      lastSelectedId.current = id;
      anchorId.current = id;
    },
    [store]
  );

  /**
   * Clear all selection.
   */
  const clearSelection = useCallback(() => {
    store.batch(() => {
      store.setSelection(new Set());
      store.setEditingId(null);
      store.setEditingNumberId(null);
    });
    lastSelectedId.current = null;
    anchorId.current = null;
  }, [store]);

  /**
   * Move selection up or down.
   */
  const moveSelection = useCallback(
    (direction: 'up' | 'down', extendSelection: boolean) => {
      if (flattenedNodes.length === 0) return;

      const currentId = lastSelectedId.current;
      if (!currentId) {
        // Start from first or last node
        const newId =
          direction === 'down'
            ? flattenedNodes[0].node.id
            : flattenedNodes[flattenedNodes.length - 1].node.id;
        store.setSelection(new Set([newId]));
        lastSelectedId.current = newId;
        anchorId.current = newId;
        return;
      }

      const currentIndex = nodeIdToFlatIndex.get(currentId);
      if (currentIndex === undefined) return;

      const newIndex =
        direction === 'down'
          ? Math.min(currentIndex + 1, flattenedNodes.length - 1)
          : Math.max(currentIndex - 1, 0);

      if (newIndex === currentIndex) return;

      const newId = flattenedNodes[newIndex].node.id;

      if (extendSelection && anchorId.current) {
        // Extend range selection
        const anchorIndex = nodeIdToFlatIndex.get(anchorId.current);
        if (anchorIndex !== undefined) {
          const start = Math.min(anchorIndex, newIndex);
          const end = Math.max(anchorIndex, newIndex);

          const rangeIds = new Set<string>();
          for (let i = start; i <= end; i++) {
            rangeIds.add(flattenedNodes[i].node.id);
          }

          store.setSelection(rangeIds);
        }
      } else {
        store.setSelection(new Set([newId]));
        anchorId.current = newId;
      }

      lastSelectedId.current = newId;
    },
    [flattenedNodes, nodeIdToFlatIndex, store]
  );

  return {
    handleNodeClick,
    handleNodeDoubleClick,
    handleNumberDoubleClick,
    clearSelection,
    moveSelection,
    anchorId,
    lastSelectedId,
  };
};

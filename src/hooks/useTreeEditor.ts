import { useCallback, useMemo, useRef } from 'react';
import { TreeUIStore } from '../stores/TreeUIStore';
import type { ContainerDocumentNode, Language } from '../types/document';
import type { FlattenedNode } from '../types/editor';
import { DEFAULT_LANGUAGE } from '../utils/document-utils';
import { flattenForRendering } from '../utils/tree-utils';
import { useTreeHistory } from './useTreeHistory';
import { useTreeOperations } from './useTreeOperations';

interface ClickModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export const useTreeEditor = (
  initialDocument: ContainerDocumentNode,
  language: Language = DEFAULT_LANGUAGE
) => {
  // History management
  const {
    document,
    commit,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
    historyIndex,
    historyLength,
    nodeIndex,
    parentIndex,
  } = useTreeHistory(initialDocument);

  // UI state store (stable reference, never changes)
  const store = useRef(new TreeUIStore()).current;

  // Refs for selection anchoring
  const anchorId = useRef<string | null>(null);
  const lastSelectedId = useRef<string | null>(null);

  // Tree operations
  const {
    addNodeAfter,
    addNodeBefore,
    removeNodes,
    updateNodeContents,
    updateNodeNumber,
    indentNodes,
    outdentNodes,
    changeNodeTypes,
    moveNodeById,
    getReceivingParentId,
  } = useTreeOperations({
    document,
    commit,
    nodeIndex,
    parentIndex,
    language,
  });

  // Flattened nodes for rendering
  const flattenedNodes = useMemo<FlattenedNode[]>(() => flattenForRendering(document), [document]);

  // Create a lookup from id to flat index for range selection
  const nodeIdToFlatIndex = useMemo(() => {
    const map = new Map<string, number>();
    flattenedNodes.forEach((fn, idx) => {
      map.set(fn.node.id, idx);
    });
    return map;
  }, [flattenedNodes]);

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

  /**
   * Delete selected nodes.
   */
  const deleteSelected = useCallback(() => {
    const selectedIds = store.getSelectedIds();
    if (selectedIds.size === 0) return;

    const ids = [...selectedIds].filter((id) => nodeIdToFlatIndex.has(id));
    removeNodes(ids);
    clearSelection();
  }, [store, nodeIdToFlatIndex, removeNodes, clearSelection]);

  /**
   * Indent selected nodes (Tab).
   */
  const indentSelected = useCallback(() => {
    const selectedIds = store.getSelectedIds();
    if (selectedIds.size === 0) return;

    // Process nodes in flat order
    const sortedIds = [...selectedIds]
      .map((id) => ({ id, index: nodeIdToFlatIndex.get(id) ?? -1 }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.id);

    indentNodes(sortedIds);
  }, [store, nodeIdToFlatIndex, indentNodes]);

  /**
   * Outdent selected nodes (Shift+Tab).
   */
  const outdentSelected = useCallback(() => {
    const selectedIds = store.getSelectedIds();
    if (selectedIds.size === 0) return;

    // Sort in flat order; outdentNodes handles reverse processing internally
    const sortedIds = [...selectedIds]
      .map((id) => ({ id, index: nodeIdToFlatIndex.get(id) ?? -1 }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.id);

    outdentNodes(sortedIds);
  }, [store, nodeIdToFlatIndex, outdentNodes]);

  return {
    // Document state
    document,
    flattenedNodes,
    language,

    // UI state store
    store,

    // Selection actions
    handleNodeClick,
    handleNodeDoubleClick,
    handleNumberDoubleClick,
    clearSelection,
    moveSelection,

    // Tree operations
    addNodeAfter,
    addNodeBefore,
    removeNodes,
    updateNodeContents,
    updateNodeNumber,
    indentNodes,
    outdentNodes,
    changeNodeTypes,
    moveNodeById,

    // Bulk operations
    deleteSelected,
    indentSelected,
    outdentSelected,

    // History
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
    historyIndex,
    historyLength,

    // Indices
    nodeIndex,
    parentIndex,

    // Drag validation
    getReceivingParentId,

    // Refs for external use
    anchorId,
    lastSelectedId,
  };
};

export type TreeEditorHandle = ReturnType<typeof useTreeEditor>;

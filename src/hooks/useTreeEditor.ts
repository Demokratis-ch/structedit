import { useCallback, useMemo, useRef, useState } from 'react';
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

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNumberId, setEditingNumberId] = useState<string | null>(null);
  const anchorId = useRef<string | null>(null);
  const lastSelectedId = useRef<string | null>(null);

  // Drag state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Tree operations
  const {
    addNodeAfter,
    removeNode,
    updateNodeContents,
    updateNodeNumber,
    indentNode,
    outdentNode,
    changeNodeType,
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

          setSelectedIds(rangeIds);
          lastSelectedId.current = id;
        }
      } else if (ctrlKey || metaKey) {
        // Toggle selection
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
        lastSelectedId.current = id;
        anchorId.current = id;
      } else {
        // Single selection
        setSelectedIds(new Set([id]));
        lastSelectedId.current = id;
        anchorId.current = id;
      }

      // Clear edit mode on click (unless double-click handles it)
      if (editingId && editingId !== id) {
        setEditingId(null);
      }
    },
    [flattenedNodes, nodeIdToFlatIndex, editingId]
  );

  /**
   * Handle double click to enter edit mode.
   */
  const handleNodeDoubleClick = useCallback((id: string) => {
    setEditingNumberId(null);
    setSelectedIds(new Set([id]));
    setEditingId(id);
    lastSelectedId.current = id;
    anchorId.current = id;
  }, []);

  /**
   * Handle double click on a node's number to enter number edit mode.
   */
  const handleNumberDoubleClick = useCallback((id: string) => {
    setEditingId(null);
    setEditingNumberId(id);
    setSelectedIds(new Set([id]));
    lastSelectedId.current = id;
    anchorId.current = id;
  }, []);

  /**
   * Clear all selection.
   */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setEditingId(null);
    setEditingNumberId(null);
    lastSelectedId.current = null;
    anchorId.current = null;
  }, []);

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
        setSelectedIds(new Set([newId]));
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

          setSelectedIds(rangeIds);
        }
      } else {
        setSelectedIds(new Set([newId]));
        anchorId.current = newId;
      }

      lastSelectedId.current = newId;
    },
    [flattenedNodes, nodeIdToFlatIndex]
  );

  /**
   * Delete selected nodes.
   */
  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    // Remove nodes in reverse flat order to avoid index shifting issues
    const sortedIds = [...selectedIds]
      .map((id) => ({ id, index: nodeIdToFlatIndex.get(id) ?? -1 }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => b.index - a.index)
      .map((item) => item.id);

    // Remove each node
    sortedIds.forEach((id) => {
      removeNode(id);
    });

    clearSelection();
  }, [selectedIds, nodeIdToFlatIndex, removeNode, clearSelection]);

  /**
   * Indent selected nodes (Tab).
   */
  const indentSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    // Process nodes in flat order
    const sortedIds = [...selectedIds]
      .map((id) => ({ id, index: nodeIdToFlatIndex.get(id) ?? -1 }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.id);

    sortedIds.forEach((id) => {
      indentNode(id);
    });
  }, [selectedIds, nodeIdToFlatIndex, indentNode]);

  /**
   * Outdent selected nodes (Shift+Tab).
   */
  const outdentSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    // Process nodes in reverse flat order to maintain structure
    const sortedIds = [...selectedIds]
      .map((id) => ({ id, index: nodeIdToFlatIndex.get(id) ?? -1 }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => b.index - a.index)
      .map((item) => item.id);

    sortedIds.forEach((id) => {
      outdentNode(id);
    });
  }, [selectedIds, nodeIdToFlatIndex, outdentNode]);

  return {
    // Document state
    document,
    flattenedNodes,
    language,

    // Selection state
    selectedIds,
    editingId,
    setEditingId,
    editingNumberId,
    setEditingNumberId,

    // Drag state
    draggedNodeId,
    setDraggedNodeId,

    // Selection actions
    handleNodeClick,
    handleNodeDoubleClick,
    handleNumberDoubleClick,
    clearSelection,
    moveSelection,

    // Tree operations
    addNodeAfter,
    removeNode,
    updateNodeContents,
    updateNodeNumber,
    indentNode,
    outdentNode,
    changeNodeType,
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

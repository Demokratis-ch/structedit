import { useCallback, useMemo, useRef } from 'react';
import { TreeUIStore } from '../stores/TreeUIStore';
import type { DocumentRootNode, Language } from '../types/document';
import type { FlattenedNode } from '../types/editor';
import { DEFAULT_LANGUAGE } from '../utils/document-utils';
import { flattenForRendering } from '../utils/tree-utils';
import { useFlatNodeIndex } from './useFlatNodeIndex';
import { useSelection } from './useSelection';
import { useTreeHistory } from './useTreeHistory';
import { useTreeOperations } from './useTreeOperations';

export const useTreeEditor = (
  initialDocument: DocumentRootNode,
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
    changeNodeFormat,
    changeNodeContributionMode,
    changeSubtreeContributionMode,
    changeDocumentContributionMode,
    wrapInQuestion,
    changeQuestionFlavour,
    mergeNodes,
    canMergeIds,
    moveNodeById,
    moveNodesToBoundary,
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

  // Lookup from id to flat index for range selection and bulk-operation ordering
  const nodeIdToFlatIndex = useFlatNodeIndex(flattenedNodes);

  // Selection management (click modifiers, range math, anchor tracking)
  const {
    handleNodeClick,
    handleNodeDoubleClick,
    handleNumberDoubleClick,
    clearSelection,
    moveSelection,
    anchorId,
    lastSelectedId,
  } = useSelection({ store, flattenedNodes, nodeIdToFlatIndex });

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
   * Move selected nodes to the top or bottom of their respective parents.
   */
  const moveSelectedToBoundary = useCallback(
    (position: 'top' | 'bottom') => {
      const selectedIds = store.getSelectedIds();
      if (selectedIds.size === 0) return;

      const sortedIds = [...selectedIds]
        .map((id) => ({ id, index: nodeIdToFlatIndex.get(id) ?? -1 }))
        .filter((item) => item.index >= 0)
        .sort((a, b) => a.index - b.index)
        .map((item) => item.id);

      moveNodesToBoundary(sortedIds, position);
    },
    [store, nodeIdToFlatIndex, moveNodesToBoundary]
  );

  const moveSelectedToTop = useCallback(
    () => moveSelectedToBoundary('top'),
    [moveSelectedToBoundary]
  );
  const moveSelectedToBottom = useCallback(
    () => moveSelectedToBoundary('bottom'),
    [moveSelectedToBoundary]
  );

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

  /**
   * Merge currently selected nodes into one. Caller is expected to gate on
   * `canMergeSelected` for UI feedback; the underlying op no-ops on invalid
   * selections too. On success, narrow the selection to the surviving merged
   * node so the toolbar count and follow-up actions are coherent.
   */
  const mergeSelected = useCallback(() => {
    const selectedIds = store.getSelectedIds();
    if (selectedIds.size < 2) return;

    const sortedIds = [...selectedIds]
      .map((id) => ({ id, index: nodeIdToFlatIndex.get(id) ?? -1 }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.id);

    if (sortedIds.length < 2) return;
    if (!canMergeIds(sortedIds)) return;

    mergeNodes(sortedIds);
    // The merged node retains the first source's id; the rest are gone.
    const survivorId = sortedIds[0];
    store.setSelection(new Set([survivorId]));
    lastSelectedId.current = survivorId;
    anchorId.current = survivorId;
  }, [store, nodeIdToFlatIndex, mergeNodes, canMergeIds]);

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
    changeNodeFormat,
    changeNodeContributionMode,
    changeSubtreeContributionMode,
    changeDocumentContributionMode,
    wrapInQuestion,
    changeQuestionFlavour,
    moveNodeById,

    // Bulk operations
    deleteSelected,
    indentSelected,
    outdentSelected,
    moveSelectedToTop,
    moveSelectedToBottom,
    mergeSelected,
    canMergeIds,

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

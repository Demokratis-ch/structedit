import React, { useState } from 'react';
import { Block } from '../types';
import { useHistory } from './useHistory';
import { useBlockOperations } from './useBlockOperations';

export const useEditor = (initialBlocks: Block[] = []) => {
  const {
    blocks,
    setBlocks,
    history,
    historyIndex,
    commit,
    updateHistory,
    undo: historyUndo,
    redo: historyRedo,
    reset,
    canUndo,
    canRedo
  } = useHistory(initialBlocks);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);

  const {
    updateBlock,
    addBlock,
    removeBlock,
    bulkUpdateType,
    bulkDelete,
    indentSelection,
    moveBlock,
    handleFormat,
    blockRefs,
    lastSelectedId,
    anchorId
  } = useBlockOperations({
    blocks,
    commit,
    updateHistory,
    setBlocks,
    selectedIds,
    setSelectedIds,
    editingId,
    setEditingId
  });

  const handleBlockClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (editingId === id) return;

    if (e.metaKey || e.ctrlKey) {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
      setSelectedIds(newSelected);
      lastSelectedId.current = id;
      anchorId.current = id;
      setEditingId(null);
      return;
    }

    if (e.shiftKey && anchorId.current) {
      const anchorIndex = blocks.findIndex(b => b.id === anchorId.current);
      const currentIndex = blocks.findIndex(b => b.id === id);

      if (anchorIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        const newSelected = new Set<string>();
        for (let i = start; i <= end; i++) newSelected.add(blocks[i].id);
        setSelectedIds(newSelected);
        lastSelectedId.current = id;
        setEditingId(null);
        return;
      }
    }

    setSelectedIds(new Set([id]));
    lastSelectedId.current = id;
    anchorId.current = id;
    setEditingId(null);
  };

  const handleBlockDoubleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setEditingId(id);
    setSelectedIds(new Set([id]));
    lastSelectedId.current = id;
    anchorId.current = id;
    setTimeout(() => blockRefs.current[id]?.focus(), 0);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    lastSelectedId.current = null;
    anchorId.current = null;
    setEditingId(null);
  };

  const undo = () => {
    if (historyUndo()) setEditingId(null);
  };

  const redo = () => {
    if (historyRedo()) setEditingId(null);
  };

  return {
    blocks,
    setBlocks,
    history,
    historyIndex,
    historyLength: history.length,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedIds,
    setSelectedIds,
    editingId,
    setEditingId,
    draggedBlockId,
    setDragBlock: setDraggedBlockId,
    moveBlock,
    handleBlockClick,
    handleBlockDoubleClick,
    clearSelection,
    addBlock,
    removeBlock,
    updateBlock,
    bulkUpdateType,
    bulkDelete,
    handleFormat,
    indentSelection,
    blockRefs,
    initEditor: reset,
    lastSelectedId,
    anchorId,
    commit
  };
};

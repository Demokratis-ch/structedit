import { useRef, useCallback } from 'react';
import { Block, BlockType } from '../types';
import { generateId } from '../utils/document-utils';

interface UseBlockOperationsProps {
  blocks: Block[];
  commit: (blocks: Block[], saveHistory?: boolean) => void;
  updateHistory: (blocks: Block[]) => void;
  setBlocks: (blocks: Block[]) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}

export const useBlockOperations = ({
  blocks,
  commit,
  updateHistory,
  setBlocks,
  selectedIds,
  setSelectedIds,
  editingId,
  setEditingId
}: UseBlockOperationsProps) => {
  const lastSelectedId = useRef<string | null>(null);
  const anchorId = useRef<string | null>(null);
  const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const textChangeTimeoutRef = useRef<any>(null);

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    const newBlocks = blocks.map(b => b.id === id ? { ...b, ...updates } : b);
    setBlocks(newBlocks);

    if (textChangeTimeoutRef.current) clearTimeout(textChangeTimeoutRef.current);
    textChangeTimeoutRef.current = setTimeout(() => {
      updateHistory(newBlocks);
    }, 1000);
  }, [blocks, setBlocks, updateHistory]);

  const addBlock = useCallback((afterId?: string) => {
    let targetIndex = blocks.length - 1;
    let targetBlock = blocks[targetIndex];

    if (afterId) {
      targetIndex = blocks.findIndex(b => b.id === afterId);
      targetBlock = blocks[targetIndex];
    }

    if (blocks.length === 0) {
      const newBlock: Block = { id: generateId(), content: '', type: 'p', depth: 0 };
      commit([newBlock]);
      setEditingId(newBlock.id);
      setSelectedIds(new Set([newBlock.id]));
      lastSelectedId.current = newBlock.id;
      anchorId.current = newBlock.id;
      setTimeout(() => blockRefs.current[newBlock.id]?.focus(), 10);
      return;
    }

    if (targetIndex === -1) return;

    const nextType = (['ul', 'ol', 'abc'].includes(targetBlock.type)) ? targetBlock.type : 'p';
    const newBlock: Block = {
      id: generateId(),
      content: '',
      type: nextType,
      depth: targetBlock.depth
    };

    const newBlocks = [...blocks];
    newBlocks.splice(targetIndex + 1, 0, newBlock);
    commit(newBlocks);

    setEditingId(newBlock.id);
    setSelectedIds(new Set([newBlock.id]));
    lastSelectedId.current = newBlock.id;
    anchorId.current = newBlock.id;
    setTimeout(() => blockRefs.current[newBlock.id]?.focus(), 10);
  }, [blocks, commit, setEditingId, setSelectedIds]);

  const removeBlock = useCallback((id: string) => {
    const index = blocks.findIndex(b => b.id === id);
    if (index === -1) return;

    const prevBlockId = index > 0 ? blocks[index - 1].id : null;
    const newBlocks = blocks.filter(b => b.id !== id);
    commit(newBlocks);

    if (prevBlockId) {
      setSelectedIds(new Set([prevBlockId]));
      setEditingId(prevBlockId);
      lastSelectedId.current = prevBlockId;
      anchorId.current = prevBlockId;
      setTimeout(() => {
        const el = blockRefs.current[prevBlockId];
        if (el) {
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
        }
      }, 10);
    } else if (newBlocks.length > 0) {
      const nextBlockId = newBlocks[0].id;
      setSelectedIds(new Set([nextBlockId]));
      setEditingId(nextBlockId);
      lastSelectedId.current = nextBlockId;
      anchorId.current = nextBlockId;
    } else {
      setSelectedIds(new Set());
      setEditingId(null);
      lastSelectedId.current = null;
      anchorId.current = null;
    }
  }, [blocks, commit, setEditingId, setSelectedIds]);

  const bulkUpdateType = useCallback((type: BlockType) => {
    const newBlocks = blocks.map(b => selectedIds.has(b.id) ? { ...b, type } : b);
    commit(newBlocks);
  }, [blocks, selectedIds, commit]);

  const bulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;

    const sortedIndices = blocks
      .map((b, i) => ({ id: b.id, index: i }))
      .filter(item => selectedIds.has(item.id))
      .sort((a, b) => a.index - b.index);

    const firstIdx = sortedIndices[0].index;
    let nextFocusId: string | null = null;

    if (firstIdx > 0) {
      nextFocusId = blocks[firstIdx - 1].id;
    } else if (firstIdx + sortedIndices.length < blocks.length) {
      nextFocusId = blocks[firstIdx + sortedIndices.length].id;
    }

    const newBlocks = blocks.filter(b => !selectedIds.has(b.id));
    commit(newBlocks);

    if (nextFocusId && newBlocks.some(b => b.id === nextFocusId)) {
      setSelectedIds(new Set([nextFocusId]));
      lastSelectedId.current = nextFocusId;
      anchorId.current = nextFocusId;
    } else {
      setSelectedIds(new Set());
      lastSelectedId.current = null;
      anchorId.current = null;
    }
  }, [blocks, selectedIds, commit, setSelectedIds]);

  const indentSelection = useCallback((delta: number) => {
    const newBlocks = blocks.map(b => {
      if (selectedIds.has(b.id)) {
        const newDepth = delta === -1
          ? Math.max(0, b.depth - 1)
          : Math.min(5, b.depth + 1);
        return { ...b, depth: newDepth };
      }
      return b;
    });
    commit(newBlocks);
  }, [blocks, selectedIds, commit]);

  const moveBlock = useCallback((dragId: string, targetId: string) => {
    const dragIndex = blocks.findIndex(b => b.id === dragId);
    const targetIndex = blocks.findIndex(b => b.id === targetId);

    if (dragIndex === -1 || targetIndex === -1 || dragIndex === targetIndex) return;

    const newBlocks = [...blocks];
    const [draggedBlock] = newBlocks.splice(dragIndex, 1);
    newBlocks.splice(targetIndex, 0, draggedBlock);
    commit(newBlocks);
  }, [blocks, commit]);

  const handleFormat = useCallback((command: 'bold' | 'italic') => {
    if (editingId) {
      document.execCommand(command, false);
    } else {
      const tag = command === 'bold' ? 'b' : 'i';
      const newBlocks = blocks.map(b => {
        if (selectedIds.has(b.id)) {
          const isWrapped = b.content.startsWith(`<${tag}>`) && b.content.endsWith(`</${tag}>`);
          if (isWrapped) {
            return { ...b, content: b.content.slice(tag.length + 2, -(tag.length + 3)) };
          } else {
            return { ...b, content: `<${tag}>${b.content}</${tag}>` };
          }
        }
        return b;
      });
      commit(newBlocks);
    }
  }, [blocks, selectedIds, editingId, commit]);

  return {
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
  };
};

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useEditor } from '../hooks/useEditor';
import { Block } from '../types';
import { convertToXml, convertToHtml, downloadFile } from '../utils/document-utils';
import { Toolbar } from './Toolbar';
import { FloatingToolbar } from './FloatingToolbar';
import { SourcePreview } from './SourcePreview';
import { BlockItem } from './BlockItem';

interface EditorProps {
  initialBlocks: Block[];
  pdfUrl: string | null;
  onBack: () => void;
  onDownload?: (format: 'json' | 'xml' | 'html') => void;
}
interface EnrichedBlock extends Block {
  level: number;
  lines: { depth: number; type: 'vertical' | 'corner' | 'branch' }[];
}

const isCursorAtStart = (el: HTMLElement) => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().trim().length === 0;
};

const isCursorAtEnd = (el: HTMLElement) => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const postRange = range.cloneRange();
  postRange.selectNodeContents(el);
  postRange.setStart(range.endContainer, range.endOffset);
  return postRange.toString().trim().length === 0;
};

export function Editor({ initialBlocks, pdfUrl, onBack, onDownload }: EditorProps) {
  const {
    blocks,
    undo,
    redo,
    historyIndex,
    historyLength,
    selectedIds,
    editingId,
    setEditingId,
    setDragBlock,
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
    commit,
    draggedBlockId, // Kept for handleDragOver and handleDrop
    canUndo, // Kept for Toolbar
    canRedo, // Kept for Toolbar
    lastSelectedId, // Kept for handleGlobalKeyDown
    anchorId // Kept for handleGlobalKeyDown
  } = useEditor(initialBlocks);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'top' | 'bottom' } | null>(null);
  const [hoveredHandleId, setHoveredHandleId] = useState<string | null>(null);

  const enrichedBlocks = useMemo(() => {
    let h1Active = false, h2Active = false;
    const withLevels = blocks.map(block => {
      let level = 0;
      if (block.type === 'h1') { level = block.depth; h1Active = true; h2Active = false; }
      else if (block.type === 'h2') { level = 1 + block.depth; h2Active = true; }
      else { level = (h2Active ? 2 : h1Active ? 1 : 0) + block.depth; }
      return { ...block, level };
    });
    return withLevels.map((block, index) => {
      const lines: { depth: number; type: 'vertical' | 'corner' | 'branch' }[] = [];
      for (let d = 0; d < block.level; d++) {
        let hasFutureInScope = false;
        for (let j = index + 1; j < withLevels.length; j++) {
          if (withLevels[j].level <= d) break;
          if (withLevels[j].level > d) { hasFutureInScope = true; break; }
        }
        const isImmediateParentLine = d === block.level - 1;
        let type: 'vertical' | 'corner' | 'branch' = 'vertical';
        if (hasFutureInScope) type = isImmediateParentLine ? 'branch' : 'vertical';
        else if (isImmediateParentLine) type = 'corner';
        if (!hasFutureInScope && !isImmediateParentLine) continue;
        lines.push({ depth: d, type });
      }
      return { ...block, lines } as EnrichedBlock;
    });
  }, [blocks]);

  const listCounters: Record<number, { type: string; count: number }> = {};

  const handleDragStart = (e: React.DragEvent, id: string) => { setDragBlock(id); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedBlockId === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropTarget({ id, position: e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom' });
  };
  const handleDragEnd = () => { setDragBlock(null); setDropTarget(null); setHoveredHandleId(null); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedBlockId && dropTarget && draggedBlockId !== dropTarget.id) {
      const oldIndex = blocks.findIndex(b => b.id === draggedBlockId);
      let targetIndex = blocks.findIndex(b => b.id === dropTarget.id);
      if (oldIndex < targetIndex && dropTarget.position === 'top') targetIndex--;
      else if (oldIndex > targetIndex && dropTarget.position === 'bottom') targetIndex++;
      if (oldIndex !== targetIndex) moveBlock(draggedBlockId, blocks[targetIndex].id);
    }
    handleDragEnd();
  };

  const handleBlockKeyDown = (e: React.KeyboardEvent, id: string) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); handleFormat('bold'); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); handleFormat('italic'); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBlock(id); }
    else if (e.key === 'Backspace') {
      const block = blocks.find(b => b.id === id);
      if (!block?.content || block.content === '<br>' || block.content.trim() === '') {
        if (blocks.length > 0) { e.preventDefault(); removeBlock(id); }
      }
    } else if (e.key === 'Tab') { e.preventDefault(); indentSelection(e.shiftKey ? -1 : 1); }
    else if (e.key === 'ArrowUp' && isCursorAtStart(e.currentTarget as HTMLElement)) {
      const index = blocks.findIndex(b => b.id === id);
      if (index > 0) {
        e.preventDefault();
        const prevId = blocks[index - 1].id;
        setEditingId(prevId);
        setTimeout(() => {
          const el = blockRefs.current[prevId];
          if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(r); }
        }, 0);
      }
    } else if (e.key === 'ArrowDown' && isCursorAtEnd(e.currentTarget as HTMLElement)) {
      const index = blocks.findIndex(b => b.id === id);
      if (index < blocks.length - 1) { e.preventDefault(); const nextId = blocks[index + 1].id; setEditingId(nextId); setTimeout(() => blockRefs.current[nextId]?.focus(), 0); }
    }
  };

  const handleGlobalKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); handleFormat('bold'); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); handleFormat('italic'); return; }
    if (editingId) return;
    if (selectedIds.size === 0) {
      if (blocks.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); lastSelectedId.current = blocks[0].id; anchorId.current = blocks[0].id;
      }
      return;
    }
    const lastId = lastSelectedId.current;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && lastId) {
      e.preventDefault();
      const index = blocks.findIndex(b => b.id === lastId);
      if (index === -1) return;
      const nextIndex = e.key === 'ArrowUp' ? Math.max(0, index - 1) : Math.min(blocks.length - 1, index + 1);
      if (nextIndex !== index) {
        lastSelectedId.current = blocks[nextIndex].id;
        if (!e.shiftKey) anchorId.current = blocks[nextIndex].id;
        blockRefs.current[blocks[nextIndex].id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } else if (e.key === 'Enter' && lastId) { e.preventDefault(); addBlock(lastId); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); bulkDelete(); }
    else if (e.key === 'Tab') { e.preventDefault(); indentSelection(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); clearSelection(); }
    else if (['1','2','3','4','5','6'].includes(e.key)) {
      e.preventDefault();
      const types = { '1': 'h1', '2': 'h2', '3': 'p', '4': 'ul', '5': 'ol', '6': 'abc' } as const;
      bulkUpdateType(types[e.key as keyof typeof types]);
    }
  };

  const handleDownload = (format: 'xml' | 'html' | 'json') => {
    const configs = { xml: { c: convertToXml(blocks), m: 'application/xml', e: 'xml' }, html: { c: convertToHtml(blocks), m: 'text/html', e: 'html' }, json: { c: JSON.stringify(blocks, null, 2), m: 'application/json', e: 'json' } };
    downloadFile(configs[format].c, `document.${configs[format].e}`, configs[format].m);
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <Toolbar onBack={onBack} onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} historyIndex={historyIndex} historyLength={history.length} onDownload={handleDownload} />
      <div className="flex-1 flex overflow-hidden">
        {pdfUrl && <SourcePreview url={pdfUrl} onClose={onBack} />}
        <div className="flex-1 overflow-y-auto bg-white relative outline-none" tabIndex={0} ref={containerRef} onKeyDown={handleGlobalKeyDown} onClick={clearSelection}>
          <div className="max-w-3xl mx-auto py-12 pr-8 pl-16 pb-48">
            <div className="mb-8 pb-4 border-b border-gray-100 flex justify-between items-end">
              <div><h2 className="text-2xl font-bold mb-1">Block Editor</h2><p className="text-gray-500">Click to select. Shift+Click range. Double-click to edit.</p></div>
              <div className="text-xs text-gray-400 hidden sm:block text-right space-y-1">
                <div><kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 font-sans">1-6</kbd> type</div>
                <div><kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 font-sans">Tab</kbd> indent</div>
              </div>
            </div>
            <div className="space-y-1 min-h-[300px] relative">
              {enrichedBlocks.length === 0 ? (
                <div onClick={(e) => { e.stopPropagation(); addBlock(); }} className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 cursor-pointer hover:text-gray-500 transition-colors border-2 border-dashed border-gray-100 rounded-xl m-4">
                  <Plus size={32} className="mb-2 opacity-50" /><p className="font-medium">List is empty</p><p className="text-sm">Click here to start writing</p>
                </div>
              ) : (() => {
                  const listCounters: Record<number, { type: string, count: number }> = {};
                  return enrichedBlocks.map((block) => {

                for (let d = block.depth + 1; d <= 6; d++) delete listCounters[d];
                let listLabel = '';
                if (block.type === 'ol' || block.type === 'abc') {
                  const current = listCounters[block.depth] || { type: block.type, count: 0 };
                  if (current.type !== block.type) { current.type = block.type; current.count = 1; } else current.count++;
                  listCounters[block.depth] = current;
                  listLabel = block.type === 'ol' ? `${current.count}.` : `${'abcdefghijklmnopqrstuvwxyz'[(current.count - 1) % 26]})`;
                } else delete listCounters[block.depth];
                return (
                  // @ts-ignore - Key is required for map but TS complains about Props mismatch
                  <BlockItem key={block.id} block={block} isSelected={selectedIds.has(block.id)} isEditing={editingId === block.id} isDragging={draggedBlockId === block.id}
                    isDropTarget={dropTarget?.id === block.id} dropPosition={dropTarget?.id === block.id ? dropTarget.position : null} listLabel={listLabel} hoveredHandleId={hoveredHandleId} blockRefs={blockRefs}
                    onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} onDragEnd={handleDragEnd} onClick={handleBlockClick} onDoubleClick={handleBlockDoubleClick}
                    onHoverHandle={setHoveredHandleId} onUpdateContent={(id, val) => updateBlock(id, { content: val })} onKeyDown={handleBlockKeyDown} onFocus={setEditingId} />
                );
                });
              })()}
            </div>
          </div>
          <FloatingToolbar selectedCount={selectedIds.size} isEditing={!!editingId} onFormat={handleFormat} onUpdateType={bulkUpdateType} onDelete={bulkDelete} onClearSelection={clearSelection} />
        </div>
      </div>
    </div>
  );
}

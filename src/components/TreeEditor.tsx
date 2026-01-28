import { Plus } from 'lucide-react';
import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { useTreeEditor } from '../hooks/useTreeEditor';
import type { ContainerDocumentNode, Language } from '../types/document';
import { downloadFile } from '../utils/document-utils';
import { FloatingToolbar } from './FloatingToolbar';
import { RecursiveTreeNode } from './RecursiveTreeNode';
import { SourcePreview } from './SourcePreview';
import { Toolbar } from './Toolbar';

interface TreeEditorProps {
  initialDocument: ContainerDocumentNode;
  pdfUrl: string | null;
  language?: Language;
  onBack: () => void;
  onDownload?: () => void;
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

export function TreeEditor({
  initialDocument,
  pdfUrl,
  language = 'de',
  onBack,
  onDownload,
}: TreeEditorProps) {
  const {
    document,
    flattenedNodes,
    selectedIds,
    editingId,
    setEditingId,
    draggedNodeId,
    setDraggedNodeId,
    handleNodeClick,
    handleNodeDoubleClick,
    clearSelection,
    moveSelection,
    addNodeAfter,
    removeNode,
    updateNodeContents,
    changeNodeType,
    moveNodeById,
    indentSelected,
    outdentSelected,
    deleteSelected,
    undo,
    redo,
    canUndo,
    canRedo,
    historyIndex,
    historyLength,
    lastSelectedId,
  } = useTreeEditor(initialDocument, language);

  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'top' | 'bottom' } | null>(
    null
  );
  const [hoveredHandleId, setHoveredHandleId] = useState<string | null>(null);

  // Compute toolbar type for single selected node
  const selectedNodeType = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const selectedId = Array.from(selectedIds)[0];
    const flatNode = flattenedNodes.find((fn) => fn.node.id === selectedId);
    if (!flatNode) return null;

    const nodeType = flatNode.node.type;
    if (nodeType === 'heading') return 'heading';
    if (nodeType === 'content') return 'p';
    if (nodeType === 'footnote') return 'footnote';
    if (nodeType === 'list_item') {
      // Check parent list style via the node's number format
      const num = flatNode.node.number;
      if (num === null || num === '•') return 'ul';
      if (/^[a-z]\.?$/i.test(num)) return 'abc';
      return 'ol';
    }
    if (nodeType === 'list') {
      // For list containers, check first child's number format
      const listNode = flatNode.node as { children?: { number?: string | null }[] };
      const firstChild = listNode.children?.[0];
      const num = firstChild?.number;
      if (num === null || num === undefined || num === '•') return 'ul';
      if (/^[a-z]\.?$/i.test(num)) return 'abc';
      return 'ol';
    }
    return null;
  }, [selectedIds, flattenedNodes]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedNodeId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedNodeId === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropTarget({ id, position: e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom' });
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
    setDropTarget(null);
    setHoveredHandleId(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedNodeId && dropTarget) {
      moveNodeById(draggedNodeId, dropTarget.id, dropTarget.position);
    }
    handleDragEnd();
  };

  const handleBlockKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addNodeAfter(id);
    } else if (e.key === 'Backspace') {
      const node = flattenedNodes.find((fn) => fn.node.id === id);
      const content = node && 'contents' in node.node ? node.node.contents[language] || '' : '';
      if (!content || content === '<br>' || content.trim() === '') {
        if (flattenedNodes.length > 0) {
          e.preventDefault();
          removeNode(id);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentSelected();
      } else {
        indentSelected();
      }
    } else if (e.key === 'ArrowUp' && isCursorAtStart(e.currentTarget as HTMLElement)) {
      const index = flattenedNodes.findIndex((fn) => fn.node.id === id);
      if (index > 0) {
        e.preventDefault();
        const prevId = flattenedNodes[index - 1].node.id;
        setEditingId(prevId);
        setTimeout(() => {
          const el = blockRefs.current[prevId];
          if (el) {
            el.focus();
            const r = document.createRange();
            r.selectNodeContents(el);
            r.collapse(false);
            window.getSelection()?.removeAllRanges();
            window.getSelection()?.addRange(r);
          }
        }, 0);
      }
    } else if (e.key === 'ArrowDown' && isCursorAtEnd(e.currentTarget as HTMLElement)) {
      const index = flattenedNodes.findIndex((fn) => fn.node.id === id);
      if (index < flattenedNodes.length - 1) {
        e.preventDefault();
        const nextId = flattenedNodes[index + 1].node.id;
        setEditingId(nextId);
        setTimeout(() => blockRefs.current[nextId]?.focus(), 0);
      }
    }
  };

  const handleGlobalKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (editingId) return;

    if (selectedIds.size === 0) {
      if (flattenedNodes.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        moveSelection(e.key === 'ArrowDown' ? 'down' : 'up', false);
      }
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(e.key === 'ArrowDown' ? 'down' : 'up', e.shiftKey);
    } else if (e.key === 'Enter' && lastSelectedId.current) {
      e.preventDefault();
      addNodeAfter(lastSelectedId.current);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentSelected();
      } else {
        indentSelected();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearSelection();
    }
  };

  const handleBulkUpdateType = (toolbarType: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // Map toolbar type to target type and list style
    type ListStyle = 'unordered' | 'numbered' | 'lettered';
    let targetType: 'heading' | 'content' | 'list' | 'footnote';
    let listStyle: ListStyle | undefined;

    switch (toolbarType) {
      case 'heading':
        targetType = 'heading';
        break;
      case 'p':
        targetType = 'content';
        break;
      case 'ul':
        targetType = 'list';
        listStyle = 'unordered';
        break;
      case 'ol':
        targetType = 'list';
        listStyle = 'numbered';
        break;
      case 'abc':
        targetType = 'list';
        listStyle = 'lettered';
        break;
      case 'footnote':
        targetType = 'footnote';
        break;
      default:
        return;
    }

    // Apply type change to each selected node
    ids.forEach((id) => {
      changeNodeType(id, targetType, listStyle);
    });
  };

  const handleDownload = () => {
    downloadFile(JSON.stringify(document, null, 2), 'document.json', 'application/json');
  };

  const handleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Focus the container so keyboard events work
    containerRef.current?.focus();
    handleNodeClick(id, {
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    });
  };

  const handleDoubleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    handleNodeDoubleClick(id);
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <Toolbar
        onBack={onBack}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        historyIndex={historyIndex}
        historyLength={historyLength}
        onDownload={handleDownload}
      />
      <div className="flex-1 flex overflow-hidden">
        {pdfUrl && <SourcePreview url={pdfUrl} onClose={onBack} />}
        <div
          className="flex-1 overflow-y-auto bg-white relative outline-none"
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleGlobalKeyDown}
          onClick={clearSelection}
        >
          <div className="max-w-3xl mx-auto py-12 pr-8 pl-16 pb-48">
            <div className="mb-8 pb-4 border-b border-gray-100 flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-bold mb-1">Tree Editor</h2>
                <p className="text-gray-500">
                  Click to select. Shift+Click range. Double-click to edit.
                </p>
              </div>
              <div className="text-xs text-gray-400 hidden sm:block text-right space-y-1">
                <div>
                  <kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 font-sans">
                    Tab
                  </kbd>{' '}
                  indent
                </div>
                <div>
                  <kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 font-sans">
                    Shift+Tab
                  </kbd>{' '}
                  outdent
                </div>
              </div>
            </div>
            <div className="min-h-[300px] relative">
              {document.children.length === 0 ? (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    addNodeAfter(document.id);
                  }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 cursor-pointer hover:text-gray-500 transition-colors border-2 border-dashed border-gray-100 rounded-xl m-4"
                >
                  <Plus size={32} className="mb-2 opacity-50" />
                  <p className="font-medium">Document is empty</p>
                  <p className="text-sm">Click here to start writing</p>
                </div>
              ) : (
                <RecursiveTreeNode
                  node={document}
                  depth={0}
                  isSelected={false}
                  isEditing={false}
                  isDragging={false}
                  isDropTarget={false}
                  dropPosition={null}
                  hoveredHandleId={hoveredHandleId}
                  language={language}
                  selectedIds={selectedIds}
                  editingId={editingId}
                  draggedNodeId={draggedNodeId}
                  dropTarget={dropTarget}
                  blockRefs={blockRefs}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                  onHoverHandle={setHoveredHandleId}
                  onUpdateContent={updateNodeContents}
                  onKeyDown={handleBlockKeyDown}
                  onFocus={setEditingId}
                />
              )}
            </div>
          </div>
          <FloatingToolbar
            selectedCount={selectedIds.size}
            isEditing={!!editingId}
            selectedNodeType={selectedNodeType}
            onUpdateType={handleBulkUpdateType}
            onDelete={deleteSelected}
            onClearSelection={clearSelection}
          />
        </div>
      </div>
    </div>
  );
}

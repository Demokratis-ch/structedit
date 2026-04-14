import { Plus } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTreeEditor } from '../hooks/useTreeEditor';
import type { ContainerDocumentNode, Language } from '../types/document';
import { deriveJsonFilename, downloadFile } from '../utils/document-utils';
import { FloatingToolbar } from './FloatingToolbar';
import { LeftPane } from './LeftPane';
import { RecursiveTreeNode } from './RecursiveTreeNode';
import { Toolbar } from './Toolbar';
import { TreeCallbacksContext, TreeUIStoreContext } from './TreeNodeContext';

interface TreeEditorProps {
  initialDocument: ContainerDocumentNode;
  pdfUrl: string | null;
  documentName?: string | null;
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
  documentName,
  language = 'de',
  onBack,
  onDownload,
}: TreeEditorProps) {
  const {
    document,
    flattenedNodes,
    store,
    handleNodeClick,
    handleNodeDoubleClick,
    handleNumberDoubleClick,
    clearSelection,
    moveSelection,
    addNodeAfter,
    addNodeBefore,
    removeNodes,
    updateNodeContents,
    updateNodeNumber,
    changeNodeTypes,
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
    getReceivingParentId,
  } = useTreeEditor(initialDocument, language);

  // Subscribe to aggregate store values needed at this level
  const selectedCount = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getSelectedCount(), [store])
  );
  const editingId = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getEditingId(), [store])
  );
  const selectedIds = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getSelectedIds(), [store])
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  const handleOutlineHeadingClick = useCallback(
    (nodeId: string) => {
      store.setSelection(new Set([nodeId]));
      // Scroll the node into view after React renders the selection change
      requestAnimationFrame(() => {
        blockRefs.current[nodeId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [store]
  );

  // Compute toolbar type for single selected node
  const selectedNodeType = useMemo(() => {
    if (selectedCount !== 1) return null;
    const selectedId = Array.from(selectedIds)[0];
    const flatNode = flattenedNodes.find((fn) => fn.node.id === selectedId);
    if (!flatNode) return null;

    const nodeType = flatNode.node.type;
    if (nodeType === 'heading') return 'heading';
    if (nodeType === 'content') return 'content';
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
  }, [selectedCount, selectedIds, flattenedNodes]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    store.setDraggedNodeId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    const draggedNodeId = store.getDraggedNodeId();
    if (draggedNodeId === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    store.setDropTarget({
      id,
      position: e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom',
    });

    // Compute receiving parent for visual feedback
    if (draggedNodeId) {
      const parentId = getReceivingParentId(draggedNodeId, id);
      store.setReceivingParentId(parentId);
    }
  };

  const handleDragEnd = () => {
    store.batch(() => {
      store.setDraggedNodeId(null);
      store.setDropTarget(null);
      store.setHoveredHandleId(null);
      store.setReceivingParentId(null);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedNodeId = store.getDraggedNodeId();
    const dropTarget = store.getDropTarget();
    if (draggedNodeId && dropTarget) {
      moveNodeById(draggedNodeId, dropTarget.id, dropTarget.position);
    }
    handleDragEnd();
  };

  const handleAddNodeBefore = (id: string) => {
    const newId = addNodeBefore(id);
    if (newId) {
      store.setEditingId(newId);
      setTimeout(() => blockRefs.current[newId]?.focus(), 0);
    }
  };

  const handleAddNodeAfter = (id: string) => {
    const newId = addNodeAfter(id);
    if (newId) {
      store.setEditingId(newId);
      setTimeout(() => blockRefs.current[newId]?.focus(), 0);
    }
  };

  const handleBlockKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newId = addNodeAfter(id);
      // Focus the newly created node so the user can type in it immediately
      if (newId) {
        store.setEditingId(newId);
        setTimeout(() => blockRefs.current[newId]?.focus(), 0);
      }
    } else if (e.key === 'Backspace') {
      const node = flattenedNodes.find((fn) => fn.node.id === id);
      const content = node && 'contents' in node.node ? node.node.contents[language] || '' : '';
      if (!content || content === '<br>' || content.trim() === '') {
        if (flattenedNodes.length > 0) {
          e.preventDefault();
          removeNodes([id]);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentSelected();
      } else {
        indentSelected();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // Prevent global handler from also clearing selection
      // Exit edit mode but keep the node selected
      store.setEditingId(null);
      containerRef.current?.focus();
    } else if (e.key === 'ArrowUp' && isCursorAtStart(e.currentTarget as HTMLElement)) {
      const index = flattenedNodes.findIndex((fn) => fn.node.id === id);
      if (index > 0) {
        e.preventDefault();
        const prevId = flattenedNodes[index - 1].node.id;
        store.setEditingId(prevId);
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
        store.setEditingId(nextId);
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
    const currentEditingId = store.getEditingId();
    if (currentEditingId) return;

    const currentSelectedIds = store.getSelectedIds();
    if (currentSelectedIds.size === 0) {
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
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const shortcutMap: Record<string, string> = {
        h: 'heading',
        t: 'content',
        c: 'content',
        u: 'ul',
        o: 'ol',
        a: 'abc',
        f: 'footnote',
      };
      const toolbarType = shortcutMap[e.key.toLowerCase()];
      if (toolbarType) {
        e.preventDefault();
        handleBulkUpdateType(toolbarType);
      }
    }
  };

  const handleBulkUpdateType = (toolbarType: string) => {
    const currentSelectedIds = store.getSelectedIds();
    if (currentSelectedIds.size === 0) return;

    // Sort IDs by flat order for consistent processing
    const ids = flattenedNodes
      .filter((fn) => currentSelectedIds.has(fn.node.id))
      .map((fn) => fn.node.id);

    // Map toolbar type to target type and list style
    type ListStyle = 'unordered' | 'numbered' | 'lettered';
    let targetType: 'heading' | 'content' | 'list' | 'footnote';
    let listStyle: ListStyle | undefined;

    switch (toolbarType) {
      case 'heading':
        targetType = 'heading';
        break;
      case 'content':
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

    changeNodeTypes(ids, targetType, listStyle);
  };

  const handleDownload = () => {
    downloadFile(
      JSON.stringify(document, null, 2),
      deriveJsonFilename(documentName),
      'application/json'
    );
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
    // Focus the contentEditable element after React re-renders with editingId set,
    // otherwise the container keeps focus (stolen by handleClick's containerRef.focus())
    setTimeout(() => {
      const el = blockRefs.current[id];
      if (el) {
        el.focus();
      }
    }, 0);
  };

  const handleNumberDblClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    handleNumberDoubleClick(id);
  };

  const handleUpdateNumber = (id: string, number: string | null) => {
    updateNodeNumber(id, number);
    store.setEditingNumberId(null);
  };

  const handleSetHoveredHandleId = (id: string | null) => {
    store.setHoveredHandleId(id);
  };

  const handleSetEditingId = (id: string) => {
    store.setEditingId(id);
  };

  // Ref indirection: callbacks close over changing state, so we store
  // the latest versions in a ref and wrap them in stable arrow functions.
  // The context value only changes when `language` changes (rare).
  const cbRef = useRef<Record<string, (...args: any[]) => any>>({});
  cbRef.current.handleDragStart = handleDragStart;
  cbRef.current.handleDragOver = handleDragOver;
  cbRef.current.handleDrop = handleDrop;
  cbRef.current.handleDragEnd = handleDragEnd;
  cbRef.current.handleClick = handleClick;
  cbRef.current.handleDoubleClick = handleDoubleClick;
  cbRef.current.setHoveredHandleId = handleSetHoveredHandleId;
  cbRef.current.updateNodeContents = updateNodeContents;
  cbRef.current.handleBlockKeyDown = handleBlockKeyDown;
  cbRef.current.setEditingId = handleSetEditingId;
  cbRef.current.handleNumberDblClick = handleNumberDblClick;
  cbRef.current.handleUpdateNumber = handleUpdateNumber;
  cbRef.current.handleAddNodeBefore = handleAddNodeBefore;
  cbRef.current.handleAddNodeAfter = handleAddNodeAfter;

  const callbacksCtx = useMemo(
    () => ({
      language,
      blockRefs,
      onDragStart: (e: React.DragEvent, id: string) => cbRef.current.handleDragStart(e, id),
      onDragOver: (e: React.DragEvent, id: string) => cbRef.current.handleDragOver(e, id),
      onDrop: (e: React.DragEvent) => cbRef.current.handleDrop(e),
      onDragEnd: () => cbRef.current.handleDragEnd(),
      onClick: (e: React.MouseEvent, id: string) => cbRef.current.handleClick(e, id),
      onDoubleClick: (e: React.MouseEvent, id: string) => cbRef.current.handleDoubleClick(e, id),
      onHoverHandle: (id: string | null) => cbRef.current.setHoveredHandleId(id),
      onUpdateContent: (id: string, c: string) => cbRef.current.updateNodeContents(id, c),
      onKeyDown: (e: React.KeyboardEvent, id: string) => cbRef.current.handleBlockKeyDown(e, id),
      onFocus: (id: string) => cbRef.current.setEditingId(id),
      onNumberDoubleClick: (e: React.MouseEvent, id: string) =>
        cbRef.current.handleNumberDblClick(e, id),
      onUpdateNumber: (id: string, n: string | null) => cbRef.current.handleUpdateNumber(id, n),
      onAddNodeBefore: (id: string) => cbRef.current.handleAddNodeBefore(id),
      onAddNodeAfter: (id: string) => cbRef.current.handleAddNodeAfter(id),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language]
  );

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
        <LeftPane
          pdfUrl={pdfUrl}
          document={document}
          language={language}
          onHeadingClick={handleOutlineHeadingClick}
        />
        <div
          className="flex-1 overflow-y-auto bg-white relative outline-none"
          data-testid="tree-editor-pane"
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleGlobalKeyDown}
          onClick={clearSelection}
        >
          <div className="max-w-5xl mx-auto py-12 pr-8 pl-16 pb-48">
            <div className="mb-8 pb-4 border-b border-gray-100 flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-bold mb-1">Tree Editor</h2>
                <p className="text-gray-500">
                  Click to select. Shift+Click to select range. Double-click to edit. Enter to
                  create a new node.
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
                <TreeCallbacksContext.Provider value={callbacksCtx}>
                  <TreeUIStoreContext.Provider value={store}>
                    <RecursiveTreeNode node={document} depth={0} />
                  </TreeUIStoreContext.Provider>
                </TreeCallbacksContext.Provider>
              )}
            </div>
          </div>
          <FloatingToolbar
            selectedCount={selectedCount}
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

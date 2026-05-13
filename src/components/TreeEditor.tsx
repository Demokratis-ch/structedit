import { Plus } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useActiveTextSelection } from '../hooks/useActiveTextSelection';
import type { TreeEditorHandle } from '../hooks/useTreeEditor';
import type { Language, NodeFormat } from '../types/document';
import { type InlineMark, isMarkActive, toggleMark } from '../utils/inline-mark';
import { FloatingToolbar, FORMATS_WITH_MARKS } from './FloatingToolbar';
import { RecursiveTreeNode } from './RecursiveTreeNode';
import { TreeCallbacksContext, TreeUIStoreContext } from './TreeNodeContext';

const ALL_MARKS: readonly InlineMark[] = ['bold', 'italic', 'strike', 'sup', 'sub'];

// Native value setter for HTMLInputElement — required to mutate a React-managed
// input's value while still firing React's synthetic onChange. Falls back to
// direct assignment for environments without a descriptor.
const INPUT_VALUE_SETTER = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
)?.set;
function setInputValue(el: HTMLInputElement, value: string) {
  if (INPUT_VALUE_SETTER) INPUT_VALUE_SETTER.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

interface TreeEditorProps {
  editor: TreeEditorHandle;
  language: Language;
  onScrollToNode?: (scrollFn: (nodeId: string) => void) => void;
}

/** Check whether the collapsed cursor is at the start or end of `el`. */
const isCursorAtBoundary = (el: HTMLElement, boundary: 'start' | 'end') => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const testRange = range.cloneRange();
  testRange.selectNodeContents(el);
  if (boundary === 'start') {
    testRange.setEnd(range.endContainer, range.endOffset);
  } else {
    testRange.setStart(range.endContainer, range.endOffset);
  }
  return testRange.toString().trim().length === 0;
};

const isCursorAtStart = (el: HTMLElement) => isCursorAtBoundary(el, 'start');
const isCursorAtEnd = (el: HTMLElement) => isCursorAtBoundary(el, 'end');

export function TreeEditor({ editor, language, onScrollToNode }: TreeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  // Expose scroll-to-node capability to parent via callback registration
  const scrollToNodeFn = useCallback((nodeId: string) => {
    blockRefs.current[nodeId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Register the scroll function with the parent on mount / when it changes
  useEffect(() => {
    onScrollToNode?.(scrollToNodeFn);
  }, [onScrollToNode, scrollToNodeFn]);

  const {
    document: treeDocument,
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
    changeNodeFormat,
    moveNodeById,
    indentSelected,
    outdentSelected,
    deleteSelected,
    moveSelectedToTop,
    moveSelectedToBottom,
    undo,
    redo,
    lastSelectedId,
    getReceivingParentId,
  } = editor;

  // Subscribe to aggregate store values needed at this level
  const selectedCount = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getSelectedCount(), [store])
  );
  const editingId = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getEditingId(), [store])
  );
  const editingNumberId = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getEditingNumberId(), [store])
  );
  const selectedIds = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getSelectedIds(), [store])
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

  // Format of the single selected content-bearing node, if any.
  const selectedNodeFormat = useMemo<NodeFormat | undefined>(() => {
    if (selectedCount !== 1) return undefined;
    const selectedId = Array.from(selectedIds)[0];
    const flatNode = flattenedNodes.find((fn) => fn.node.id === selectedId);
    if (!flatNode || !('format' in flatNode.node)) return undefined;
    return (flatNode.node as { format: NodeFormat }).format;
  }, [selectedCount, selectedIds, flattenedNodes]);

  const handleChangeFormat = (format: NodeFormat) => {
    if (selectedCount !== 1) return;
    const selectedId = Array.from(selectedIds)[0];
    if (selectedId) changeNodeFormat(selectedId, format);
  };

  const activeSelection = useActiveTextSelection();
  const inlineMarksDerived = useMemo(() => {
    // Recomputed whenever activeSelection.version bumps (selectionchange / focus).
    void activeSelection.version;
    const sel = activeSelection.get();
    if (!sel) {
      return {
        target: null as null | 'contenteditable' | 'input-number',
        format: undefined as NodeFormat | undefined,
        active: {} as Partial<Record<InlineMark, boolean>>,
      };
    }
    const target = sel.kind === 'input' ? 'input-number' : 'contenteditable';
    const format: NodeFormat = sel.kind === 'input' ? 'MARKDOWN_MINIMAL' : sel.format;
    const active: Partial<Record<InlineMark, boolean>> = {};
    for (const mark of ALL_MARKS) {
      active[mark] = isMarkActive(sel.text, sel.start, sel.end, mark);
    }
    return { target, format, active };
  }, [activeSelection]);

  // Google Docs–style keyboard shortcuts: Cmd/Ctrl+B/I/./, and Alt+Shift+5.
  // Returns the matched mark, or null if no shortcut applies.
  const matchInlineMarkShortcut = (e: KeyboardEvent): InlineMark | null => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.shiftKey && !e.altKey) {
      if (key === 'b') return 'bold';
      if (key === 'i') return 'italic';
      if (key === '.') return 'sup';
      if (key === ',') return 'sub';
    }
    // Strikethrough: Alt+Shift+5. Use `code` so non-US keyboard layouts still
    // match the digit-5 key (Alt+Shift can produce non-digit `key` values).
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'Digit5') {
      return 'strike';
    }
    return null;
  };

  const handleToggleMark = useCallback(
    (mark: InlineMark) => {
      const sel = activeSelection.get();
      if (!sel) return;
      const next = toggleMark(sel.text, sel.start, sel.end, mark);
      if (next.action === 'noop') return;
      if (sel.kind === 'input') {
        setInputValue(sel.el, next.text);
        sel.el.setSelectionRange(next.selectionStart, next.selectionEnd);
        // The number input is uncontrolled (defaultValue + onBlur). Commit the
        // change to the tree directly so a toggle doesn't get lost if the user
        // takes a non-blurring action next (e.g. undo, click another button).
        updateNodeNumber(sel.nodeId, next.text === '' ? null : next.text);
      } else {
        sel.el.textContent = next.text;
        sel.el.dispatchEvent(new Event('input', { bubbles: true }));
        const textNode = sel.el.firstChild;
        if (textNode) {
          const range = window.document.createRange();
          range.setStart(textNode, Math.min(next.selectionStart, next.text.length));
          range.setEnd(textNode, Math.min(next.selectionEnd, next.text.length));
          const winSel = window.getSelection();
          winSel?.removeAllRanges();
          winSel?.addRange(range);
        }
      }
    },
    [activeSelection, updateNodeNumber]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mark = matchInlineMarkShortcut(e);
      if (!mark) return;
      const sel = activeSelection.get();
      if (!sel) return;
      const format: NodeFormat = sel.kind === 'input' ? 'MARKDOWN_MINIMAL' : sel.format;
      if (!FORMATS_WITH_MARKS.includes(format)) return;
      e.preventDefault();
      e.stopPropagation();
      handleToggleMark(mark);
    };
    document.addEventListener('keydown', handler, { capture: true });
    return () => {
      document.removeEventListener('keydown', handler, { capture: true });
    };
  }, [activeSelection, handleToggleMark]);

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
    if (e.key === 'Enter') {
      // Sibling creation moves to the global (selected, non-editing) handler.
      // In edit mode Enter never creates a sibling; behaviour depends on the node's format.
      e.preventDefault();
      const node = flattenedNodes.find((fn) => fn.node.id === id)?.node;
      const format = node && 'format' in node ? (node as { format: NodeFormat }).format : 'TEXT';
      // TEXT and MARKDOWN_MINIMAL are single-line — Enter is a no-op. The other formats
      // accept a literal `\n`; execCommand is the only reliable cross-browser path inside
      // contentEditable, and its onInput propagates the new text via ContentBlock.
      const NEWLINE_FORMATS: NodeFormat[] = ['NEWLINES', 'MARKDOWN_INLINE', 'MARKDOWN'];
      if (NEWLINE_FORMATS.includes(format)) {
        window.document.execCommand?.('insertText', false, '\n');
      }
      return;
    }
    if (e.key === 'Backspace') {
      const node = flattenedNodes.find((fn) => fn.node.id === id);
      const content = node && 'contents' in node.node ? node.node.contents[language] || '' : '';
      if (content.trim() === '') {
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
            const r = window.document.createRange();
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

  const handleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Click inside the currently-editing node: let the browser position the
    // caret natively. Do not steal focus to the container and do not run
    // selection/state updates — Firefox in particular drops the visible caret
    // when the editing element is touched by a React re-render mid-click
    // (issue #60).
    if (store.getEditingId() === id) {
      return;
    }
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
    <div
      className="flex-1 overflow-y-auto bg-white relative outline-none @container"
      data-testid="tree-editor-pane"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleGlobalKeyDown}
      onClick={clearSelection}
    >
      <div className="max-w-5xl mx-auto py-12 pr-8 pl-16 pb-48 @max-[640px]:max-w-none @max-[640px]:pl-4 @max-[640px]:pr-2">
        <div className="mb-8 pb-4 border-b border-gray-100 flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold mb-1">Tree Editor</h2>
            <p className="text-gray-500">
              Click to select. Shift+Click to select range. Double-click to edit. Enter on a
              selected node creates a new sibling; in edit mode it inserts a newline (for
              newline-capable formats).
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
          {treeDocument.children.length === 0 ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                addNodeAfter(treeDocument.id);
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
                <RecursiveTreeNode node={treeDocument} depth={0} />
              </TreeUIStoreContext.Provider>
            </TreeCallbacksContext.Provider>
          )}
        </div>
      </div>
      <FloatingToolbar
        selectedCount={selectedCount}
        isEditing={!!editingId || !!editingNumberId}
        selectedNodeType={selectedNodeType}
        selectedNodeFormat={selectedNodeFormat}
        onUpdateType={handleBulkUpdateType}
        onChangeFormat={handleChangeFormat}
        onDelete={deleteSelected}
        onClearSelection={clearSelection}
        onMoveSelectedToTop={moveSelectedToTop}
        onMoveSelectedToBottom={moveSelectedToBottom}
        inlineMarksTarget={inlineMarksDerived.target}
        inlineMarksFormat={inlineMarksDerived.format}
        markActiveState={inlineMarksDerived.active}
        onToggleMark={handleToggleMark}
      />
    </div>
  );
}

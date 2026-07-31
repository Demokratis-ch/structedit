import { Plus } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useDragDrop } from '../hooks/useDragDrop';
import { useInlineMarks } from '../hooks/useInlineMarks';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import type { TreeEditorHandle } from '../hooks/useTreeEditor';
import {
  type ContributionMode,
  type DocumentNode,
  type Language,
  type NodeFormat,
  PROPOSABLE_TYPES,
} from '../types/document';
import type { ContributionScope, ContributionTypeFilter } from '../types/editor';
import { MOD } from '../utils/platform';
import { FloatingToolbar } from './FloatingToolbar';
import { RecursiveTreeNode } from './RecursiveTreeNode';
import { TreeCallbacksContext, TreeUIStoreContext } from './TreeNodeContext';
import { Kbd } from './ui/Kbd';

interface TreeEditorProps {
  editor: TreeEditorHandle;
  language: Language;
  onScrollToNode?: (scrollFn: (nodeId: string) => void) => void;
}

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
    addNodeAfter,
    addNodeBefore,
    updateNodeContents,
    updateNodeNumber,
    changeNodeFormat,
    changeNodeContributionMode,
    changeSubtreeContributionMode,
    moveNodeById,
    deleteSelected,
    moveSelectedToTop,
    moveSelectedToBottom,
    mergeSelected,
    canMergeIds,
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
    if (nodeType === 'HEADING') return 'HEADING';
    if (nodeType === 'CONTENT') return 'CONTENT';
    if (nodeType === 'FOOTNOTE') return 'FOOTNOTE';
    if (nodeType === 'LIST_ITEM') {
      // Check parent list style via the node's number format
      const num = flatNode.node.number;
      if (num === null || num === '•') return 'ul';
      if (/^[a-z]\.?$/i.test(num)) return 'abc';
      return 'ol';
    }
    if (nodeType === 'LIST') {
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

  // True when the current selection qualifies for the merge operation.
  // canMergeIds is order-independent (it sorts indices internally for the
  // contiguity check), so we don't need to pre-sort the ids here.
  const canMergeSelected = useMemo(() => {
    if (selectedIds.size < 2) return false;
    return canMergeIds([...selectedIds]);
  }, [selectedIds, canMergeIds]);

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

  // The contribution mode shared by the whole selection: a single mode when all selected nodes
  // agree, `'mixed'` when they differ, or `undefined` when none carry a mode. Drives the active
  // state of the mode picker.
  const selectedNodeMode = useMemo<ContributionMode | 'mixed' | undefined>(() => {
    if (selectedIds.size === 0) return undefined;
    const byId = new Map<string, DocumentNode>();
    for (const fn of flattenedNodes) byId.set(fn.node.id, fn.node);
    let seen: ContributionMode | undefined;
    let first = true;
    for (const id of selectedIds) {
      const node = byId.get(id);
      if (!node) continue;
      const mode = node.contributionMode;
      if (first) {
        seen = mode;
        first = false;
      } else if (mode !== seen) {
        return 'mixed';
      }
    }
    return seen;
  }, [selectedIds, flattenedNodes]);

  // id → node type, for resolving the selection's types (proposable gate + type-filtered apply).
  const typeById = useMemo(() => {
    const m = new Map<string, DocumentNode['type']>();
    for (const fn of flattenedNodes) m.set(fn.node.id, fn.node.type);
    return m;
  }, [flattenedNodes]);

  // Whether the selection includes at least one proposable node — gates the PROPOSAL option.
  const selectionHasProposable = useMemo<boolean>(() => {
    if (selectedIds.size === 0) return false;
    for (const id of selectedIds) {
      const t = typeById.get(id);
      if (t && (PROPOSABLE_TYPES as readonly string[]).includes(t)) return true;
    }
    return false;
  }, [selectedIds, typeById]);

  // Bulk-apply controls: scope (this node / + descendants) and an optional node-type filter.
  const [contributionScope, setContributionScope] = useState<ContributionScope>('node');
  const [contributionTypeFilter, setContributionTypeFilter] =
    useState<ContributionTypeFilter>('all');

  const handleChangeContributionMode = (mode: ContributionMode | undefined) => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const filter = contributionTypeFilter === 'all' ? undefined : contributionTypeFilter;
    if (contributionScope === 'subtree') {
      changeSubtreeContributionMode(ids, mode, filter);
    } else {
      // Node-only scope: when a type filter is set, only affect selected nodes of that type.
      const scoped = filter ? ids.filter((id) => typeById.get(id) === filter) : ids;
      changeNodeContributionMode(scoped, mode);
    }
  };

  const { inlineMarks, handleToggleMark } = useInlineMarks({ updateNodeNumber });

  const { handleDragStart, handleDragOver, handleDragEnd, handleDrop } = useDragDrop({
    store,
    moveNodeById,
    getReceivingParentId,
  });

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

  const { handleGlobalKeyDown, handleBlockKeyDown, handleBulkUpdateType } = useKeyboardShortcuts({
    editor,
    language,
    containerRef,
    blockRefs,
    canMergeSelected,
  });

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

  // After a number is committed via the keyboard (Enter), return focus to the tree
  // container so selection-mode shortcuts work right away (issue #136).
  const handleNumberSubmit = () => {
    containerRef.current?.focus();
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
  cbRef.current.handleNumberSubmit = handleNumberSubmit;
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
      onNumberSubmit: (id: string) => cbRef.current.handleNumberSubmit(id),
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
        <div className="mb-8 pb-4 border-b border-gray-100">
          <h2 className="text-2xl font-bold mb-1">Tree Editor</h2>
          <p className="text-gray-500">
            Click to select. <Kbd>Shift</Kbd>+Click to select range. Double-click or press{' '}
            <Kbd>Enter</Kbd> to edit; <Kbd>Tab</Kbd> and <Kbd>Shift+Tab</Kbd> indent and outdent.
            Finish editing with <Kbd>Esc</Kbd> or <Kbd>{MOD}Enter</Kbd>; in single-line formats{' '}
            <Kbd>Enter</Kbd> also finishes, while in newline-capable formats <Kbd>Enter</Kbd>{' '}
            inserts a line break.
          </p>
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
        selectedNodeMode={selectedNodeMode}
        selectionHasProposable={selectionHasProposable}
        onUpdateType={handleBulkUpdateType}
        onChangeFormat={handleChangeFormat}
        onChangeContributionMode={handleChangeContributionMode}
        contributionScope={contributionScope}
        onChangeContributionScope={setContributionScope}
        contributionTypeFilter={contributionTypeFilter}
        onChangeContributionTypeFilter={setContributionTypeFilter}
        onDelete={deleteSelected}
        onClearSelection={clearSelection}
        onMoveSelectedToTop={moveSelectedToTop}
        onMoveSelectedToBottom={moveSelectedToBottom}
        canMerge={canMergeSelected}
        onMerge={mergeSelected}
        inlineMarksTarget={inlineMarks.target}
        inlineMarksFormat={inlineMarks.format}
        markActiveState={inlineMarks.active}
        onToggleMark={handleToggleMark}
      />
    </div>
  );
}

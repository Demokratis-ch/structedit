import type React from 'react';
import type { Language, NodeFormat } from '../types/document';
import type { TreeEditorHandle } from './useTreeEditor';

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

interface UseKeyboardShortcutsParams {
  /** The full editor handle — the handlers touch ~13 of its operations, so we
   * consume it whole rather than threading each one as a separate param. */
  editor: TreeEditorHandle;
  language: Language;
  containerRef: React.RefObject<HTMLDivElement | null>;
  blockRefs: React.RefObject<{ [key: string]: HTMLElement | null }>;
  /** Whether the current selection qualifies for the merge operation. */
  canMergeSelected: boolean;
}

/**
 * Keyboard behavior for the tree editor: the global (selection-mode) handler,
 * the per-block (edit-mode) handler, and the bulk type-change helper they share.
 * Handlers are plain functions recreated each render so they always read fresh
 * editor/store state.
 */
export function useKeyboardShortcuts({
  editor,
  language,
  containerRef,
  blockRefs,
  canMergeSelected,
}: UseKeyboardShortcutsParams) {
  const {
    flattenedNodes,
    store,
    moveSelection,
    removeNodes,
    changeNodeTypes,
    indentSelected,
    outdentSelected,
    deleteSelected,
    mergeSelected,
    clearSelection,
    undo,
    redo,
    lastSelectedId,
    anchorId,
  } = editor;

  const handleBlockKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      // Sibling creation lives in the global (selected, non-editing) handler; stop this
      // keydown from also bubbling there. Otherwise the single-line branch below clears
      // editingId and the same event would then hit the global handler and create a
      // sibling. Same guard as the Escape branch.
      e.preventDefault();
      e.stopPropagation();
      const node = flattenedNodes.find((fn) => fn.node.id === id)?.node;
      const format = node && 'format' in node ? (node as { format: NodeFormat }).format : 'TEXT';
      // TEXT and MARKDOWN_MINIMAL are single-line — Enter submits (exit edit mode, keep the
      // node selected). The other formats
      // accept a literal `\n`; execCommand is the only reliable cross-browser path inside
      // contentEditable, and its onInput propagates the new text via ContentBlock.
      //
      // Use `insertLineBreak`, NOT `insertText '\n'`: in a pre-wrap contentEditable Chrome
      // turns an inserted '\n' into `<div>` block wrappers, and ContentBlock reads the
      // source back with `el.textContent`, which emits no '\n' for block boundaries — so
      // the newline was silently lost the instant it was typed (issue #129).
      // `insertLineBreak` inserts a real '\n' text node that `textContent` preserves.
      const NEWLINE_FORMATS: NodeFormat[] = ['NEWLINES', 'MARKDOWN_INLINE', 'MARKDOWN'];
      // Cmd/Ctrl+Enter always commits and exits — the explicit submit for multi-line formats
      // where a bare Enter inserts a newline (also honoured on single-line formats for
      // simplicity). A bare Enter submits single-line formats and inserts a break otherwise.
      const submit = e.metaKey || e.ctrlKey || !NEWLINE_FORMATS.includes(format);
      if (submit) {
        // Leave edit mode but keep the node selected and return focus to the container, so
        // the selection-mode shortcuts work immediately (issue #136). Mirrors Escape below.
        store.setEditingId(null);
        containerRef.current?.focus();
      } else {
        window.document.execCommand?.('insertLineBreak');
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
    let targetType: 'HEADING' | 'CONTENT' | 'LIST' | 'FOOTNOTE';
    let listStyle: ListStyle | undefined;

    switch (toolbarType) {
      case 'HEADING':
        targetType = 'HEADING';
        break;
      case 'CONTENT':
        targetType = 'CONTENT';
        break;
      case 'ul':
        targetType = 'LIST';
        listStyle = 'unordered';
        break;
      case 'ol':
        targetType = 'LIST';
        listStyle = 'numbered';
        break;
      case 'abc':
        targetType = 'LIST';
        listStyle = 'lettered';
        break;
      case 'FOOTNOTE':
        targetType = 'FOOTNOTE';
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
      } else if (e.key === 'Tab') {
        // Nothing to indent, but stop the browser's native focus-move, which
        // otherwise scrolls the pane (issue #101).
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(e.key === 'ArrowDown' ? 'down' : 'up', e.shiftKey);
    } else if (e.key === 'Enter' && lastSelectedId.current) {
      // Enter edit mode on the focused selected node (issue #136). Collapse to that single
      // node and edit — mirroring the double-click path (useSelection.handleNodeDoubleClick).
      // Content-bearing nodes get text edit (caret placed at the end); container nodes that
      // only carry a number (LIST / LIST_ITEM) get number edit instead.
      e.preventDefault();
      const id = lastSelectedId.current;
      const fn = flattenedNodes.find((f) => f.node.id === id);
      if (fn) {
        const isTextEdit = 'contents' in fn.node;
        store.batch(() => {
          store.setSelection(new Set([id]));
          if (isTextEdit) {
            store.setEditingNumberId(null);
            store.setEditingId(id);
          } else if ('number' in fn.node) {
            store.setEditingId(null);
            store.setEditingNumberId(id);
          }
        });
        anchorId.current = id;
        if (isTextEdit) {
          setTimeout(() => {
            const el = blockRefs.current[id];
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
      }
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
      const key = e.key.toLowerCase();
      if (key === 'm') {
        // Swallow `m` whether or not the merge runs: prevents accidental
        // fallthrough into the type-change shortcut map (where it has no entry)
        // and reserves the key for this operation.
        if (canMergeSelected) {
          e.preventDefault();
          mergeSelected();
        }
        return;
      }
      const shortcutMap: Record<string, string> = {
        h: 'HEADING',
        t: 'CONTENT',
        c: 'CONTENT',
        u: 'ul',
        o: 'ol',
        a: 'abc',
        f: 'FOOTNOTE',
      };
      const toolbarType = shortcutMap[key];
      if (toolbarType) {
        e.preventDefault();
        handleBulkUpdateType(toolbarType);
      }
    }
  };

  return { handleGlobalKeyDown, handleBlockKeyDown, handleBulkUpdateType };
}

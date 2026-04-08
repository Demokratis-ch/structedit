import { createContext, useContext } from 'react';
import type { Language } from '../types/document';

/**
 * Stable context for callbacks and rarely-changing refs.
 * RecursiveTreeNode reads from this — since the value never changes,
 * useContext here does NOT bypass React.memo.
 */
export interface TreeCallbacksContextValue {
  language: Language;
  blockRefs: React.MutableRefObject<{ [key: string]: HTMLElement | null }>;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: (e: React.MouseEvent, id: string) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
  onHoverHandle: (id: string | null) => void;
  onUpdateContent: (id: string, content: string) => void;
  onKeyDown: (e: React.KeyboardEvent, id: string) => void;
  onFocus: (id: string) => void;
  onNumberDoubleClick: (e: React.MouseEvent, id: string) => void;
  onUpdateNumber: (id: string, number: string | null) => void;
  onAddNodeBefore: (id: string) => void;
  onAddNodeAfter: (id: string) => void;
}

/**
 * Frequently-changing state context. Only TreeNodeBridge reads from this.
 * RecursiveTreeNode must NEVER use this context directly.
 */
export interface TreeStateContextValue {
  selectedIds: Set<string>;
  editingId: string | null;
  editingNumberId: string | null;
  draggedNodeId: string | null;
  dropTarget: { id: string; position: 'top' | 'bottom' } | null;
  receivingParentId: string | null;
  hoveredHandleId: string | null;
}

export const TreeCallbacksContext = createContext<TreeCallbacksContextValue>(null!);
export const TreeStateContext = createContext<TreeStateContextValue>(null!);

export const useTreeCallbacks = () => useContext(TreeCallbacksContext);
export const useTreeState = () => useContext(TreeStateContext);

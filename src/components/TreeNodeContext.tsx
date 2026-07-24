import type React from 'react';
import { createContext, useContext } from 'react';
import type { TreeUIStore } from '../stores/TreeUIStore';
import type { Language } from '../types/document';

/**
 * Stable context for callbacks and rarely-changing refs.
 * RecursiveTreeNode reads from this — since the value only changes
 * when `language` changes, useContext here does NOT bypass React.memo.
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
  onNumberSubmit: (id: string) => void;
  onAddNodeBefore: (id: string) => void;
  onAddNodeAfter: (id: string) => void;
  onAddOption: (questionId: string) => void;
  onRemoveOption: (optionId: string) => void;
}

export const TreeCallbacksContext = createContext<TreeCallbacksContextValue>(null!);

/**
 * Stable context holding the TreeUIStore instance.
 * The store reference never changes — individual nodes subscribe
 * to their own state via useSyncExternalStore in useNodeState().
 */
export const TreeUIStoreContext = createContext<TreeUIStore>(null!);

export const useTreeCallbacks = () => useContext(TreeCallbacksContext);
export const useTreeUIStore = () => useContext(TreeUIStoreContext);

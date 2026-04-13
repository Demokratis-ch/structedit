import { useCallback, useSyncExternalStore } from 'react';
import type { TreeUIStore } from '../stores/TreeUIStore';

export function useNodeState(store: TreeUIStore, id: string) {
  const subscribe = store.subscribe;

  const isSelected = useSyncExternalStore(
    subscribe,
    useCallback(() => store.isSelected(id), [store, id])
  );
  const isEditing = useSyncExternalStore(
    subscribe,
    useCallback(() => store.isEditing(id), [store, id])
  );
  const isEditingNumber = useSyncExternalStore(
    subscribe,
    useCallback(() => store.isEditingNumber(id), [store, id])
  );
  const isDragging = useSyncExternalStore(
    subscribe,
    useCallback(() => store.isDragging(id), [store, id])
  );
  const isDropTarget = useSyncExternalStore(
    subscribe,
    useCallback(() => store.isDropTarget(id), [store, id])
  );
  const dropPosition = useSyncExternalStore(
    subscribe,
    useCallback(() => store.getDropPosition(id), [store, id])
  );
  const isHoveredHandle = useSyncExternalStore(
    subscribe,
    useCallback(() => store.isHoveredHandle(id), [store, id])
  );
  const isReceivingParent = useSyncExternalStore(
    subscribe,
    useCallback(() => store.isReceivingParent(id), [store, id])
  );
  const isInvalidDrop = useSyncExternalStore(
    subscribe,
    useCallback(() => store.isInvalidDrop(id), [store, id])
  );

  return {
    isSelected,
    isEditing,
    isEditingNumber,
    isDragging,
    isDropTarget,
    dropPosition,
    isHoveredHandle,
    isReceivingParent,
    isInvalidDrop,
  };
}

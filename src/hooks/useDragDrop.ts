import type React from 'react';
import type { TreeUIStore } from '../stores/TreeUIStore';

interface UseDragDropParams {
  store: TreeUIStore;
  /** Reparent/reorder the dragged node relative to a target node. */
  moveNodeById: (draggedId: string, targetId: string, position: 'top' | 'bottom') => void;
  /** Resolve the parent the dragged node would land under, for visual feedback. */
  getReceivingParentId: (draggedId: string, targetId: string) => string | null;
}

/**
 * Drag-and-drop handlers for tree nodes. Tracks the dragged node, the hovered
 * drop target (top/bottom half of the target row), and the receiving parent in
 * the non-reactive {@link TreeUIStore}; performs the move on drop.
 */
export function useDragDrop({ store, moveNodeById, getReceivingParentId }: UseDragDropParams) {
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

  return { handleDragStart, handleDragOver, handleDragEnd, handleDrop };
}

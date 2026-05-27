import { renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { TreeUIStore } from '../stores/TreeUIStore';
import { useDragDrop } from './useDragDrop';

/** Minimal stand-in for a React.DragEvent — only the fields the handlers read. */
const makeDragEvent = (
  opts: { clientY?: number; rect?: { top: number; height: number } } = {}
): React.DragEvent => {
  const rect = opts.rect ?? { top: 0, height: 100 };
  return {
    preventDefault: vi.fn(),
    clientY: opts.clientY ?? 0,
    dataTransfer: { effectAllowed: '' } as unknown as DataTransfer,
    currentTarget: {
      getBoundingClientRect: () => rect as DOMRect,
    } as HTMLElement,
  } as unknown as React.DragEvent;
};

const setup = () => {
  const store = new TreeUIStore();
  const moveNodeById = vi.fn();
  const getReceivingParentId = vi.fn().mockReturnValue('parent-1');
  const { result } = renderHook(() => useDragDrop({ store, moveNodeById, getReceivingParentId }));
  return { store, moveNodeById, getReceivingParentId, result };
};

describe('useDragDrop', () => {
  test('handleDragStart records the dragged node and sets the move effect', () => {
    const { store, result } = setup();
    const e = makeDragEvent();

    result.current.handleDragStart(e, 'a');

    expect(store.getDraggedNodeId()).toBe('a');
    expect(e.dataTransfer.effectAllowed).toBe('move');
  });

  test('handleDragOver sets a drop target and computes the receiving parent', () => {
    const { store, getReceivingParentId, result } = setup();
    result.current.handleDragStart(makeDragEvent(), 'a');

    // clientY in the bottom half of the target → position 'bottom'.
    const e = makeDragEvent({ clientY: 80, rect: { top: 0, height: 100 } });
    result.current.handleDragOver(e, 'b');

    expect(e.preventDefault).toHaveBeenCalled();
    expect(store.getDropTarget()).toEqual({ id: 'b', position: 'bottom' });
    expect(getReceivingParentId).toHaveBeenCalledWith('a', 'b');
    expect(store.getReceivingParentId()).toBe('parent-1');
  });

  test('handleDragOver in the top half of the target picks position "top"', () => {
    const { store, result } = setup();
    result.current.handleDragStart(makeDragEvent(), 'a');

    const e = makeDragEvent({ clientY: 10, rect: { top: 0, height: 100 } });
    result.current.handleDragOver(e, 'b');

    expect(store.getDropTarget()).toEqual({ id: 'b', position: 'top' });
  });

  test('handleDragOver over the dragged node itself is a no-op', () => {
    const { store, getReceivingParentId, result } = setup();
    result.current.handleDragStart(makeDragEvent(), 'a');

    result.current.handleDragOver(makeDragEvent(), 'a');

    expect(store.getDropTarget()).toBeNull();
    expect(getReceivingParentId).not.toHaveBeenCalled();
  });

  test('handleDragEnd clears all drag-related state', () => {
    const { store, result } = setup();
    result.current.handleDragStart(makeDragEvent(), 'a');
    result.current.handleDragOver(makeDragEvent(), 'b');
    store.setHoveredHandleId('a');

    result.current.handleDragEnd();

    expect(store.getDraggedNodeId()).toBeNull();
    expect(store.getDropTarget()).toBeNull();
    expect(store.getHoveredHandleId()).toBeNull();
    expect(store.getReceivingParentId()).toBeNull();
  });

  test('handleDrop moves the dragged node to the drop target, then clears state', () => {
    const { store, moveNodeById, result } = setup();
    result.current.handleDragStart(makeDragEvent(), 'a');
    result.current.handleDragOver(makeDragEvent({ clientY: 80 }), 'b');

    result.current.handleDrop(makeDragEvent());

    expect(moveNodeById).toHaveBeenCalledWith('a', 'b', 'bottom');
    expect(store.getDraggedNodeId()).toBeNull();
    expect(store.getDropTarget()).toBeNull();
  });

  test('handleDrop with nothing dragged does not move anything', () => {
    const { moveNodeById, result } = setup();

    result.current.handleDrop(makeDragEvent());

    expect(moveNodeById).not.toHaveBeenCalled();
  });
});

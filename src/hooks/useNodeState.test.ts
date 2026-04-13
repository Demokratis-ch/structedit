import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TreeUIStore } from '../stores/TreeUIStore';
import { useNodeState } from './useNodeState';

describe('useNodeState', () => {
  it('returns initial state for a node', () => {
    const store = new TreeUIStore();
    const { result } = renderHook(() => useNodeState(store, 'node-1'));

    expect(result.current.isSelected).toBe(false);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.isDragging).toBe(false);
    expect(result.current.isDropTarget).toBe(false);
    expect(result.current.dropPosition).toBeNull();
    expect(result.current.isEditingNumber).toBe(false);
    expect(result.current.isHoveredHandle).toBe(false);
    expect(result.current.isReceivingParent).toBe(false);
    expect(result.current.isInvalidDrop).toBe(false);
  });

  it('reflects selection changes', () => {
    const store = new TreeUIStore();
    const { result } = renderHook(() => useNodeState(store, 'node-1'));

    act(() => store.setSelection(new Set(['node-1'])));
    expect(result.current.isSelected).toBe(true);

    act(() => store.setSelection(new Set(['node-2'])));
    expect(result.current.isSelected).toBe(false);
  });

  it('reflects editing changes', () => {
    const store = new TreeUIStore();
    const { result } = renderHook(() => useNodeState(store, 'node-1'));

    act(() => store.setEditingId('node-1'));
    expect(result.current.isEditing).toBe(true);

    act(() => store.setEditingId(null));
    expect(result.current.isEditing).toBe(false);
  });

  it('reflects drop target with position', () => {
    const store = new TreeUIStore();
    const { result } = renderHook(() => useNodeState(store, 'node-1'));

    act(() => store.setDropTarget({ id: 'node-1', position: 'bottom' }));
    expect(result.current.isDropTarget).toBe(true);
    expect(result.current.dropPosition).toBe('bottom');

    act(() => store.setDropTarget(null));
    expect(result.current.isDropTarget).toBe(false);
    expect(result.current.dropPosition).toBeNull();
  });

  it('reflects invalid drop state', () => {
    const store = new TreeUIStore();
    const { result } = renderHook(() => useNodeState(store, 'node-1'));

    act(() => {
      store.batch(() => {
        store.setDraggedNodeId('other');
        store.setDropTarget({ id: 'node-1', position: 'top' });
        store.setReceivingParentId(null);
      });
    });
    expect(result.current.isInvalidDrop).toBe(true);

    act(() => store.setReceivingParentId('parent'));
    expect(result.current.isInvalidDrop).toBe(false);
  });

  it('different nodes get independent state', () => {
    const store = new TreeUIStore();
    const { result: r1 } = renderHook(() => useNodeState(store, 'a'));
    const { result: r2 } = renderHook(() => useNodeState(store, 'b'));

    act(() => store.setSelection(new Set(['a'])));
    expect(r1.current.isSelected).toBe(true);
    expect(r2.current.isSelected).toBe(false);
  });
});

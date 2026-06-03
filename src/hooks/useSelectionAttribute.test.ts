import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TreeUIStore } from '../stores/TreeUIStore';
import { useSelectionAttribute } from './useSelectionAttribute';

function setup(id: string, store: TreeUIStore = new TreeUIStore()) {
  const el = document.createElement('div');
  const renderSpy = vi.fn();
  const { rerender, unmount } = renderHook(() => {
    const ref = useRef(el);
    renderSpy();
    useSelectionAttribute(store, id, ref);
  });
  return { el, store, renderSpy, rerender, unmount };
}

describe('useSelectionAttribute', () => {
  it('sets data-selected="false" initially when the node is not selected', () => {
    const { el } = setup('node-1');
    expect(el.dataset.selected).toBe('false');
  });

  it('sets data-selected="true" initially when the node is already selected before mount', () => {
    const store = new TreeUIStore();
    store.setSelection(new Set(['node-1']));
    const { el } = setup('node-1', store);
    expect(el.dataset.selected).toBe('true');
  });

  it('updates data-selected to "true" when the node is added to the selection', () => {
    const { el, store } = setup('node-1');
    expect(el.dataset.selected).toBe('false');
    act(() => store.setSelection(new Set(['node-1'])));
    expect(el.dataset.selected).toBe('true');
  });

  it('updates data-selected to "false" when the node is removed from the selection', () => {
    const store = new TreeUIStore();
    store.setSelection(new Set(['node-1']));
    const { el } = setup('node-1', store);
    expect(el.dataset.selected).toBe('true');
    act(() => store.setSelection(new Set()));
    expect(el.dataset.selected).toBe('false');
  });

  it('does not cause a React re-render when selection changes', () => {
    const { renderSpy, store } = setup('node-1');
    // Initial render
    expect(renderSpy).toHaveBeenCalledTimes(1);
    act(() => store.setSelection(new Set(['node-1'])));
    act(() => store.setSelection(new Set()));
    act(() => store.setSelection(new Set(['node-1', 'other'])));
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from the store on unmount', () => {
    const store = new TreeUIStore();
    const unsub = vi.fn();
    vi.spyOn(store, 'subscribe').mockReturnValue(unsub);
    const { unmount } = renderHook(() => {
      const ref = useRef(document.createElement('div'));
      useSelectionAttribute(store, 'node-1', ref);
    });
    expect(unsub).not.toHaveBeenCalled();
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('does not flip data-selected for unrelated store changes', () => {
    const { el, store } = setup('node-1');
    expect(el.dataset.selected).toBe('false');
    act(() => store.setEditingId('node-1'));
    expect(el.dataset.selected).toBe('false');
    act(() => store.setDropTarget({ id: 'node-1', position: 'top' }));
    expect(el.dataset.selected).toBe('false');
    act(() => store.setSelection(new Set(['node-1'])));
    expect(el.dataset.selected).toBe('true');
  });
});

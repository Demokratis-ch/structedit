import { describe, expect, it, vi } from 'vitest';
import { TreeUIStore } from './TreeUIStore';

describe('TreeUIStore', () => {
  describe('subscription', () => {
    it('notifies listeners on state change', () => {
      const store = new TreeUIStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.setSelection(new Set(['a']));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('returns unsubscribe function', () => {
      const store = new TreeUIStore();
      const listener = vi.fn();
      const unsub = store.subscribe(listener);

      unsub();
      store.setSelection(new Set(['a']));
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', () => {
      const store = new TreeUIStore();
      const l1 = vi.fn();
      const l2 = vi.fn();
      store.subscribe(l1);
      store.subscribe(l2);

      store.setSelection(new Set(['a']));
      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });
  });

  describe('selection', () => {
    it('starts with empty selection', () => {
      const store = new TreeUIStore();
      expect(store.isSelected('a')).toBe(false);
      expect(store.getSelectedIds().size).toBe(0);
    });

    it('setSelection updates selected state', () => {
      const store = new TreeUIStore();
      store.setSelection(new Set(['a', 'b']));

      expect(store.isSelected('a')).toBe(true);
      expect(store.isSelected('b')).toBe(true);
      expect(store.isSelected('c')).toBe(false);
    });

    it('setSelection replaces previous selection', () => {
      const store = new TreeUIStore();
      store.setSelection(new Set(['a']));
      store.setSelection(new Set(['b']));

      expect(store.isSelected('a')).toBe(false);
      expect(store.isSelected('b')).toBe(true);
    });

    it('getSelectedIds returns current set', () => {
      const store = new TreeUIStore();
      const ids = new Set(['x', 'y']);
      store.setSelection(ids);

      expect(store.getSelectedIds()).toEqual(new Set(['x', 'y']));
    });

    it('getSelectedCount returns count', () => {
      const store = new TreeUIStore();
      store.setSelection(new Set(['a', 'b', 'c']));
      expect(store.getSelectedCount()).toBe(3);
    });
  });

  describe('editingId', () => {
    it('starts as null', () => {
      const store = new TreeUIStore();
      expect(store.isEditing('a')).toBe(false);
      expect(store.getEditingId()).toBeNull();
    });

    it('setEditingId updates editing state', () => {
      const store = new TreeUIStore();
      store.setEditingId('a');

      expect(store.isEditing('a')).toBe(true);
      expect(store.isEditing('b')).toBe(false);
      expect(store.getEditingId()).toBe('a');
    });

    it('setEditingId(null) clears editing', () => {
      const store = new TreeUIStore();
      store.setEditingId('a');
      store.setEditingId(null);

      expect(store.isEditing('a')).toBe(false);
      expect(store.getEditingId()).toBeNull();
    });
  });

  describe('editingNumberId', () => {
    it('starts as null', () => {
      const store = new TreeUIStore();
      expect(store.isEditingNumber('a')).toBe(false);
      expect(store.getEditingNumberId()).toBeNull();
    });

    it('setEditingNumberId updates state', () => {
      const store = new TreeUIStore();
      store.setEditingNumberId('a');

      expect(store.isEditingNumber('a')).toBe(true);
      expect(store.isEditingNumber('b')).toBe(false);
    });
  });

  describe('draggedNodeId', () => {
    it('starts as null', () => {
      const store = new TreeUIStore();
      expect(store.isDragging('a')).toBe(false);
      expect(store.getDraggedNodeId()).toBeNull();
    });

    it('setDraggedNodeId updates state', () => {
      const store = new TreeUIStore();
      store.setDraggedNodeId('a');

      expect(store.isDragging('a')).toBe(true);
      expect(store.isDragging('b')).toBe(false);
      expect(store.getDraggedNodeId()).toBe('a');
    });
  });

  describe('dropTarget', () => {
    it('starts as null', () => {
      const store = new TreeUIStore();
      expect(store.isDropTarget('a')).toBe(false);
      expect(store.getDropPosition('a')).toBeNull();
      expect(store.getDropTarget()).toBeNull();
    });

    it('setDropTarget updates state', () => {
      const store = new TreeUIStore();
      store.setDropTarget({ id: 'a', position: 'top' });

      expect(store.isDropTarget('a')).toBe(true);
      expect(store.isDropTarget('b')).toBe(false);
      expect(store.getDropPosition('a')).toBe('top');
      expect(store.getDropPosition('b')).toBeNull();
    });

    it('setDropTarget(null) clears', () => {
      const store = new TreeUIStore();
      store.setDropTarget({ id: 'a', position: 'bottom' });
      store.setDropTarget(null);

      expect(store.isDropTarget('a')).toBe(false);
    });
  });

  describe('receivingParentId', () => {
    it('starts as null', () => {
      const store = new TreeUIStore();
      expect(store.isReceivingParent('a')).toBe(false);
    });

    it('setReceivingParentId updates state', () => {
      const store = new TreeUIStore();
      store.setReceivingParentId('a');

      expect(store.isReceivingParent('a')).toBe(true);
      expect(store.isReceivingParent('b')).toBe(false);
    });
  });

  describe('hoveredHandleId', () => {
    it('starts as null', () => {
      const store = new TreeUIStore();
      expect(store.isHoveredHandle('a')).toBe(false);
    });

    it('setHoveredHandleId updates state', () => {
      const store = new TreeUIStore();
      store.setHoveredHandleId('a');

      expect(store.isHoveredHandle('a')).toBe(true);
      expect(store.isHoveredHandle('b')).toBe(false);
    });
  });

  describe('isInvalidDrop', () => {
    it('returns false when no drop target', () => {
      const store = new TreeUIStore();
      expect(store.isInvalidDrop('a')).toBe(false);
    });

    it('returns false when drop target but has receiving parent', () => {
      const store = new TreeUIStore();
      store.setDraggedNodeId('x');
      store.setDropTarget({ id: 'a', position: 'top' });
      store.setReceivingParentId('parent');

      expect(store.isInvalidDrop('a')).toBe(false);
    });

    it('returns true when drop target, dragging, but no receiving parent', () => {
      const store = new TreeUIStore();
      store.setDraggedNodeId('x');
      store.setDropTarget({ id: 'a', position: 'top' });
      store.setReceivingParentId(null);

      expect(store.isInvalidDrop('a')).toBe(true);
    });

    it('returns false for non-target nodes', () => {
      const store = new TreeUIStore();
      store.setDraggedNodeId('x');
      store.setDropTarget({ id: 'a', position: 'top' });
      store.setReceivingParentId(null);

      expect(store.isInvalidDrop('b')).toBe(false);
    });
  });

  describe('batch updates', () => {
    it('batch only notifies once', () => {
      const store = new TreeUIStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.batch(() => {
        store.setSelection(new Set(['a']));
        store.setEditingId('a');
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.isSelected('a')).toBe(true);
      expect(store.isEditing('a')).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('resets all state', () => {
      const store = new TreeUIStore();
      store.setSelection(new Set(['a']));
      store.setEditingId('b');
      store.setEditingNumberId('c');
      store.setDraggedNodeId('d');
      store.setDropTarget({ id: 'e', position: 'top' });
      store.setReceivingParentId('f');
      store.setHoveredHandleId('g');

      store.clearAll();

      expect(store.getSelectedIds().size).toBe(0);
      expect(store.getEditingId()).toBeNull();
      expect(store.getEditingNumberId()).toBeNull();
      expect(store.getDraggedNodeId()).toBeNull();
      expect(store.getDropTarget()).toBeNull();
      expect(store.isReceivingParent('f')).toBe(false);
      expect(store.isHoveredHandle('g')).toBe(false);
    });
  });
});

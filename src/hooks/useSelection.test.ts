import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { TreeUIStore } from '../stores/TreeUIStore';
import type { DocumentRootNode } from '../types/document';
import type { FlattenedNode } from '../types/editor';
import { flattenForRendering } from '../utils/tree-utils';
import { useSelection } from './useSelection';

const createTestDocument = (): DocumentRootNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [
        {
          id: 'p1',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'First paragraph' },
          children: [],
        },
        {
          id: 'p2',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'Second paragraph' },
          children: [],
        },
      ],
    },
    {
      id: 'h2',
      number: '2',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Second Heading' },
      children: [],
    },
  ],
});

// Flat order of the test document: h1, p1, p2, h2.

interface Harness {
  store: TreeUIStore;
  flattenedNodes: FlattenedNode[];
  nodeIdToFlatIndex: Map<string, number>;
}

const createHarness = (doc: DocumentRootNode = createTestDocument()): Harness => {
  const store = new TreeUIStore();
  const flattenedNodes = flattenForRendering(doc);
  const nodeIdToFlatIndex = new Map<string, number>();
  flattenedNodes.forEach((fn, idx) => {
    nodeIdToFlatIndex.set(fn.node.id, idx);
  });
  return { store, flattenedNodes, nodeIdToFlatIndex };
};

describe('useSelection', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  const render = () => renderHook(() => useSelection(harness));

  test('single click selects one node and sets anchor + lastSelected', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });

    expect([...harness.store.getSelectedIds()]).toEqual(['p1']);
    expect(result.current.anchorId.current).toBe('p1');
    expect(result.current.lastSelectedId.current).toBe('p1');
  });

  test('ctrl-click toggles a node into and out of the selection', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: false, ctrlKey: true, metaKey: false });
    });

    expect(harness.store.getSelectedIds().size).toBe(2);
    expect(harness.store.getSelectedIds().has('p1')).toBe(true);
    expect(harness.store.getSelectedIds().has('p2')).toBe(true);

    // Ctrl-click p1 again removes it.
    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: true, metaKey: false });
    });

    expect([...harness.store.getSelectedIds()]).toEqual(['p2']);
  });

  test('meta-click toggles a node into the selection', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: false, ctrlKey: false, metaKey: true });
    });

    expect(harness.store.getSelectedIds().size).toBe(2);
    expect(harness.store.getSelectedIds().has('p2')).toBe(true);
  });

  test('shift-click selects the flat range between anchor and target', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('h1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: true, ctrlKey: false, metaKey: false });
    });

    expect([...harness.store.getSelectedIds()].sort()).toEqual(['h1', 'p1', 'p2']);
    expect(result.current.lastSelectedId.current).toBe('p2');
    // Anchor is unchanged by shift-click.
    expect(result.current.anchorId.current).toBe('h1');
  });

  test('shift-click with no anchor falls back to single selection', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: true, ctrlKey: false, metaKey: false });
    });

    expect([...harness.store.getSelectedIds()]).toEqual(['p2']);
    expect(result.current.anchorId.current).toBe('p2');
  });

  test('moveSelection down from empty selection seeds the first node', () => {
    const { result } = render();

    act(() => {
      result.current.moveSelection('down', false);
    });

    expect([...harness.store.getSelectedIds()]).toEqual(['h1']);
    expect(result.current.anchorId.current).toBe('h1');
  });

  test('moveSelection up from empty selection seeds the last node', () => {
    const { result } = render();

    act(() => {
      result.current.moveSelection('up', false);
    });

    expect([...harness.store.getSelectedIds()]).toEqual(['h2']);
  });

  test('moveSelection without extend collapses to a single node and resets anchor', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('h1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.moveSelection('down', false);
    });

    expect([...harness.store.getSelectedIds()]).toEqual(['p1']);
    expect(result.current.anchorId.current).toBe('p1');
    expect(result.current.lastSelectedId.current).toBe('p1');
  });

  test('moveSelection with extend grows the range from the anchor', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('h1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.moveSelection('down', true);
    });
    act(() => {
      result.current.moveSelection('down', true);
    });

    expect([...harness.store.getSelectedIds()].sort()).toEqual(['h1', 'p1', 'p2']);
    // Anchor stays put while extending.
    expect(result.current.anchorId.current).toBe('h1');
    expect(result.current.lastSelectedId.current).toBe('p2');
  });

  test('moveSelection no-ops at the bottom boundary', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('h2', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.moveSelection('down', false);
    });

    expect([...harness.store.getSelectedIds()]).toEqual(['h2']);
  });

  test('moveSelection no-ops at the top boundary', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeClick('h1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.moveSelection('up', false);
    });

    expect([...harness.store.getSelectedIds()]).toEqual(['h1']);
  });

  test('moveSelection no-ops when lastSelectedId points at a node no longer in the tree', () => {
    const { result } = render();

    // Simulate a stale ref left behind after the selected node was removed.
    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
      result.current.lastSelectedId.current = 'gone';
    });
    act(() => {
      result.current.moveSelection('down', false);
    });

    // Selection is untouched: the guard for an unknown current index bails early.
    expect([...harness.store.getSelectedIds()]).toEqual(['p1']);
  });

  test('clearSelection empties selection and nulls both refs + editing ids', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeDoubleClick('p1');
    });
    expect(harness.store.getEditingId()).toBe('p1');

    act(() => {
      result.current.clearSelection();
    });

    expect(harness.store.getSelectedIds().size).toBe(0);
    expect(harness.store.getEditingId()).toBeNull();
    expect(harness.store.getEditingNumberId()).toBeNull();
    expect(result.current.anchorId.current).toBeNull();
    expect(result.current.lastSelectedId.current).toBeNull();
  });

  test('handleNodeDoubleClick enters content edit mode and sets refs', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeDoubleClick('p1');
    });

    expect(harness.store.getEditingId()).toBe('p1');
    expect(harness.store.getEditingNumberId()).toBeNull();
    expect(harness.store.getSelectedIds().has('p1')).toBe(true);
    expect(result.current.anchorId.current).toBe('p1');
    expect(result.current.lastSelectedId.current).toBe('p1');
  });

  test('handleNumberDoubleClick enters number edit mode and clears editingId', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeDoubleClick('p1');
    });
    expect(harness.store.getEditingId()).toBe('p1');

    act(() => {
      result.current.handleNumberDoubleClick('h1');
    });

    expect(harness.store.getEditingNumberId()).toBe('h1');
    expect(harness.store.getEditingId()).toBeNull();
    expect(harness.store.getSelectedIds().has('h1')).toBe(true);
    expect(result.current.anchorId.current).toBe('h1');
    expect(result.current.lastSelectedId.current).toBe('h1');
  });

  test('clicking a different node while editing clears editing mode', () => {
    const { result } = render();

    act(() => {
      result.current.handleNodeDoubleClick('p1');
    });
    expect(harness.store.getEditingId()).toBe('p1');

    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: false, ctrlKey: false, metaKey: false });
    });

    expect(harness.store.getEditingId()).toBeNull();
    expect([...harness.store.getSelectedIds()]).toEqual(['p2']);
  });
});

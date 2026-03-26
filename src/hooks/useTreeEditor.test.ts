import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type {
  ContainerDocumentNode,
  HeadingDocumentNode,
  LeafDocumentNode,
} from '../types/document';
import { useTreeEditor } from './useTreeEditor';

const createTestDocument = (): ContainerDocumentNode => ({
  id: 'root',
  number: null,
  type: 'document',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'heading',
      contents: { de: 'First Heading' },
      children: [
        {
          id: 'p1',
          number: null,
          type: 'content',
          contents: { de: 'First paragraph' },
          children: [],
        },
        {
          id: 'p2',
          number: null,
          type: 'content',
          contents: { de: 'Second paragraph' },
          children: [],
        },
      ],
    },
    {
      id: 'h2',
      number: '2',
      type: 'heading',
      contents: { de: 'Second Heading' },
      children: [],
    },
  ],
});

describe('useTreeEditor', () => {
  test('initializes with document', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    expect(result.current.document.id).toBe('root');
    expect(result.current.document.children.length).toBe(2);
  });

  test('selection starts empty', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.editingId).toBeNull();
  });

  test('handleNodeClick selects single node', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });

    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has('p1')).toBe(true);
  });

  test('handleNodeClick with ctrl/meta toggles selection', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    // Select first node
    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });

    // Ctrl+click second node - should add to selection
    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: false, ctrlKey: true, metaKey: false });
    });

    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.selectedIds.has('p1')).toBe(true);
    expect(result.current.selectedIds.has('p2')).toBe(true);

    // Ctrl+click p1 again - should remove from selection
    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: true, metaKey: false });
    });

    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has('p1')).toBe(false);
    expect(result.current.selectedIds.has('p2')).toBe(true);
  });

  test('handleNodeClick with shift selects range', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    // Select first node (anchor)
    act(() => {
      result.current.handleNodeClick('h1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });

    // Shift+click to p2 - should select range
    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: true, ctrlKey: false, metaKey: false });
    });

    // Should select h1, p1, p2 (all nodes in flat order between anchor and target)
    expect(result.current.selectedIds.size).toBe(3);
    expect(result.current.selectedIds.has('h1')).toBe(true);
    expect(result.current.selectedIds.has('p1')).toBe(true);
    expect(result.current.selectedIds.has('p2')).toBe(true);
  });

  test('handleNodeDoubleClick enters edit mode', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    act(() => {
      result.current.handleNodeDoubleClick('p1');
    });

    expect(result.current.editingId).toBe('p1');
    expect(result.current.selectedIds.has('p1')).toBe(true);
  });

  test('clearSelection clears all selection', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    // Select some nodes
    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: false, ctrlKey: true, metaKey: false });
    });

    expect(result.current.selectedIds.size).toBe(2);

    // Clear selection
    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedIds.size).toBe(0);
  });

  test('setEditingId sets and clears edit mode', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    act(() => {
      result.current.setEditingId('p1');
    });

    expect(result.current.editingId).toBe('p1');

    act(() => {
      result.current.setEditingId(null);
    });

    expect(result.current.editingId).toBeNull();
  });

  test('integrates operations with history', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    // Make a change via operations
    act(() => {
      result.current.updateNodeContents('p1', 'Updated content');
    });

    const h1 = result.current.document.children[0] as HeadingDocumentNode;
    const p1 = h1.children[0] as LeafDocumentNode;
    expect(p1.contents.de).toBe('Updated content');

    // Should be able to undo
    expect(result.current.canUndo).toBe(true);
  });

  test('flattenedNodes provides correct flattened view', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    // Should flatten all nodes except root
    // h1, p1, p2, h2 = 4 nodes
    expect(result.current.flattenedNodes.length).toBe(4);
    expect(result.current.flattenedNodes[0].node.id).toBe('h1');
    expect(result.current.flattenedNodes[1].node.id).toBe('p1');
    expect(result.current.flattenedNodes[2].node.id).toBe('p2');
    expect(result.current.flattenedNodes[3].node.id).toBe('h2');
  });

  test('flattenedNodes updates when document changes', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    expect(result.current.flattenedNodes.length).toBe(4);

    // Remove a node
    act(() => {
      result.current.removeNodes(['p2']);
    });

    expect(result.current.flattenedNodes.length).toBe(3);
  });

  test('exposes nodeIndex and parentIndex', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    expect(result.current.nodeIndex).toBeInstanceOf(Map);
    expect(result.current.parentIndex).toBeInstanceOf(Map);

    // Verify nodeIndex contains expected paths
    expect(result.current.nodeIndex.get('h1')).toEqual([0]);
    expect(result.current.nodeIndex.get('p1')).toEqual([0, 0]);
    expect(result.current.nodeIndex.get('p2')).toEqual([0, 1]);
    expect(result.current.nodeIndex.get('h2')).toEqual([1]);

    // Verify parentIndex contains expected parent ids
    expect(result.current.parentIndex.get('h1')).toBe('root');
    expect(result.current.parentIndex.get('p1')).toBe('h1');
    expect(result.current.parentIndex.get('h2')).toBe('root');
  });

  test('handleNumberDoubleClick sets editingNumberId and clears editingId', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    // First enter content edit mode
    act(() => {
      result.current.handleNodeDoubleClick('p1');
    });
    expect(result.current.editingId).toBe('p1');

    // Now double-click a number
    act(() => {
      result.current.handleNumberDoubleClick('h1');
    });

    expect(result.current.editingNumberId).toBe('h1');
    expect(result.current.editingId).toBeNull();
    expect(result.current.selectedIds.has('h1')).toBe(true);
  });

  test('handleNodeDoubleClick clears editingNumberId', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    // First enter number edit mode
    act(() => {
      result.current.handleNumberDoubleClick('h1');
    });
    expect(result.current.editingNumberId).toBe('h1');

    // Now double-click content
    act(() => {
      result.current.handleNodeDoubleClick('p1');
    });

    expect(result.current.editingNumberId).toBeNull();
    expect(result.current.editingId).toBe('p1');
  });

  test('clearSelection clears editingNumberId', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    act(() => {
      result.current.handleNumberDoubleClick('h1');
    });
    expect(result.current.editingNumberId).toBe('h1');

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.editingNumberId).toBeNull();
  });

  test('exposes getReceivingParentId', () => {
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    expect(typeof result.current.getReceivingParentId).toBe('function');

    // Test valid move: p2 to p1's position (parent would be h1)
    expect(result.current.getReceivingParentId('p2', 'p1')).toBe('h1');

    // Test invalid move (same source and target)
    expect(result.current.getReceivingParentId('h1', 'h1')).toBeNull();
  });

  test('indentSelected indents all selected nodes', () => {
    // Create doc: root > [h1, p1, p2]
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'document',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'heading',
          contents: { de: 'Heading' },
          children: [],
        } as HeadingDocumentNode,
        {
          id: 'p1',
          number: null,
          type: 'content',
          contents: { de: 'First' },
          children: [],
        },
        {
          id: 'p2',
          number: null,
          type: 'content',
          contents: { de: 'Second' },
          children: [],
        },
      ],
    };

    const { result } = renderHook(() => useTreeEditor(doc));

    // Select p1 and p2
    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: false, ctrlKey: true, metaKey: false });
    });

    expect(result.current.selectedIds.size).toBe(2);

    // Indent selected
    act(() => {
      result.current.indentSelected();
    });

    // Both p1 and p2 should now be children of h1
    expect(result.current.document.children.length).toBe(1);
    const h1 = result.current.document.children[0] as HeadingDocumentNode;
    expect(h1.children.length).toBe(2);
    expect(h1.children[0].id).toBe('p1');
    expect(h1.children[1].id).toBe('p2');
  });

  test('outdentSelected outdents all selected nodes', () => {
    // Use default doc: root > [h1 > [p1, p2], h2]
    const doc = createTestDocument();
    const { result } = renderHook(() => useTreeEditor(doc));

    // Select p1 and p2 (both children of h1)
    act(() => {
      result.current.handleNodeClick('p1', { shiftKey: false, ctrlKey: false, metaKey: false });
    });
    act(() => {
      result.current.handleNodeClick('p2', { shiftKey: false, ctrlKey: true, metaKey: false });
    });

    expect(result.current.selectedIds.size).toBe(2);

    // Outdent selected
    act(() => {
      result.current.outdentSelected();
    });

    // Both p1 and p2 should now be root-level siblings after h1
    expect(result.current.document.children.length).toBe(4);
    expect(result.current.document.children[0].id).toBe('h1');
    expect(result.current.document.children[1].id).toBe('p1');
    expect(result.current.document.children[2].id).toBe('p2');
    expect(result.current.document.children[3].id).toBe('h2');
  });
});

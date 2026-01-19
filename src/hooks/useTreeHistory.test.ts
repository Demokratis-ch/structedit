import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTreeHistory } from './useTreeHistory';
import type { ContainerDocumentNode, HeadingDocumentNode, LeafDocumentNode } from '../types/document';

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
        },
      ],
    },
  ],
});

describe('useTreeHistory', () => {
  test('commit updates document state', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    const newDoc: ContainerDocumentNode = {
      ...result.current.document,
      children: [],
    };

    act(() => {
      result.current.commit(newDoc);
    });

    expect(result.current.document.children.length).toBe(0);
  });

  test('commit adds to history when saveHistory is true', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    const newDoc: ContainerDocumentNode = {
      ...result.current.document,
      children: [],
    };

    act(() => {
      result.current.commit(newDoc, true);
    });

    expect(result.current.historyLength).toBe(2); // Initial + new
  });

  test('commit does not add to history when saveHistory is false', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    const newDoc: ContainerDocumentNode = {
      ...result.current.document,
      children: [],
    };

    act(() => {
      result.current.commit(newDoc, false);
    });

    // Document should change but history length stays at 1
    expect(result.current.document.children.length).toBe(0);
    expect(result.current.historyLength).toBe(1);
  });

  test('undo restores previous document state', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    // Make a change
    const newDoc: ContainerDocumentNode = {
      ...result.current.document,
      children: [],
    };

    act(() => {
      result.current.commit(newDoc, true);
    });

    expect(result.current.document.children.length).toBe(0);

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.document.children.length).toBe(1);
  });

  test('undo returns false when at beginning of history', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    let undoResult: boolean = true;
    act(() => {
      undoResult = result.current.undo();
    });

    expect(undoResult).toBe(false);
  });

  test('redo restores next document state', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    // Make a change
    const newDoc: ContainerDocumentNode = {
      ...result.current.document,
      children: [],
    };

    act(() => {
      result.current.commit(newDoc, true);
    });

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.document.children.length).toBe(1);

    // Redo
    act(() => {
      result.current.redo();
    });

    expect(result.current.document.children.length).toBe(0);
  });

  test('redo returns false when at end of history', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    let redoResult: boolean = true;
    act(() => {
      redoResult = result.current.redo();
    });

    expect(redoResult).toBe(false);
  });

  test('commit after undo truncates redo history', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    // Make two changes
    act(() => {
      result.current.commit({ ...result.current.document, id: 'changed1' }, true);
    });
    act(() => {
      result.current.commit({ ...result.current.document, id: 'changed2' }, true);
    });

    expect(result.current.historyLength).toBe(3);

    // Undo once
    act(() => {
      result.current.undo();
    });

    // Make a new change - this should truncate the redo history
    act(() => {
      result.current.commit({ ...result.current.document, id: 'changed3' }, true);
    });

    // History should be: initial, changed1, changed3 (not changed2)
    expect(result.current.historyLength).toBe(3);
    expect(result.current.document.id).toBe('changed3');

    // Redo should return false since redo history was truncated
    let redoResult: boolean = true;
    act(() => {
      redoResult = result.current.redo();
    });
    expect(redoResult).toBe(false);
  });

  test('history limited to 50 entries', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    // Make 60 changes
    for (let i = 0; i < 60; i++) {
      act(() => {
        result.current.commit({ ...result.current.document, id: `change-${i}` }, true);
      });
    }

    // History should be capped at 50
    expect(result.current.historyLength).toBeLessThanOrEqual(50);
  });

  test('nodeIndex is rebuilt after commit', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    // Initial index should have nodes
    expect(result.current.nodeIndex.get('root')).toBeDefined();
    expect(result.current.nodeIndex.get('h1')).toBeDefined();
    expect(result.current.nodeIndex.get('p1')).toBeDefined();

    // Add a new node
    const newDoc: ContainerDocumentNode = {
      ...result.current.document,
      children: [
        ...result.current.document.children,
        {
          id: 'h2',
          number: '2',
          type: 'heading',
          contents: { de: 'New Heading' },
          children: [],
        } as HeadingDocumentNode,
      ],
    };

    act(() => {
      result.current.commit(newDoc, true);
    });

    // Index should now include new node
    expect(result.current.nodeIndex.get('h2')).toBeDefined();
    expect(result.current.nodeIndex.get('h2')).toEqual([1]);
  });

  test('parentIndex is rebuilt after commit', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    // Initial parent index
    expect(result.current.parentIndex.get('h1')).toBe('root');
    expect(result.current.parentIndex.get('p1')).toBe('h1');

    // Add a new node under h1
    const h1 = result.current.document.children[0] as HeadingDocumentNode;
    const newDoc: ContainerDocumentNode = {
      ...result.current.document,
      children: [
        {
          ...h1,
          children: [
            ...h1.children,
            {
              id: 'p2',
              number: null,
              type: 'content',
              contents: { de: 'New paragraph' },
            } as LeafDocumentNode,
          ],
        },
      ],
    };

    act(() => {
      result.current.commit(newDoc, true);
    });

    // Parent index should include new node
    expect(result.current.parentIndex.get('p2')).toBe('h1');
  });

  test('canUndo and canRedo reflect current state', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    // Initially can't undo or redo
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    // Make a change
    act(() => {
      result.current.commit({ ...result.current.document, id: 'changed' }, true);
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  test('reset clears history and sets new document', () => {
    const { result } = renderHook(() => useTreeHistory(createTestDocument()));

    // Make some changes
    act(() => {
      result.current.commit({ ...result.current.document, id: 'changed1' }, true);
    });
    act(() => {
      result.current.commit({ ...result.current.document, id: 'changed2' }, true);
    });

    expect(result.current.historyLength).toBe(3);

    // Reset with new document
    const newDoc: ContainerDocumentNode = {
      id: 'new-root',
      number: null,
      type: 'document',
      children: [],
    };

    act(() => {
      result.current.reset(newDoc);
    });

    expect(result.current.document.id).toBe('new-root');
    expect(result.current.historyLength).toBe(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});

import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { useRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import type { DocumentRootNode } from '../types/document';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useTreeEditor } from './useTreeEditor';

/** Two headings, each with no children (flat order: h1, h2). */
const twoHeadings = (): DocumentRootNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'One' },
      children: [],
    },
    {
      id: 'h2',
      number: '2',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Two' },
      children: [],
    },
  ],
});

/** A heading followed by a sibling content node (for indent/outdent). */
const headingThenContent = (): DocumentRootNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Head' },
      children: [],
    },
    {
      id: 'c1',
      number: null,
      type: 'CONTENT',
      format: 'TEXT',
      contents: { de: 'Body' },
      children: [],
    },
  ],
});

const makeKbd = (init: Partial<KeyboardEvent>): React.KeyboardEvent =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  }) as unknown as React.KeyboardEvent;

const setup = (doc: DocumentRootNode, canMergeSelected = false) => {
  const { result } = renderHook(() => {
    const editor = useTreeEditor(doc, 'de');
    const containerRef = useRef<HTMLDivElement>(null);
    const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});
    const handlers = useKeyboardShortcuts({
      editor,
      language: 'de',
      containerRef,
      blockRefs,
      canMergeSelected,
    });
    return { editor, handlers };
  });
  return result;
};

const select = (
  result: ReturnType<typeof setup>,
  id: string,
  mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}
) => {
  act(() => {
    result.current.editor.handleNodeClick(id, {
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      ...mods,
    });
  });
};

describe('useKeyboardShortcuts — global handler', () => {
  test('ArrowDown with no selection selects the first node', () => {
    const result = setup(twoHeadings());

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'ArrowDown' })));

    expect([...result.current.editor.store.getSelectedIds()]).toEqual(['h1']);
  });

  test('ArrowDown with a selection moves it to the next node', () => {
    const result = setup(twoHeadings());
    select(result, 'h1');

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'ArrowDown' })));

    expect([...result.current.editor.store.getSelectedIds()]).toEqual(['h2']);
  });

  test('Enter on a selected node creates a sibling after it', () => {
    const result = setup(twoHeadings());
    select(result, 'h1');

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'Enter' })));

    expect(result.current.editor.document.children.length).toBe(3);
  });

  test('Delete removes the selected node', () => {
    const result = setup(twoHeadings());
    select(result, 'h1');

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'Delete' })));

    const ids = result.current.editor.document.children.map((c) => c.id);
    expect(ids).toEqual(['h2']);
  });

  test('the "c" shortcut converts the selected heading to content', () => {
    const result = setup(twoHeadings());
    select(result, 'h1');

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'c' })));

    expect(result.current.editor.document.children[0].type).toBe('CONTENT');
  });

  test('type shortcuts do not fire with a Ctrl/Meta modifier', () => {
    const result = setup(twoHeadings());
    select(result, 'h1');

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'c', ctrlKey: true })));

    expect(result.current.editor.document.children[0].type).toBe('HEADING');
  });

  test('"m" merges contiguous same-type siblings when merging is allowed', () => {
    const result = setup(twoHeadings(), true);
    act(() => result.current.editor.store.setSelection(new Set(['h1', 'h2'])));

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'm' })));

    expect(result.current.editor.document.children.length).toBe(1);
  });

  test('"m" is a no-op when merging is not allowed', () => {
    const result = setup(twoHeadings(), false);
    act(() => result.current.editor.store.setSelection(new Set(['h1', 'h2'])));

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'm' })));

    expect(result.current.editor.document.children.length).toBe(2);
  });

  test('Cmd+Z undoes the previous operation', () => {
    const result = setup(twoHeadings());
    select(result, 'h1');
    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'Delete' })));
    expect(result.current.editor.document.children.length).toBe(1);

    act(() => result.current.handlers.handleGlobalKeyDown(makeKbd({ key: 'z', metaKey: true })));

    expect(result.current.editor.document.children.length).toBe(2);
  });
});

describe('useKeyboardShortcuts — block handler', () => {
  test('Tab indents the selected node under its previous sibling', () => {
    const result = setup(headingThenContent());
    select(result, 'c1');

    act(() => result.current.handlers.handleBlockKeyDown(makeKbd({ key: 'Tab' }), 'c1'));

    expect(result.current.editor.document.children.length).toBe(1);
    expect(result.current.editor.document.children[0].children.length).toBe(1);
  });

  test('Shift+Tab outdents a nested node', () => {
    const nested: DocumentRootNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Head' },
          children: [
            {
              id: 'c1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            },
          ],
        },
      ],
    };
    const result = setup(nested);
    select(result, 'c1');

    act(() =>
      result.current.handlers.handleBlockKeyDown(makeKbd({ key: 'Tab', shiftKey: true }), 'c1')
    );

    expect(result.current.editor.document.children.length).toBe(2);
  });

  test('Backspace on an empty node removes it', () => {
    const doc: DocumentRootNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Head' },
          children: [],
        },
        {
          id: 'empty',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: '' },
          children: [],
        },
      ],
    };
    const result = setup(doc);
    select(result, 'empty');

    act(() => result.current.handlers.handleBlockKeyDown(makeKbd({ key: 'Backspace' }), 'empty'));

    const ids = result.current.editor.document.children.map((c) => c.id);
    expect(ids).toEqual(['h1']);
  });
});

describe('useKeyboardShortcuts — handleBulkUpdateType', () => {
  test('maps "CONTENT" to a content type change for the selection', () => {
    const result = setup(twoHeadings());
    select(result, 'h1');

    act(() => result.current.handlers.handleBulkUpdateType('CONTENT'));

    expect(result.current.editor.document.children[0].type).toBe('CONTENT');
  });

  test('an unrecognized toolbar type is a no-op', () => {
    const result = setup(twoHeadings());
    select(result, 'h1');

    act(() => result.current.handlers.handleBulkUpdateType('nonsense'));

    expect(result.current.editor.document.children[0].type).toBe('HEADING');
  });
});

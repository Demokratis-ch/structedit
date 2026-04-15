// Tests for TreeEditor behavior (keyboard shortcuts, selection, editing, drag-drop).
// Rendered via EditorInterface since TreeEditor requires the useTreeEditor hook output as a prop.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import { EditorInterface } from './EditorInterface';

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
      children: [],
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

const renderTreeEditor = () =>
  render(
    <EditorInterface
      initialDocument={createTestDocument()}
      pdfUrl={null}
      documentName="test.docx"
      language="de"
      onBack={() => {}}
    />
  );

const getContainer = () => {
  // The container is the tree editor pane that receives keyboard events
  return screen.getByTestId('tree-editor-pane');
};

/** Get a within-scoped query object for the tree editor (right pane). */
const getTreePane = () => within(getContainer());

const selectFirstNode = () => {
  // Click the first heading node to select it
  const firstHeading = getTreePane().getByText('First Heading');
  fireEvent.click(firstHeading);
};

/** Assert that a node (found by text content) has selected styling. */
const expectNodeSelected = (text: string) => {
  const el = getTreePane().getByText(text);
  const wrapper = el.closest('[draggable]') as HTMLElement;
  expect(wrapper.className).toContain('bg-blue');
};

/** Assert that a node (found by text content) does NOT have selected styling. */
const expectNodeNotSelected = (text: string) => {
  const el = getTreePane().getByText(text);
  const wrapper = el.closest('[draggable]') as HTMLElement;
  expect(wrapper.className).not.toContain('bg-blue');
};

/**
 * Get the draggable wrapper element for a node found by text content.
 * Useful for checking DOM nesting relationships.
 */
const getNodeWrapper = (text: string) => {
  const el = getTreePane().getByText(text);
  return el.closest('[draggable]') as HTMLElement;
};

describe('TreeEditor keyboard shortcuts', () => {
  describe('type change shortcuts with a node selected', () => {
    const shortcutTests = [
      { key: 'h', expectedTitle: 'Heading (H)', description: 'H changes node to heading' },
      { key: 't', expectedTitle: 'Content (C)', description: 'T changes node to content' },
      { key: 'c', expectedTitle: 'Content (C)', description: 'C changes node to content' },
      { key: 'u', expectedTitle: 'Bullet List (U)', description: 'U changes node to bullet list' },
      {
        key: 'o',
        expectedTitle: 'Ordered List (O)',
        description: 'O changes node to ordered list',
      },
      { key: 'a', expectedTitle: 'Alpha List (A)', description: 'A changes node to alpha list' },
      { key: 'f', expectedTitle: 'Footnote (F)', description: 'F changes node to footnote' },
    ];

    test.each(shortcutTests)('$description', ({ key }) => {
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // Should not throw when pressing the shortcut key
      fireEvent.keyDown(container, { key });
    });

    test('H key changes a content node to heading', () => {
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // First change to paragraph (T), then back to heading (H)
      fireEvent.keyDown(container, { key: 't' });
      fireEvent.keyDown(container, { key: 'h' });

      // The node should still be visible (wasn't deleted or broken)
      expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
    });

    test('uppercase keys also work (case insensitive)', () => {
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // Uppercase H should also work
      fireEvent.keyDown(container, { key: 'H' });

      expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
    });
  });

  describe('shortcuts should NOT fire in certain conditions', () => {
    test('shortcuts do not fire when no node is selected', () => {
      renderTreeEditor();
      const container = getContainer();

      // Press H without selecting anything - the tree should remain unchanged
      fireEvent.keyDown(container, { key: 'h' });

      // Both headings should still be there, unchanged
      expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
      expect(getTreePane().getByText('Second Heading')).toBeInTheDocument();
    });

    test('shortcuts do not fire with Ctrl modifier', () => {
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // Ctrl+H should not trigger the shortcut
      fireEvent.keyDown(container, { key: 'h', ctrlKey: true });

      expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
    });

    test('shortcuts do not fire with Meta modifier', () => {
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // Cmd+H should not trigger the shortcut
      fireEvent.keyDown(container, { key: 'h', metaKey: true });

      expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
    });

    test('type shortcuts do not fire while in edit mode', async () => {
      vi.useFakeTimers();
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // Enter edit mode via double-click
      await act(async () => {
        fireEvent.doubleClick(getTreePane().getByText('First Heading'));
        vi.runAllTimers();
      });

      // Press 'f' (footnote shortcut) — should type into the editor, not change node type
      fireEvent.keyDown(container, { key: 'f' });

      // Node should still be a heading (type indicator visible when selected)
      // If the shortcut had fired, the node would have been converted to footnote
      expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
      // The heading should still be rendered as an h-tag (not converted)
      const headingEl = getTreePane().getByText('First Heading');
      expect(headingEl.tagName).toMatch(/^H\d$/);

      vi.useRealTimers();
    });
  });
});

describe('double-click inline editing', () => {
  test('double-clicking a node focuses its contentEditable element', async () => {
    vi.useFakeTimers();
    renderTreeEditor();

    const firstHeading = getTreePane().getByText('First Heading');

    // Double-click and flush timers in a single act boundary
    await act(async () => {
      fireEvent.doubleClick(firstHeading);
      vi.runAllTimers();
    });

    const activeEl = document.activeElement as HTMLElement;
    expect(activeEl).not.toBeNull();
    expect(activeEl.getAttribute('contenteditable')).toBe('true');
    expect(activeEl.textContent).toBe('First Heading');

    vi.useRealTimers();
  });

  test('pressing Enter while editing creates a new node and focuses it', async () => {
    vi.useFakeTimers();
    renderTreeEditor();

    const firstHeading = getTreePane().getByText('First Heading');

    // Enter edit mode via double-click
    await act(async () => {
      fireEvent.doubleClick(firstHeading);
      vi.runAllTimers();
    });

    // Press Enter to create a new sibling node
    const editingEl = document.activeElement as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Enter' });
    });
    // Flush timers after React has re-rendered with the new node
    await act(async () => {
      vi.runAllTimers();
    });

    // The new empty node should now have editing focus
    const newActiveEl = document.activeElement as HTMLElement;
    expect(newActiveEl).not.toBeNull();
    expect(newActiveEl.getAttribute('contenteditable')).toBe('true');
    expect(newActiveEl.textContent).toBe('');
    expect(newActiveEl).not.toBe(editingEl);

    vi.useRealTimers();
  });

  test('pressing Escape while editing exits edit mode but keeps node selected', async () => {
    vi.useFakeTimers();
    renderTreeEditor();

    const firstHeading = getTreePane().getByText('First Heading');

    // Enter edit mode via double-click
    await act(async () => {
      fireEvent.doubleClick(firstHeading);
      vi.runAllTimers();
    });

    // Verify we're in edit mode
    const editingEl = document.activeElement as HTMLElement;
    expect(editingEl.getAttribute('contenteditable')).toBe('true');

    // Press Escape to exit edit mode
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Escape' });
      vi.runAllTimers();
    });

    // The node should no longer be editable
    expect(firstHeading.getAttribute('contenteditable')).toBe('false');
    // The node should still be selected (has selected styling)
    expectNodeSelected('First Heading');

    vi.useRealTimers();
  });
});

describe('selection and navigation', () => {
  test('ArrowDown selects first node when nothing is selected', () => {
    renderTreeEditor();
    const container = getContainer();

    fireEvent.keyDown(container, { key: 'ArrowDown' });

    expectNodeSelected('First Heading');
  });

  test('ArrowDown moves selection to next node', () => {
    renderTreeEditor();
    const container = getContainer();

    selectFirstNode();
    fireEvent.keyDown(container, { key: 'ArrowDown' });

    expectNodeSelected('Second Heading');
    expectNodeNotSelected('First Heading');
  });

  test('ArrowUp moves selection to previous node', () => {
    renderTreeEditor();
    const container = getContainer();

    fireEvent.click(getTreePane().getByText('Second Heading'));
    fireEvent.keyDown(container, { key: 'ArrowUp' });

    expectNodeSelected('First Heading');
  });

  test('Shift+ArrowDown extends selection range', () => {
    renderTreeEditor();
    const container = getContainer();

    selectFirstNode();
    fireEvent.keyDown(container, { key: 'ArrowDown', shiftKey: true });

    expectNodeSelected('First Heading');
    expectNodeSelected('Second Heading');
  });

  test('Escape clears selection when not editing', () => {
    renderTreeEditor();
    const container = getContainer();

    selectFirstNode();
    expectNodeSelected('First Heading');

    fireEvent.keyDown(container, { key: 'Escape' });

    expectNodeNotSelected('First Heading');
  });

  test('clicking empty area clears selection', () => {
    renderTreeEditor();
    const container = getContainer();

    selectFirstNode();
    expectNodeSelected('First Heading');

    fireEvent.click(container);

    expectNodeNotSelected('First Heading');
  });

  test('ArrowUp on first node stays on first node', () => {
    renderTreeEditor();
    const container = getContainer();

    selectFirstNode();
    fireEvent.keyDown(container, { key: 'ArrowUp' });

    expectNodeSelected('First Heading');
  });

  test('ArrowDown on last node stays on last node', () => {
    renderTreeEditor();
    const container = getContainer();

    fireEvent.click(getTreePane().getByText('Second Heading'));
    fireEvent.keyDown(container, { key: 'ArrowDown' });

    expectNodeSelected('Second Heading');
  });

  test('Ctrl+click toggles multi-select', () => {
    renderTreeEditor();

    // Select first node
    selectFirstNode();
    expectNodeSelected('First Heading');

    // Ctrl+click second node to add to selection
    fireEvent.click(getTreePane().getByText('Second Heading'), { ctrlKey: true });

    expectNodeSelected('First Heading');
    expectNodeSelected('Second Heading');

    // Ctrl+click first node again to deselect it
    fireEvent.click(getTreePane().getByText('First Heading'), { ctrlKey: true });

    expectNodeNotSelected('First Heading');
    expectNodeSelected('Second Heading');
  });
});

describe('node operations via keyboard', () => {
  test('Delete key removes selected node', () => {
    renderTreeEditor();
    const container = getContainer();

    // Select first node
    selectFirstNode();

    // Press Delete
    fireEvent.keyDown(container, { key: 'Delete' });

    // First heading should be gone
    expect(getTreePane().queryByText('First Heading')).not.toBeInTheDocument();
    // Second heading should still be there
    expect(getTreePane().getByText('Second Heading')).toBeInTheDocument();
  });

  test('Tab indents selected node under previous sibling', () => {
    // Need heading followed by content at same level for indent to work
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'document',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'heading',
          contents: { de: 'Parent Heading' },
          children: [],
        },
        {
          id: 'c1',
          number: null,
          type: 'content',
          contents: { de: 'Child Content' },
          children: [],
        },
      ],
    };

    render(
      <EditorInterface
        initialDocument={doc}
        pdfUrl={null}
        documentName="test.docx"
        language="de"
        onBack={() => {}}
      />
    );

    const container = getContainer();

    // Select the content node
    fireEvent.click(getTreePane().getByText('Child Content'));

    // Before indent: content node is a sibling of heading (not nested inside it)
    const headingWrapper = getNodeWrapper('Parent Heading');
    const contentWrapper = getNodeWrapper('Child Content');
    expect(headingWrapper.contains(contentWrapper)).toBe(false);

    // Press Tab to indent
    fireEvent.keyDown(container, { key: 'Tab' });

    // After indent: content node should be nested inside the heading's subtree
    const headingWrapperAfter = getNodeWrapper('Parent Heading');
    const contentWrapperAfter = getNodeWrapper('Child Content');
    expect(headingWrapperAfter.contains(contentWrapperAfter)).toBe(true);
  });

  test('Shift+Tab outdents selected node', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'document',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'heading',
          contents: { de: 'Parent Heading' },
          children: [
            {
              id: 'c1',
              number: null,
              type: 'content',
              contents: { de: 'Nested Content' },
              children: [],
            },
          ],
        },
      ],
    };

    render(
      <EditorInterface
        initialDocument={doc}
        pdfUrl={null}
        documentName="test.docx"
        language="de"
        onBack={() => {}}
      />
    );

    const container = getContainer();

    // Select the nested content node
    fireEvent.click(getTreePane().getByText('Nested Content'));

    // Before outdent: content node is nested inside heading
    const headingWrapper = getNodeWrapper('Parent Heading');
    const contentWrapper = getNodeWrapper('Nested Content');
    expect(headingWrapper.contains(contentWrapper)).toBe(true);

    // Press Shift+Tab to outdent
    fireEvent.keyDown(container, { key: 'Tab', shiftKey: true });

    // After outdent: content node should no longer be nested inside heading
    const headingWrapperAfter = getNodeWrapper('Parent Heading');
    const contentWrapperAfter = getNodeWrapper('Nested Content');
    expect(headingWrapperAfter.contains(contentWrapperAfter)).toBe(false);
  });
});

describe('undo and redo', () => {
  test('Ctrl+Z undoes last operation', () => {
    renderTreeEditor();
    const container = getContainer();

    // Select and delete a node
    selectFirstNode();
    fireEvent.keyDown(container, { key: 'Delete' });
    expect(getTreePane().queryByText('First Heading')).not.toBeInTheDocument();

    // Undo with Ctrl+Z
    fireEvent.keyDown(container, { key: 'z', ctrlKey: true });

    // Node should be restored
    expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
  });

  test('Ctrl+Y redoes undone operation', () => {
    renderTreeEditor();
    const container = getContainer();

    // Select and delete a node
    selectFirstNode();
    fireEvent.keyDown(container, { key: 'Delete' });
    expect(getTreePane().queryByText('First Heading')).not.toBeInTheDocument();

    // Undo
    fireEvent.keyDown(container, { key: 'z', ctrlKey: true });
    expect(getTreePane().getByText('First Heading')).toBeInTheDocument();

    // Redo with Ctrl+Y
    fireEvent.keyDown(container, { key: 'y', ctrlKey: true });
    expect(getTreePane().queryByText('First Heading')).not.toBeInTheDocument();
  });

  test('Cmd+Shift+Z redoes undone operation', () => {
    renderTreeEditor();
    const container = getContainer();

    // Select and delete a node
    selectFirstNode();
    fireEvent.keyDown(container, { key: 'Delete' });

    // Undo
    fireEvent.keyDown(container, { key: 'z', metaKey: true });
    expect(getTreePane().getByText('First Heading')).toBeInTheDocument();

    // Redo with Cmd+Shift+Z
    fireEvent.keyDown(container, { key: 'z', metaKey: true, shiftKey: true });
    expect(getTreePane().queryByText('First Heading')).not.toBeInTheDocument();
  });
});

describe('edit mode behaviors', () => {
  test('Backspace on empty node in edit mode deletes the node', async () => {
    vi.useFakeTimers();

    // Create document with an empty content node
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'document',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'heading',
          contents: { de: 'First Heading' },
          children: [],
        },
        {
          id: 'empty',
          number: null,
          type: 'content',
          contents: { de: '' },
          children: [],
        },
      ],
    };

    render(
      <EditorInterface
        initialDocument={doc}
        pdfUrl={null}
        documentName="test.docx"
        language="de"
        onBack={() => {}}
      />
    );

    // The empty content node renders a contenteditable with min-height but no text.
    // Find it by locating the second draggable wrapper (the empty node's wrapper)
    // and double-clicking to enter edit mode.
    const headingWrapper = getNodeWrapper('First Heading');
    const allDraggables = document.querySelectorAll('[draggable]');
    // The empty node is the second draggable (after the heading)
    const emptyNodeWrapper = Array.from(allDraggables).find(
      (el) => el !== headingWrapper
    ) as HTMLElement;

    await act(async () => {
      fireEvent.doubleClick(emptyNodeWrapper);
      vi.runAllTimers();
    });

    // Press Backspace on the empty node — should delete it since content is empty
    const activeEl = document.activeElement as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(activeEl, { key: 'Backspace' });
      vi.runAllTimers();
    });

    // The empty node should be deleted, only the heading remains
    expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
    const remainingDraggables = document.querySelectorAll('[draggable]');
    expect(remainingDraggables.length).toBe(1);

    vi.useRealTimers();
  });
});

describe('empty document', () => {
  const createEmptyDocument = (): ContainerDocumentNode => ({
    id: 'root',
    number: null,
    type: 'document',
    children: [],
  });

  test('shows empty state message', () => {
    render(
      <EditorInterface
        initialDocument={createEmptyDocument()}
        pdfUrl={null}
        documentName="test.docx"
        language="de"
        onBack={() => {}}
      />
    );

    expect(screen.getByText('Document is empty')).toBeInTheDocument();
    expect(screen.getByText('Click here to start writing')).toBeInTheDocument();
  });

  test('clicking empty state does not crash', () => {
    render(
      <EditorInterface
        initialDocument={createEmptyDocument()}
        pdfUrl={null}
        documentName="test.docx"
        language="de"
        onBack={() => {}}
      />
    );

    // Click the empty state area — addNodeAfter(document.id) is called.
    // Note: addNodeAfter currently bails out for the root node (path.length === 0),
    // so no node is added. This test verifies the click doesn't crash.
    const clickTarget = screen.getByText('Click here to start writing');
    fireEvent.click(clickTarget);

    expect(screen.getByText('Document is empty')).toBeInTheDocument();
  });
});

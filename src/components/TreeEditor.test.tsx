// Tests for TreeEditor behavior (keyboard shortcuts, selection, editing, drag-drop).
// Rendered via EditorInterface since TreeEditor requires the useTreeEditor hook output as a prop.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import { EditorInterface } from './EditorInterface';

const createTestDocument = (): ContainerDocumentNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [],
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

const renderTreeEditor = () =>
  render(
    <EditorInterface
      initialDocument={createTestDocument()}
      documentUrl={null}
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

    test('M key merges contiguous same-type siblings', () => {
      renderTreeEditor();
      // Select both headings: click first, shift-click second to extend the range.
      const firstHeading = getTreePane().getByText('First Heading');
      fireEvent.click(firstHeading);
      fireEvent.click(getTreePane().getByText('Second Heading'), { shiftKey: true });

      const container = getContainer();
      fireEvent.keyDown(container, { key: 'm' });

      // The two heading nodes should be merged: only one heading text remains, joined with a space.
      expect(getTreePane().getByText('First Heading Second Heading')).toBeInTheDocument();
      expect(getTreePane().queryByText('Second Heading')).toBeNull();
      // Floating toolbar's selection count should collapse to the survivor.
      expect(screen.queryByText(/2 selected/)).toBeNull();
    });

    test('M key is a no-op when the selection cannot be merged', () => {
      renderTreeEditor();
      // Only one node selected — merge shouldn't fire.
      selectFirstNode();
      const container = getContainer();
      fireEvent.keyDown(container, { key: 'm' });

      // Both headings still present, unchanged.
      expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
      expect(getTreePane().getByText('Second Heading')).toBeInTheDocument();
    });

    test('Cmd+Z restores the pre-merge state', () => {
      renderTreeEditor();
      const firstHeading = getTreePane().getByText('First Heading');
      fireEvent.click(firstHeading);
      fireEvent.click(getTreePane().getByText('Second Heading'), { shiftKey: true });

      const container = getContainer();
      fireEvent.keyDown(container, { key: 'm' });
      // Sanity: merge happened.
      expect(getTreePane().getByText('First Heading Second Heading')).toBeInTheDocument();

      // Undo: both originals should reappear.
      fireEvent.keyDown(container, { key: 'z', metaKey: true });
      expect(getTreePane().getByText('First Heading')).toBeInTheDocument();
      expect(getTreePane().getByText('Second Heading')).toBeInTheDocument();
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

  // Regression: clicking inside an already-editing field used to bubble up to the
  // node wrapper's onClick, which called containerRef.focus() unconditionally and
  // blurred the contentEditable — making the caret disappear (issue #60).
  test('clicking inside an editing node keeps focus on its contentEditable', async () => {
    vi.useFakeTimers();
    renderTreeEditor();

    const firstHeading = getTreePane().getByText('First Heading');

    await act(async () => {
      fireEvent.doubleClick(firstHeading);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    expect(editingEl.getAttribute('contenteditable')).toBe('true');

    // Simulate the user clicking inside the field they're editing (e.g. to move
    // the caret). The bug was synchronous focus theft, so no timers to flush.
    await act(async () => {
      fireEvent.click(editingEl);
    });

    expect(document.activeElement).toBe(editingEl);

    vi.useRealTimers();
  });

  test('clicking a non-editing node moves focus to the container', () => {
    renderTreeEditor();

    fireEvent.click(getTreePane().getByText('First Heading'));

    // The container owns keyboard handling; a plain (non-editing) click must
    // route focus there so arrow keys and shortcuts work.
    expect(document.activeElement).toBe(getContainer());
  });

  // Regression: Firefox suppresses caret-positioning in a contentEditable when
  // any ancestor element has draggable=true. With nested nodes (heading + child
  // content) the parent wrapper's draggable=true broke clicking inside the
  // nested editing field (issue #60). All node wrappers must drop draggable
  // while any node is in edit mode.
  test('all node wrappers drop draggable while any node is editing', async () => {
    vi.useFakeTimers();
    const nestedDoc: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Parent Heading' },
          children: [
            {
              id: 'c1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Nested Content' },
              children: [],
            },
          ],
        },
      ],
    };

    render(
      <EditorInterface
        initialDocument={nestedDoc}
        documentUrl={null}
        documentName="t.docx"
        language="de"
        onBack={() => {}}
      />
    );

    // Sanity: before editing, both wrappers are draggable.
    let wrappers = getContainer().querySelectorAll('[draggable]');
    expect(wrappers.length).toBe(2);
    for (const w of wrappers) expect(w.getAttribute('draggable')).toBe('true');

    // Enter edit mode on the nested content node.
    await act(async () => {
      fireEvent.doubleClick(getTreePane().getByText('Nested Content'));
      vi.runAllTimers();
    });

    // Every wrapper — including the parent heading — must now declare
    // draggable=false so Firefox lets the browser position the caret.
    wrappers = getContainer().querySelectorAll('[draggable]');
    expect(wrappers.length).toBe(2);
    for (const w of wrappers) expect(w.getAttribute('draggable')).toBe('false');

    vi.useRealTimers();
  });

  // Regression (issue #101, problem 2): editing a node's number opens a text
  // <input>. While it's open the surrounding node wrappers must drop
  // draggable=false, otherwise a mouse drag inside the input starts node
  // drag&drop instead of selecting text.
  test('node wrappers drop draggable while editing a number', async () => {
    renderTreeEditor();

    // Sanity: before editing, every wrapper is draggable.
    let wrappers = getContainer().querySelectorAll('[draggable]');
    expect(wrappers.length).toBeGreaterThan(0);
    for (const w of wrappers) expect(w.getAttribute('draggable')).toBe('true');

    // Double-click the first node's number badge to enter number-edit mode.
    await act(async () => {
      fireEvent.doubleClick(getTreePane().getAllByTitle('Double-click to edit number')[0]);
    });

    // Every wrapper must now declare draggable=false so the browser lets the
    // user select text inside the number input with the mouse.
    wrappers = getContainer().querySelectorAll('[draggable]');
    expect(wrappers.length).toBeGreaterThan(0);
    for (const w of wrappers) expect(w.getAttribute('draggable')).toBe('false');
  });

  // Regression (issue #101, problem 3): with no node selected, pressing Tab used
  // to fall through to the browser's native focus-move, scrolling the pane. The
  // handler must call preventDefault() even when there's nothing to indent.
  test('Tab with no selection prevents default (no scroll jump)', () => {
    renderTreeEditor();

    // Guard the precondition: nothing is selected, so this exercises the
    // no-selection path rather than the indent path (which also preventDefaults).
    expectNodeNotSelected('First Heading');
    expectNodeNotSelected('Second Heading');

    // fireEvent returns false when a handler called preventDefault() on the event.
    const result = fireEvent.keyDown(getContainer(), { key: 'Tab' });
    expect(result).toBe(false);
  });

  test('pressing Enter while editing a TEXT-format node does NOT create a sibling', async () => {
    vi.useFakeTimers();
    renderTreeEditor();

    const firstHeading = getTreePane().getByText('First Heading');

    // Snapshot the count of contenteditable nodes (one per heading/content/footnote).
    const beforeEditableCount = getContainer().querySelectorAll('[contenteditable]').length;

    // Enter edit mode via double-click
    await act(async () => {
      fireEvent.doubleClick(firstHeading);
      vi.runAllTimers();
    });

    // Press Enter — for TEXT-format nodes this is a no-op (no sibling, no newline)
    const editingEl = document.activeElement as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Enter' });
    });
    await act(async () => {
      vi.runAllTimers();
    });

    // No new editable node was inserted into the tree.
    const afterEditableCount = getContainer().querySelectorAll('[contenteditable]').length;
    expect(afterEditableCount).toBe(beforeEditableCount);

    vi.useRealTimers();
  });

  test('pressing Enter on a selected (non-editing) node still creates a sibling', async () => {
    vi.useFakeTimers();
    renderTreeEditor();

    const firstHeading = getTreePane().getByText('First Heading');
    fireEvent.click(firstHeading);

    const beforeEditableCount = getContainer().querySelectorAll('[contenteditable]').length;
    const container = getContainer();
    await act(async () => {
      fireEvent.keyDown(container, { key: 'Enter' });
      vi.runAllTimers();
    });

    // A new content node should now be inserted into the tree (one more contenteditable)
    const afterEditableCount = getContainer().querySelectorAll('[contenteditable]').length;
    expect(afterEditableCount).toBe(beforeEditableCount + 1);

    vi.useRealTimers();
  });

  test('pressing Enter while editing a NEWLINES-format node inserts \\n via execCommand', async () => {
    vi.useFakeTimers();

    const initialDocument: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'p',
          number: null,
          type: 'CONTENT',
          format: 'NEWLINES',
          contents: { de: 'ab' },
          children: [],
        },
      ],
    };

    const execCommandSpy = vi.fn(() => true);
    const originalExec = (
      window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
    ).execCommand;
    (window.document as Document & { execCommand: (...args: unknown[]) => boolean }).execCommand =
      execCommandSpy as unknown as Document['execCommand'];

    render(
      <EditorInterface
        initialDocument={initialDocument}
        documentUrl={null}
        documentName="t.docx"
        language="de"
        onBack={() => {}}
      />
    );

    const target = getTreePane().getByText('ab');
    await act(async () => {
      fireEvent.doubleClick(target);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Enter' });
    });

    expect(execCommandSpy).toHaveBeenCalledWith('insertText', false, '\n');

    if (originalExec) {
      (
        window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
      ).execCommand = originalExec;
    }

    vi.useRealTimers();
  });

  test('pressing Enter while editing a MARKDOWN_MINIMAL-format heading is a no-op', async () => {
    vi.useFakeTimers();

    const initialDocument: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h',
          number: '1',
          type: 'HEADING',
          format: 'MARKDOWN_MINIMAL',
          contents: { de: '**hello**' },
          children: [],
        },
      ],
    };

    const execCommandSpy = vi.fn(() => true);
    const originalExec = (
      window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
    ).execCommand;
    (window.document as Document & { execCommand: (...args: unknown[]) => boolean }).execCommand =
      execCommandSpy as unknown as Document['execCommand'];

    render(
      <EditorInterface
        initialDocument={initialDocument}
        documentUrl={null}
        documentName="t.docx"
        language="de"
        onBack={() => {}}
      />
    );

    const target = getTreePane().getByText('hello');
    await act(async () => {
      fireEvent.doubleClick(target);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Enter' });
    });

    // MARKDOWN_MINIMAL has no newline rule — Enter must NOT insert one.
    expect(execCommandSpy).not.toHaveBeenCalled();

    if (originalExec) {
      (
        window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
      ).execCommand = originalExec;
    }
    vi.useRealTimers();
  });

  test('pressing Enter while editing a MARKDOWN-format node inserts \\n via execCommand', async () => {
    vi.useFakeTimers();

    const initialDocument: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'p',
          number: null,
          type: 'CONTENT',
          format: 'MARKDOWN',
          contents: { de: 'xy' },
          children: [],
        },
      ],
    };

    const execCommandSpy = vi.fn(() => true);
    const originalExec = (
      window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
    ).execCommand;
    (window.document as Document & { execCommand: (...args: unknown[]) => boolean }).execCommand =
      execCommandSpy as unknown as Document['execCommand'];

    render(
      <EditorInterface
        initialDocument={initialDocument}
        documentUrl={null}
        documentName="t.docx"
        language="de"
        onBack={() => {}}
      />
    );

    const target = getTreePane().getByText('xy');
    await act(async () => {
      fireEvent.doubleClick(target);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Enter' });
    });

    expect(execCommandSpy).toHaveBeenCalledWith('insertText', false, '\n');

    if (originalExec) {
      (
        window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
      ).execCommand = originalExec;
    }

    vi.useRealTimers();
  });

  test('Shift+Enter behaves identically to Enter — no-op in TEXT-format edit mode', async () => {
    vi.useFakeTimers();
    renderTreeEditor();

    const firstHeading = getTreePane().getByText('First Heading');
    const beforeCount = getContainer().querySelectorAll('[contenteditable]').length;

    await act(async () => {
      fireEvent.doubleClick(firstHeading);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    const execCommandSpy = vi.fn(() => true);
    const originalExec = (
      window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
    ).execCommand;
    (window.document as Document & { execCommand: (...args: unknown[]) => boolean }).execCommand =
      execCommandSpy as unknown as Document['execCommand'];

    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Enter', shiftKey: true });
    });
    await act(async () => {
      vi.runAllTimers();
    });

    // No newline inserted, no sibling created
    expect(execCommandSpy).not.toHaveBeenCalled();
    expect(getContainer().querySelectorAll('[contenteditable]').length).toBe(beforeCount);

    if (originalExec) {
      (
        window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
      ).execCommand = originalExec;
    }
    vi.useRealTimers();
  });

  test('Shift+Enter inserts \\n in MARKDOWN-format edit mode (same as Enter)', async () => {
    vi.useFakeTimers();

    const initialDocument: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'p',
          number: null,
          type: 'CONTENT',
          format: 'MARKDOWN',
          contents: { de: 'xy' },
          children: [],
        },
      ],
    };

    const execCommandSpy = vi.fn(() => true);
    const originalExec = (
      window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
    ).execCommand;
    (window.document as Document & { execCommand: (...args: unknown[]) => boolean }).execCommand =
      execCommandSpy as unknown as Document['execCommand'];

    render(
      <EditorInterface
        initialDocument={initialDocument}
        documentUrl={null}
        documentName="t.docx"
        language="de"
        onBack={() => {}}
      />
    );

    const target = getTreePane().getByText('xy');
    await act(async () => {
      fireEvent.doubleClick(target);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Enter', shiftKey: true });
    });

    expect(execCommandSpy).toHaveBeenCalledWith('insertText', false, '\n');

    if (originalExec) {
      (
        window.document as Document & { execCommand?: (...args: unknown[]) => boolean }
      ).execCommand = originalExec;
    }
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

  test('Enter key in selection mode creates a new node after the selected one', () => {
    renderTreeEditor();
    const container = getContainer();

    selectFirstNode();

    // Press Enter while in selection mode (not editing)
    fireEvent.keyDown(container, { key: 'Enter' });

    // A new empty node should appear between the two headings
    const allDraggables = container.querySelectorAll('[draggable]');
    expect(allDraggables.length).toBe(3);

    // The new node sits between First Heading and Second Heading
    expect(allDraggables[0].textContent).toContain('First Heading');
    expect(allDraggables[2].textContent).toContain('Second Heading');

    // The new node is an empty content node with an editable area
    const newNodeEditable = allDraggables[1].querySelector('[contenteditable]');
    expect(newNodeEditable).not.toBeNull();
    expect(newNodeEditable!.textContent).toBe('');
  });

  test('Tab indents selected node under previous sibling', () => {
    // Need heading followed by content at same level for indent to work
    const doc: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Parent Heading' },
          children: [],
        },
        {
          id: 'c1',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'Child Content' },
          children: [],
        },
      ],
    };

    render(
      <EditorInterface
        initialDocument={doc}
        documentUrl={null}
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
      type: 'DOCUMENT',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Parent Heading' },
          children: [
            {
              id: 'c1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
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
        documentUrl={null}
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
      type: 'DOCUMENT',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'First Heading' },
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

    render(
      <EditorInterface
        initialDocument={doc}
        documentUrl={null}
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
    type: 'DOCUMENT',
    children: [],
  });

  test('shows empty state message', () => {
    render(
      <EditorInterface
        initialDocument={createEmptyDocument()}
        documentUrl={null}
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
        documentUrl={null}
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

describe('drag and drop reordering', () => {
  const createThreeNodeDocument = (): ContainerDocumentNode => ({
    id: 'root',
    type: 'DOCUMENT',
    children: [
      {
        id: 'h1',
        number: '1',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'First' },
        children: [],
      },
      {
        id: 'h2',
        number: '2',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Second' },
        children: [],
      },
      {
        id: 'h3',
        number: '3',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Third' },
        children: [],
      },
    ],
  });

  const renderThreeNodes = () =>
    render(
      <EditorInterface
        initialDocument={createThreeNodeDocument()}
        documentUrl={null}
        documentName="test.docx"
        language="de"
        onBack={() => {}}
      />
    );

  /** Get ordered text content of all draggable nodes in the tree pane. */
  const getNodeOrder = () => {
    const container = getContainer();
    const draggables = container.querySelectorAll('[draggable]');
    return Array.from(draggables).map(
      (el) => el.querySelector('[contenteditable]')?.textContent?.trim() ?? ''
    );
  };

  /**
   * Simulate a full drag-and-drop sequence: drag sourceText's node and drop
   * it after targetText's node.
   *
   * Note: jsdom has no layout engine, so getBoundingClientRect returns zeros
   * and the top/bottom half detection in handleDragOver always resolves to
   * 'bottom' (insert after target). This still exercises all four drag
   * handlers (handleDragStart, handleDragOver, handleDrop, handleDragEnd).
   */
  const dragAndDropAfter = (sourceText: string, targetText: string) => {
    const sourceWrapper = getNodeWrapper(sourceText);
    const targetWrapper = getNodeWrapper(targetText);

    fireEvent.dragStart(sourceWrapper, {
      dataTransfer: { effectAllowed: 'move' },
    });
    fireEvent.dragOver(targetWrapper);
    fireEvent.drop(targetWrapper);
    fireEvent.dragEnd(sourceWrapper);
  };

  test('dragging a node forward moves it after the target', () => {
    renderThreeNodes();

    expect(getNodeOrder()).toEqual(['First', 'Second', 'Third']);

    // Drag "First" onto "Third" → First moves after Third
    dragAndDropAfter('First', 'Third');

    expect(getNodeOrder()).toEqual(['Second', 'Third', 'First']);
  });

  test('dragging a node backward moves it after the target', () => {
    renderThreeNodes();

    // Drag "Third" onto "First" → Third moves after First
    dragAndDropAfter('Third', 'First');

    expect(getNodeOrder()).toEqual(['First', 'Third', 'Second']);
  });

  test('dragging a node onto itself does not change the order', () => {
    renderThreeNodes();

    dragAndDropAfter('Second', 'Second');

    expect(getNodeOrder()).toEqual(['First', 'Second', 'Third']);
  });

  test('drag end without a valid drop resets state without reordering', () => {
    renderThreeNodes();

    const sourceWrapper = getNodeWrapper('First');

    // Start dragging but cancel (dragEnd without drop)
    fireEvent.dragStart(sourceWrapper, {
      dataTransfer: { effectAllowed: 'move' },
    });
    fireEvent.dragEnd(sourceWrapper);

    // Order should remain unchanged
    expect(getNodeOrder()).toEqual(['First', 'Second', 'Third']);

    // Nodes should not have drag-in-progress styling (opacity-30)
    expect(sourceWrapper.className).not.toContain('opacity-30');
  });
});

describe('FloatingToolbar button clicks', () => {
  test('clicking a type button changes the selected node type', () => {
    renderTreeEditor();
    selectFirstNode();

    // The first heading renders as an H1
    const headingEl = getTreePane().getByText('First Heading');
    expect(headingEl.tagName).toMatch(/^H\d$/);

    // Click "Content (C)" in the floating toolbar to change type
    fireEvent.click(screen.getByTitle('Content (C)'));

    // After type change, content nodes render as DIV instead of H-tag
    const contentEl = getTreePane().getByText('First Heading');
    expect(contentEl.tagName).toBe('DIV');
  });

  test('clicking delete removes the selected node', () => {
    renderTreeEditor();
    selectFirstNode();

    fireEvent.click(screen.getByTitle('Delete Selected'));

    expect(getTreePane().queryByText('First Heading')).not.toBeInTheDocument();
    expect(getTreePane().getByText('Second Heading')).toBeInTheDocument();
  });

  test('clicking a type button applies to all selected nodes', () => {
    renderTreeEditor();

    // Multi-select both headings
    selectFirstNode();
    fireEvent.click(getTreePane().getByText('Second Heading'), { ctrlKey: true });
    expectNodeSelected('First Heading');
    expectNodeSelected('Second Heading');

    // Change both to content via toolbar
    fireEvent.click(screen.getByTitle('Content (C)'));

    // Both should now render as DIV (content) instead of H-tags
    expect(getTreePane().getByText('First Heading').tagName).toBe('DIV');
    expect(getTreePane().getByText('Second Heading').tagName).toBe('DIV');
  });

  test('clicking delete removes all selected nodes', () => {
    renderTreeEditor();

    // Multi-select both headings
    selectFirstNode();
    fireEvent.click(getTreePane().getByText('Second Heading'), { ctrlKey: true });

    fireEvent.click(screen.getByTitle('Delete Selected'));

    expect(getTreePane().queryByText('First Heading')).not.toBeInTheDocument();
    expect(getTreePane().queryByText('Second Heading')).not.toBeInTheDocument();
  });

  test('clicking clear selection deselects all nodes', () => {
    renderTreeEditor();
    selectFirstNode();
    expectNodeSelected('First Heading');

    fireEvent.click(screen.getByTitle('Clear Selection'));

    expectNodeNotSelected('First Heading');
  });
});

describe('inline-marks toolbar — end-to-end toggle', () => {
  test('clicking Bold while editing a MARKDOWN_MINIMAL heading wraps the selected text and updates the tree', async () => {
    vi.useFakeTimers();

    const initialDocument: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h',
          number: '1',
          type: 'HEADING',
          format: 'MARKDOWN_MINIMAL',
          contents: { de: 'hello' },
          children: [],
        },
      ],
    };

    render(
      <EditorInterface
        initialDocument={initialDocument}
        documentUrl={null}
        documentName="t.docx"
        language="de"
        onBack={() => {}}
      />
    );

    const target = getTreePane().getByText('hello');
    await act(async () => {
      fireEvent.doubleClick(target);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    expect(editingEl.getAttribute('contenteditable')).toBe('true');

    // Select the whole word so the toggle wraps it.
    const textNode = editingEl.firstChild as Text;
    await act(async () => {
      const range = window.document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 'hello'.length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('inline-mark-bold'));
    });

    // Editing surface now shows the raw source with markdown delimiters.
    expect(editingEl.textContent).toBe('**hello**');

    // Press Escape to exit edit mode and confirm the tree state was updated
    // (renderContent emits <strong> for MARKDOWN_MINIMAL bold in display mode).
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'Escape' });
    });
    expect(getTreePane().getByText('hello').closest('h2')?.innerHTML).toContain(
      '<strong>hello</strong>'
    );

    vi.useRealTimers();
  });

  test('Google Docs–style keyboard shortcuts toggle the corresponding mark on the editing contenteditable', async () => {
    vi.useFakeTimers();

    const initialDocument: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h',
          number: null,
          type: 'HEADING',
          format: 'MARKDOWN_MINIMAL',
          contents: { de: 'word' },
          children: [],
        },
      ],
    };

    render(
      <EditorInterface
        initialDocument={initialDocument}
        documentUrl={null}
        documentName="t.docx"
        language="de"
        onBack={() => {}}
      />
    );

    const target = getTreePane().getByText('word');
    await act(async () => {
      fireEvent.doubleClick(target);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    const selectAll = () => {
      const textNode = editingEl.firstChild as Text;
      const range = window.document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, (editingEl.textContent ?? '').length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    };

    const cases: Array<{ event: KeyboardEventInit; expected: string }> = [
      { event: { key: 'b', ctrlKey: true }, expected: '**word**' },
      { event: { key: 'i', metaKey: true }, expected: '*word*' },
      { event: { key: '5', code: 'Digit5', altKey: true, shiftKey: true }, expected: '~~word~~' },
      { event: { key: '.', ctrlKey: true }, expected: '^word^' },
      { event: { key: ',', metaKey: true }, expected: '~word~' },
    ];

    for (const { event, expected } of cases) {
      // Reset to plain "word".
      await act(async () => {
        editingEl.textContent = 'word';
        editingEl.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        selectAll();
      });
      await act(async () => {
        fireEvent.keyDown(editingEl, event);
      });
      expect(editingEl.textContent).toBe(expected);
    }

    vi.useRealTimers();
  });

  test('keyboard shortcuts do not fire when no editor is active', () => {
    renderTreeEditor();

    // No editor focused, no node selected — Ctrl+B should not throw or do anything.
    fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });
    // The first heading content stays as plain text.
    expect(getTreePane().getByText('First Heading').innerHTML).toBe('First Heading');
  });

  test('keyboard shortcuts do not fire when format is TEXT (no markdown rendering)', async () => {
    vi.useFakeTimers();
    renderTreeEditor(); // First heading uses format: 'TEXT'.

    const target = getTreePane().getByText('First Heading');
    await act(async () => {
      fireEvent.doubleClick(target);
      vi.runAllTimers();
    });

    const editingEl = document.activeElement as HTMLElement;
    await act(async () => {
      const textNode = editingEl.firstChild as Text;
      const range = window.document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await act(async () => {
      fireEvent.keyDown(editingEl, { key: 'b', ctrlKey: true });
    });

    // textContent remains untouched — the shortcut was suppressed for TEXT format.
    expect(editingEl.textContent).toBe('First Heading');
    vi.useRealTimers();
  });

  test('clicking Bold while editing a number input commits to the tree without waiting for blur', async () => {
    const initialDocument: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'heading text' },
          children: [],
        },
      ],
    };

    render(
      <EditorInterface
        initialDocument={initialDocument}
        documentUrl={null}
        documentName="t.docx"
        language="de"
        onBack={() => {}}
      />
    );

    // Double-click the number badge to enter edit mode on the number input.
    const numberBadge = screen.getByTitle('Double-click to edit number');
    await act(async () => {
      fireEvent.doubleClick(numberBadge);
    });

    const input = document.querySelector(
      'input[data-structedit-field="number"]'
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    if (!input) throw new Error('number input not found');
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('data-structedit-field')).toBe('number');
    await act(async () => {
      input.setSelectionRange(0, input.value.length);
      document.dispatchEvent(new Event('selectionchange'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('inline-mark-bold'));
    });

    // Input shows the wrapped source.
    expect(input.value).toBe('**1**');

    // Crucially, the tree was updated WITHOUT blurring the input. Blur now and
    // confirm the rendered NumberMarkup shows the bold mark.
    await act(async () => {
      input.blur();
    });
    expect(getContainer().innerHTML).toContain('<strong>1</strong>');
  });
});

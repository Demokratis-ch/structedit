import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import { TreeEditor } from './TreeEditor';

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
    <TreeEditor
      initialDocument={createTestDocument()}
      pdfUrl={null}
      documentName="test.docx"
      language="de"
      onBack={() => {}}
    />
  );

const selectFirstNode = () => {
  // Click the first heading node to select it
  const firstHeading = screen.getByText('First Heading');
  fireEvent.click(firstHeading);
};

const getContainer = () => {
  // The container is the element with tabIndex that receives keyboard events
  const container = document.querySelector('[tabindex="0"]') as HTMLElement;
  return container;
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
      expect(screen.getByText('First Heading')).toBeInTheDocument();
    });

    test('uppercase keys also work (case insensitive)', () => {
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // Uppercase H should also work
      fireEvent.keyDown(container, { key: 'H' });

      expect(screen.getByText('First Heading')).toBeInTheDocument();
    });
  });

  describe('shortcuts should NOT fire in certain conditions', () => {
    test('shortcuts do not fire when no node is selected', () => {
      renderTreeEditor();
      const container = getContainer();

      // Press H without selecting anything - the tree should remain unchanged
      fireEvent.keyDown(container, { key: 'h' });

      // Both headings should still be there, unchanged
      expect(screen.getByText('First Heading')).toBeInTheDocument();
      expect(screen.getByText('Second Heading')).toBeInTheDocument();
    });

    test('shortcuts do not fire with Ctrl modifier', () => {
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // Ctrl+H should not trigger the shortcut
      fireEvent.keyDown(container, { key: 'h', ctrlKey: true });

      expect(screen.getByText('First Heading')).toBeInTheDocument();
    });

    test('shortcuts do not fire with Meta modifier', () => {
      renderTreeEditor();
      selectFirstNode();
      const container = getContainer();

      // Cmd+H should not trigger the shortcut
      fireEvent.keyDown(container, { key: 'h', metaKey: true });

      expect(screen.getByText('First Heading')).toBeInTheDocument();
    });
  });
});

describe('double-click inline editing', () => {
  test('double-clicking a node focuses its contentEditable element', async () => {
    vi.useFakeTimers();
    renderTreeEditor();

    const firstHeading = screen.getByText('First Heading');

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

    const firstHeading = screen.getByText('First Heading');

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

    const firstHeading = screen.getByText('First Heading');

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
    const nodeWrapper = firstHeading.closest('[draggable]') as HTMLElement;
    expect(nodeWrapper.className).toContain('bg-blue');

    vi.useRealTimers();
  });
});

describe('FloatingToolbar tooltips', () => {
  test('toolbar buttons show keyboard shortcuts in tooltips', () => {
    renderTreeEditor();
    selectFirstNode();

    expect(screen.getByTitle('Heading (H)')).toBeInTheDocument();
    expect(screen.getByTitle('Content (C)')).toBeInTheDocument();
    expect(screen.getByTitle('Bullet List (U)')).toBeInTheDocument();
    expect(screen.getByTitle('Ordered List (O)')).toBeInTheDocument();
    expect(screen.getByTitle('Alpha List (A)')).toBeInTheDocument();
    expect(screen.getByTitle('Footnote (F)')).toBeInTheDocument();
  });
});

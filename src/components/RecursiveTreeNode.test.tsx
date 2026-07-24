import { act, fireEvent, render } from '@testing-library/react';
import type React from 'react';
import { Profiler } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { TreeUIStore } from '../stores/TreeUIStore';
import type {
  ContentDocumentNode,
  FootnoteDocumentNode,
  HeadingDocumentNode,
  ListDocumentNode,
  ListItemDocumentNode,
} from '../types/document';
import { createQuestionNode } from '../utils/tree-mutations';
import { RecursiveTreeNode } from './RecursiveTreeNode';
import {
  TreeCallbacksContext,
  type TreeCallbacksContextValue,
  TreeUIStoreContext,
} from './TreeNodeContext';

const createTestNode = (): HeadingDocumentNode => ({
  id: 'h1',
  number: '1',
  type: 'HEADING',
  format: 'TEXT',
  contents: { de: 'Test Heading' },
  children: [],
});

const defaultCallbacks: TreeCallbacksContextValue = {
  language: 'de',
  blockRefs: { current: {} } as React.MutableRefObject<{ [key: string]: HTMLElement | null }>,
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
  onDragEnd: vi.fn(),
  onClick: vi.fn(),
  onDoubleClick: vi.fn(),
  onHoverHandle: vi.fn(),
  onUpdateContent: vi.fn(),
  onKeyDown: vi.fn(),
  onFocus: vi.fn(),
  onNumberDoubleClick: vi.fn(),
  onUpdateNumber: vi.fn(),
  onNumberSubmit: vi.fn(),
  onAddNodeBefore: vi.fn(),
  onAddNodeAfter: vi.fn(),
  onChangeQuestionChoiceMode: vi.fn(),
  onAddOption: vi.fn(),
  onRemoveOption: vi.fn(),
};

function renderWithContext(
  ui: React.ReactElement,
  overrides: {
    callbacks?: Partial<TreeCallbacksContextValue>;
    store?: TreeUIStore;
  } = {}
) {
  const store = overrides.store ?? new TreeUIStore();
  return render(
    <TreeCallbacksContext.Provider value={{ ...defaultCallbacks, ...overrides.callbacks }}>
      <TreeUIStoreContext.Provider value={store}>{ui}</TreeUIStoreContext.Provider>
    </TreeCallbacksContext.Provider>
  );
}

describe('RecursiveTreeNode', () => {
  describe('drop indicator', () => {
    test('shows blue drop indicator when drop is valid', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setDraggedNodeId('other');
      store.setDropTarget({ id: 'h1', position: 'top' });
      store.setReceivingParentId('parent');

      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });

      const indicator = container.querySelector('.bg-blue-600');
      expect(indicator).not.toBeNull();
      expect(container.querySelector('.bg-red-500')).toBeNull();
    });

    test('shows red drop indicator when drop is invalid', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setDraggedNodeId('other');
      store.setDropTarget({ id: 'h1', position: 'top' });
      store.setReceivingParentId(null); // no receiving parent = invalid

      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });

      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).not.toBeNull();
      expect(container.querySelector('.bg-blue-600')).toBeNull();
    });

    test('shows blue indicator at bottom position when valid', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setDraggedNodeId('other');
      store.setDropTarget({ id: 'h1', position: 'bottom' });
      store.setReceivingParentId('parent');

      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });

      const indicator = container.querySelector('.bg-blue-600');
      expect(indicator).not.toBeNull();
      expect(indicator?.classList.contains('-bottom-[3px]')).toBe(true);
    });

    test('shows red indicator at bottom position when invalid', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setDraggedNodeId('other');
      store.setDropTarget({ id: 'h1', position: 'bottom' });
      store.setReceivingParentId(null);

      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });

      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).not.toBeNull();
      expect(indicator?.classList.contains('-bottom-[3px]')).toBe(true);
    });

    test('does not show indicator when not a drop target', () => {
      const node = createTestNode();
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);

      expect(container.querySelector('.bg-blue-600')).toBeNull();
      expect(container.querySelector('.bg-red-500')).toBeNull();
    });
  });

  describe('number placeholder for null numbers', () => {
    test('heading with null number renders a dashed placeholder badge', () => {
      const node: HeadingDocumentNode = {
        id: 'h-no-num',
        number: null,
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Unnumbered Heading' },
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
    });

    test('double-clicking heading placeholder triggers onNumberDoubleClick', () => {
      const onNumberDoubleClick = vi.fn();
      const node: HeadingDocumentNode = {
        id: 'h-no-num',
        number: null,
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Unnumbered Heading' },
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        callbacks: { onNumberDoubleClick },
      });

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
      fireEvent.doubleClick(placeholder!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'h-no-num');
    });

    test('heading with a number still renders a solid badge (not dashed)', () => {
      const node = createTestNode(); // has number: '1'
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);

      const solidBadge = container.querySelector('.border-blue-200');
      expect(solidBadge).not.toBeNull();
      expect(solidBadge?.classList.contains('border-dashed')).toBe(false);
    });

    test('list item bullet with null number triggers onNumberDoubleClick on double-click', () => {
      const onNumberDoubleClick = vi.fn();
      const node: ListItemDocumentNode = {
        id: 'li-no-num',
        number: null,
        type: 'LIST_ITEM',
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        callbacks: { onNumberDoubleClick },
      });

      // The bullet marker div
      const bullet = container.querySelector('.rounded-full')?.parentElement;
      expect(bullet).not.toBeNull();
      fireEvent.doubleClick(bullet!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'li-no-num');
    });

    test('footnote with null number renders a dashed placeholder badge', () => {
      const node: FootnoteDocumentNode = {
        id: 'fn-no-num',
        number: null,
        type: 'FOOTNOTE',
        format: 'TEXT',
        contents: { de: 'A footnote' },
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
    });

    test('content node with null number renders a dashed placeholder badge', () => {
      const node: ContentDocumentNode = {
        id: 'c-no-num',
        number: null,
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Some paragraph' },
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
    });

    test('content node with a number renders a solid badge', () => {
      const onNumberDoubleClick = vi.fn();
      const node: ContentDocumentNode = {
        id: 'c-with-num',
        number: '2.',
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Numbered paragraph' },
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        callbacks: { onNumberDoubleClick },
      });

      const badge = container.querySelector('.border-gray-300');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('2.');
      expect(badge?.classList.contains('border-dashed')).toBe(false);
      fireEvent.doubleClick(badge!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'c-with-num');
    });

    test('list node with null number renders a dashed placeholder badge', () => {
      const node: ListDocumentNode = {
        id: 'list-no-num',
        number: null,
        type: 'LIST',
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
    });

    test('list node with a number renders a solid badge', () => {
      const onNumberDoubleClick = vi.fn();
      const node: ListDocumentNode = {
        id: 'list-with-num',
        number: 'A.',
        type: 'LIST',
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        callbacks: { onNumberDoubleClick },
      });

      const badge = container.querySelector('.border-gray-300');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('A.');
      expect(badge?.classList.contains('border-dashed')).toBe(false);
      fireEvent.doubleClick(badge!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'list-with-num');
    });

    test('footnote with a number renders a solid badge that is double-clickable', () => {
      const onNumberDoubleClick = vi.fn();
      const node: FootnoteDocumentNode = {
        id: 'fn-with-num',
        number: 'i.',
        type: 'FOOTNOTE',
        format: 'TEXT',
        contents: { de: 'A footnote' },
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        callbacks: { onNumberDoubleClick },
      });

      const badge = container.querySelector('.border-amber-200');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('i.');
      fireEvent.doubleClick(badge!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'fn-with-num');
    });

    test('badge in display mode renders the number as MARKDOWN_MINIMAL', () => {
      const node: HeadingDocumentNode = {
        id: 'h-md',
        number: '**1**',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Bold number heading' },
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);

      const badge = container.querySelector('.border-blue-200');
      expect(badge).not.toBeNull();
      // The asterisks are consumed by the renderer; only the inner text remains.
      expect(badge?.textContent).toBe('1');
      expect(badge?.querySelector('strong')?.textContent).toBe('1');
    });

    test('badge in edit mode shows the raw markdown source for editing', () => {
      const node: HeadingDocumentNode = {
        id: 'h-md-edit',
        number: '**1**',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Bold number heading' },
        children: [],
      };
      const store = new TreeUIStore();
      store.setEditingNumberId('h-md-edit');
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });

      const input = container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      // The input must show the raw markdown source so the user can edit it.
      expect(input?.value).toBe('**1**');
    });

    test('number input carries data-structedit-field and data-structedit-node-id for inline-mark targeting', () => {
      const node: HeadingDocumentNode = {
        id: 'h-attr',
        number: '1',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'x' },
        children: [],
      };
      const store = new TreeUIStore();
      store.setEditingNumberId('h-attr');
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });
      const input = container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(input?.getAttribute('data-structedit-field')).toBe('number');
      expect(input?.getAttribute('data-structedit-node-id')).toBe('h-attr');
    });
  });

  describe('add node buttons', () => {
    test('calls onAddNodeBefore when clicking add-before button', () => {
      const onAddNodeBefore = vi.fn();
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setSelection(new Set(['h1']));

      const { getByTitle } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        callbacks: { onAddNodeBefore },
        store,
      });

      fireEvent.click(getByTitle('Add node above'));
      expect(onAddNodeBefore).toHaveBeenCalledWith('h1');
    });

    test('calls onAddNodeAfter when clicking add-after button', () => {
      const onAddNodeAfter = vi.fn();
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setSelection(new Set(['h1']));

      const { getByTitle } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        callbacks: { onAddNodeAfter },
        store,
      });

      fireEvent.click(getByTitle('Add node below'));
      expect(onAddNodeAfter).toHaveBeenCalledWith('h1');
    });

    test('add buttons carry hidden defaults when not selected (revealed via CSS)', () => {
      // Selection styling (showing the buttons) is applied by index.css when
      // the parent wrapper carries data-selected="true". The default JSX must
      // therefore start hidden — opacity-0 + pointer-events-none — otherwise
      // every node permanently shows clickable add-buttons (regression of #102).
      const node = createTestNode();
      const { getByTitle } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);
      const above = getByTitle('Add node above');
      const below = getByTitle('Add node below');
      expect(above.className).toContain('tree-node-add-btn');
      expect(above.className).toContain('opacity-0');
      expect(above.className).toContain('pointer-events-none');
      expect(below.className).toContain('tree-node-add-btn');
      expect(below.className).toContain('opacity-0');
      expect(below.className).toContain('pointer-events-none');
    });

    test('hides add buttons when editing', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setSelection(new Set(['h1']));
      store.setEditingId('h1');

      const { queryByTitle } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });

      expect(queryByTitle('Add node above')).toBeNull();
      expect(queryByTitle('Add node below')).toBeNull();
    });
  });

  describe('memoization', () => {
    test('is wrapped in React.memo', () => {
      expect((RecursiveTreeNode as any).$$typeof).toBe(Symbol.for('react.memo'));
    });

    test('custom comparator exists', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      expect(compare).toBeDefined();
      expect(typeof compare).toBe('function');
    });

    test('skips re-render when node and depth are identical', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const node = createTestNode();
      const props = { node, depth: 1 };
      expect(compare(props, props)).toBe(true);
    });

    test('triggers re-render when node reference changes', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const prev = { node: createTestNode(), depth: 1 };
      const next = { node: createTestNode(), depth: 1 };
      expect(compare(prev, next)).toBe(false);
    });

    test('triggers re-render when depth changes', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const node = createTestNode();
      const prev = { node, depth: 1 };
      const next = { node, depth: 2 };
      expect(compare(prev, next)).toBe(false);
    });
  });

  describe('selection state', () => {
    test('wrapper carries data-selected="false" when not selected', () => {
      const node = createTestNode();
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.dataset.selected).toBe('false');
    });

    test('wrapper carries data-selected="true" when selected at mount', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setSelection(new Set(['h1']));
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.dataset.selected).toBe('true');
    });

    test('data-selected flips imperatively without re-rendering the component', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      const onRender = vi.fn();
      const { container } = render(
        <TreeCallbacksContext.Provider value={defaultCallbacks}>
          <TreeUIStoreContext.Provider value={store}>
            <Profiler id="tn" onRender={onRender}>
              <RecursiveTreeNode node={node} depth={1} />
            </Profiler>
          </TreeUIStoreContext.Provider>
        </TreeCallbacksContext.Provider>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.dataset.selected).toBe('false');
      const initialRenderCount = onRender.mock.calls.length;

      act(() => store.setSelection(new Set(['h1'])));
      expect(wrapper.dataset.selected).toBe('true');

      act(() => store.setSelection(new Set()));
      expect(wrapper.dataset.selected).toBe('false');

      act(() => store.setSelection(new Set(['h1', 'other'])));
      expect(wrapper.dataset.selected).toBe('true');

      expect(onRender.mock.calls.length).toBe(initialRenderCount);
    });
  });

  describe('node-state data attributes', () => {
    test('wrapper carries data-editing="true" when editing', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setEditingId('h1');
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.dataset.editing).toBe('true');
    });

    test('wrapper carries data-receiving-parent="true" when this node is the receiving parent', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setReceivingParentId('h1');
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.dataset.receivingParent).toBe('true');
    });

    test('wrapper carries data-dragging="true" when this node is being dragged', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setDraggedNodeId('h1');
      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.dataset.dragging).toBe('true');
    });
  });

  describe('cursor style during drag', () => {
    test('shows not-allowed cursor when drop is invalid', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setDraggedNodeId('other');
      store.setDropTarget({ id: 'h1', position: 'top' });
      store.setReceivingParentId(null);

      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement.classList.contains('cursor-not-allowed')).toBe(true);
    });

    test('does not show not-allowed cursor when drop is valid', () => {
      const node = createTestNode();
      const store = new TreeUIStore();
      store.setDraggedNodeId('other');
      store.setDropTarget({ id: 'h1', position: 'top' });
      store.setReceivingParentId('parent');

      const { container } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />, {
        store,
      });

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement.classList.contains('cursor-not-allowed')).toBe(false);
    });
  });

  describe('type + format indicator', () => {
    test('content-bearing node shows "<type> · <format>"', () => {
      const node: ContentDocumentNode = {
        id: 'p',
        number: null,
        type: 'CONTENT',
        format: 'MARKDOWN',
        contents: { de: '**bold**' },
        children: [],
      };
      const { getByText } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);
      expect(getByText('CONTENT · MARKDOWN')).toBeTruthy();
    });

    test('heading with TEXT format shows "HEADING · TEXT"', () => {
      const node = createTestNode(); // heading + TEXT
      const { getByText } = renderWithContext(<RecursiveTreeNode node={node} depth={1} />);
      expect(getByText('HEADING · TEXT')).toBeTruthy();
    });

    test('container-only node (LIST_ITEM) shows just the type, no format', () => {
      const node: ListItemDocumentNode = {
        id: 'li',
        number: '1.',
        type: 'LIST_ITEM',
        children: [],
      };
      const { getByText, queryByText } = renderWithContext(
        <RecursiveTreeNode node={node} depth={1} />
      );
      expect(getByText('LIST_ITEM')).toBeTruthy();
      // No "·" separator and no format token in the indicator
      expect(queryByText(/LIST_ITEM ·/)).toBeNull();
    });
  });
});

describe('contribution mode indicator', () => {
  test('renders no mode pill when the node has no contribution mode', () => {
    const node = createTestNode();
    const { queryByTestId, container } = renderWithContext(
      <RecursiveTreeNode node={node} depth={1} />
    );
    expect(queryByTestId('contribution-mode-indicator')).toBeNull();
    expect(container.querySelector('[data-contribution-mode="default"]')).toBeTruthy();
  });

  test('renders a mode pill and reflects the mode via the wrapper data attribute', () => {
    const node: ContentDocumentNode = {
      id: 'c1',
      number: null,
      type: 'CONTENT',
      format: 'TEXT',
      contents: { de: 'x' },
      children: [],
      contributionMode: 'PROPOSAL',
    };
    const { getByTestId, container } = renderWithContext(
      <RecursiveTreeNode node={node} depth={1} />
    );
    expect(getByTestId('contribution-mode-indicator')).toBeTruthy();
    expect(container.querySelector('[data-contribution-mode="PROPOSAL"]')).toBeTruthy();
  });

  test('renders the pill for a NONE (locked) container node', () => {
    const node: ListDocumentNode = {
      id: 'l1',
      number: null,
      type: 'LIST',
      contributionMode: 'NONE',
      children: [
        {
          id: 'li1',
          number: '1.',
          type: 'LIST_ITEM',
          children: [
            {
              id: 'li1-c',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'x' },
              children: [],
            },
          ],
        },
      ],
    };
    const { getAllByTestId, container } = renderWithContext(
      <RecursiveTreeNode node={node} depth={1} />
    );
    // The list itself carries the pill (children carry none).
    expect(getAllByTestId('contribution-mode-indicator')).toHaveLength(1);
    expect(container.querySelector('[data-contribution-mode="NONE"]')).toBeTruthy();
  });
});

describe('questionnaire question rendering', () => {
  test('a choice question renders the card with the single/multiple toggle and add-option', () => {
    const q = createQuestionNode('single', 'de');
    const { getByTestId } = renderWithContext(<RecursiveTreeNode node={q} depth={1} />);
    expect(getByTestId('question-node')).toBeTruthy();
    expect(getByTestId('question-mode-single')).toHaveAttribute('aria-pressed', 'true');
    expect(getByTestId('question-mode-multiple')).toHaveAttribute('aria-pressed', 'false');
    expect(getByTestId('question-add-option')).toBeTruthy();
  });

  test('a text question shows no toggle/add-option and renders a textarea placeholder', () => {
    const q = createQuestionNode('text', 'de');
    const { getByTestId, queryByTestId } = renderWithContext(
      <RecursiveTreeNode node={q} depth={1} />
    );
    expect(getByTestId('question-node')).toBeTruthy();
    expect(queryByTestId('question-mode-single')).toBeNull();
    expect(queryByTestId('question-add-option')).toBeNull();
    expect(getByTestId('textarea-placeholder')).toBeTruthy();
  });

  test('the single/multiple toggle calls onChangeQuestionChoiceMode', () => {
    const q = createQuestionNode('single', 'de');
    const onChangeQuestionChoiceMode = vi.fn();
    const { getByTestId } = renderWithContext(<RecursiveTreeNode node={q} depth={1} />, {
      callbacks: { onChangeQuestionChoiceMode },
    });
    fireEvent.click(getByTestId('question-mode-multiple'));
    expect(onChangeQuestionChoiceMode).toHaveBeenCalledWith(q.id, 'multiple');
  });

  test('add-option calls onAddOption with the question id', () => {
    const q = createQuestionNode('single', 'de');
    const onAddOption = vi.fn();
    const { getByTestId } = renderWithContext(<RecursiveTreeNode node={q} depth={1} />, {
      callbacks: { onAddOption },
    });
    fireEvent.click(getByTestId('question-add-option'));
    expect(onAddOption).toHaveBeenCalledWith(q.id);
  });

  test('an option renders a remove control that calls onRemoveOption', () => {
    const option = createQuestionNode('single', 'de').children[1]; // a RADIOBUTTON
    const onRemoveOption = vi.fn();
    const { getByTestId } = renderWithContext(
      <RecursiveTreeNode node={option} depth={2} parentType="QUESTION" />,
      { callbacks: { onRemoveOption } }
    );
    fireEvent.click(getByTestId('option-remove'));
    expect(onRemoveOption).toHaveBeenCalledWith(option.id);
  });

  test('suppresses the generic add buttons for nodes inside a question', () => {
    const option = createQuestionNode('single', 'de').children[1];
    const { container } = renderWithContext(
      <RecursiveTreeNode node={option} depth={2} parentType="QUESTION" />
    );
    expect(container.querySelector('.tree-node-add-btn')).toBeNull();
  });
});

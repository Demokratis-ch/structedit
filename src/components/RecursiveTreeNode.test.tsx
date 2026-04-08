import { fireEvent, render } from '@testing-library/react';
import type React from 'react';
import { describe, expect, test, vi } from 'vitest';
import type {
  ContainerDocumentNode,
  HeadingDocumentNode,
  LeafDocumentNode,
} from '../types/document';
import { RecursiveTreeNode } from './RecursiveTreeNode';
import {
  TreeCallbacksContext,
  type TreeCallbacksContextValue,
  TreeStateContext,
  type TreeStateContextValue,
} from './TreeNodeContext';

const createTestNode = (): HeadingDocumentNode => ({
  id: 'h1',
  number: '1',
  type: 'heading',
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
  onAddNodeBefore: vi.fn(),
  onAddNodeAfter: vi.fn(),
};

const defaultState: TreeStateContextValue = {
  selectedIds: new Set<string>(),
  editingId: null,
  editingNumberId: null,
  draggedNodeId: null,
  dropTarget: null,
  receivingParentId: null,
  hoveredHandleId: null,
};

const defaultProps = {
  depth: 1,
  isSelected: false,
  isEditing: false,
  isDragging: false,
  isDropTarget: false,
  dropPosition: null as 'top' | 'bottom' | null,
  isEditingNumber: false,
  isHoveredHandle: false,
  isReceivingParent: false,
  isInvalidDrop: false,
};

function renderWithContext(
  ui: React.ReactElement,
  overrides: {
    callbacks?: Partial<TreeCallbacksContextValue>;
    state?: Partial<TreeStateContextValue>;
  } = {}
) {
  return render(
    <TreeCallbacksContext.Provider value={{ ...defaultCallbacks, ...overrides.callbacks }}>
      <TreeStateContext.Provider value={{ ...defaultState, ...overrides.state }}>
        {ui}
      </TreeStateContext.Provider>
    </TreeCallbacksContext.Provider>
  );
}

describe('RecursiveTreeNode', () => {
  describe('drop indicator', () => {
    test('shows blue drop indicator when drop is valid', () => {
      const node = createTestNode();
      const { container } = renderWithContext(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="top"
          isInvalidDrop={false}
        />
      );

      const indicator = container.querySelector('.bg-blue-600');
      expect(indicator).not.toBeNull();
      expect(container.querySelector('.bg-red-500')).toBeNull();
    });

    test('shows red drop indicator when drop is invalid', () => {
      const node = createTestNode();
      const { container } = renderWithContext(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="top"
          isInvalidDrop={true}
        />
      );

      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).not.toBeNull();
      expect(container.querySelector('.bg-blue-600')).toBeNull();
    });

    test('shows blue indicator at bottom position when valid', () => {
      const node = createTestNode();
      const { container } = renderWithContext(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="bottom"
          isInvalidDrop={false}
        />
      );

      const indicator = container.querySelector('.bg-blue-600');
      expect(indicator).not.toBeNull();
      expect(indicator?.classList.contains('-bottom-[3px]')).toBe(true);
    });

    test('shows red indicator at bottom position when invalid', () => {
      const node = createTestNode();
      const { container } = renderWithContext(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="bottom"
          isInvalidDrop={true}
        />
      );

      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).not.toBeNull();
      expect(indicator?.classList.contains('-bottom-[3px]')).toBe(true);
    });

    test('does not show indicator when not a drop target', () => {
      const node = createTestNode();
      const { container } = renderWithContext(
        <RecursiveTreeNode {...defaultProps} node={node} isDropTarget={false} dropPosition={null} />
      );

      expect(container.querySelector('.bg-blue-600')).toBeNull();
      expect(container.querySelector('.bg-red-500')).toBeNull();
    });
  });

  describe('number placeholder for null numbers', () => {
    test('heading with null number renders a dashed placeholder badge', () => {
      const node: HeadingDocumentNode = {
        id: 'h-no-num',
        number: null,
        type: 'heading',
        contents: { de: 'Unnumbered Heading' },
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode {...defaultProps} node={node} />);

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
    });

    test('double-clicking heading placeholder triggers onNumberDoubleClick', () => {
      const onNumberDoubleClick = vi.fn();
      const node: HeadingDocumentNode = {
        id: 'h-no-num',
        number: null,
        type: 'heading',
        contents: { de: 'Unnumbered Heading' },
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode {...defaultProps} node={node} />, {
        callbacks: { onNumberDoubleClick },
      });

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
      fireEvent.doubleClick(placeholder!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'h-no-num');
    });

    test('heading with a number still renders a solid badge (not dashed)', () => {
      const node = createTestNode(); // has number: '1'
      const { container } = renderWithContext(<RecursiveTreeNode {...defaultProps} node={node} />);

      const solidBadge = container.querySelector('.border-blue-200');
      expect(solidBadge).not.toBeNull();
      expect(solidBadge?.classList.contains('border-dashed')).toBe(false);
    });

    test('list item bullet with null number triggers onNumberDoubleClick on double-click', () => {
      const onNumberDoubleClick = vi.fn();
      const node: ContainerDocumentNode = {
        id: 'li-no-num',
        number: null,
        type: 'list_item',
        children: [],
      };
      const { container } = renderWithContext(<RecursiveTreeNode {...defaultProps} node={node} />, {
        callbacks: { onNumberDoubleClick },
      });

      // The bullet marker div
      const bullet = container.querySelector('.rounded-full')?.parentElement;
      expect(bullet).not.toBeNull();
      fireEvent.doubleClick(bullet!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'li-no-num');
    });

    test('footnote with null number renders a dashed placeholder badge', () => {
      const node: LeafDocumentNode = {
        id: 'fn-no-num',
        number: null,
        type: 'footnote',
        contents: { de: 'A footnote' },
      };
      const { container } = renderWithContext(<RecursiveTreeNode {...defaultProps} node={node} />);

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
    });

    test('footnote with a number renders a solid badge that is double-clickable', () => {
      const onNumberDoubleClick = vi.fn();
      const node: LeafDocumentNode = {
        id: 'fn-with-num',
        number: 'i.',
        type: 'footnote',
        contents: { de: 'A footnote' },
      };
      const { container } = renderWithContext(<RecursiveTreeNode {...defaultProps} node={node} />, {
        callbacks: { onNumberDoubleClick },
      });

      const badge = container.querySelector('.border-amber-200');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('i.');
      fireEvent.doubleClick(badge!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'fn-with-num');
    });
  });

  describe('add node buttons', () => {
    test('calls onAddNodeBefore when clicking add-before button', () => {
      const onAddNodeBefore = vi.fn();
      const node = createTestNode();
      const { getByTitle } = renderWithContext(
        <RecursiveTreeNode {...defaultProps} node={node} isSelected={true} />,
        { callbacks: { onAddNodeBefore } }
      );

      fireEvent.click(getByTitle('Add node above'));
      expect(onAddNodeBefore).toHaveBeenCalledWith('h1');
    });

    test('calls onAddNodeAfter when clicking add-after button', () => {
      const onAddNodeAfter = vi.fn();
      const node = createTestNode();
      const { getByTitle } = renderWithContext(
        <RecursiveTreeNode {...defaultProps} node={node} isSelected={true} />,
        { callbacks: { onAddNodeAfter } }
      );

      fireEvent.click(getByTitle('Add node below'));
      expect(onAddNodeAfter).toHaveBeenCalledWith('h1');
    });

    test('hides add buttons when editing', () => {
      const node = createTestNode();
      const { queryByTitle } = renderWithContext(
        <RecursiveTreeNode {...defaultProps} node={node} isSelected={true} isEditing={true} />
      );

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

    test('skips re-render when all props are identical', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const node = createTestNode();
      const props = { ...defaultProps, node };
      expect(compare(props, props)).toBe(true);
    });

    test('triggers re-render when isSelected changes', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const node = createTestNode();
      const prev = { ...defaultProps, node };
      const next = { ...prev, isSelected: true };
      expect(compare(prev, next)).toBe(false);
    });

    test('triggers re-render when isEditing changes', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const node = createTestNode();
      const prev = { ...defaultProps, node };
      const next = { ...prev, isEditing: true };
      expect(compare(prev, next)).toBe(false);
    });

    test('triggers re-render when node reference changes', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const prev = { ...defaultProps, node: createTestNode() };
      const next = { ...defaultProps, node: createTestNode() };
      expect(compare(prev, next)).toBe(false);
    });

    test('triggers re-render when isReceivingParent changes', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const node = createTestNode();
      const prev = { ...defaultProps, node };
      const next = { ...prev, isReceivingParent: true };
      expect(compare(prev, next)).toBe(false);
    });

    test('does not compare selectedIds (no longer a prop)', () => {
      const compare = (RecursiveTreeNode as any).compare as (a: any, b: any) => boolean;
      const node = createTestNode();
      const prev = { ...defaultProps, node, selectedIds: new Set(['a']) };
      const next = { ...defaultProps, node, selectedIds: new Set(['b']) };
      expect(compare(prev, next)).toBe(true);
    });
  });

  describe('cursor style during drag', () => {
    test('shows not-allowed cursor when drop is invalid', () => {
      const node = createTestNode();
      const { container } = renderWithContext(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="top"
          isInvalidDrop={true}
        />
      );

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement.classList.contains('cursor-not-allowed')).toBe(true);
    });

    test('does not show not-allowed cursor when drop is valid', () => {
      const node = createTestNode();
      const { container } = renderWithContext(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="top"
          isInvalidDrop={false}
        />
      );

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement.classList.contains('cursor-not-allowed')).toBe(false);
    });
  });
});

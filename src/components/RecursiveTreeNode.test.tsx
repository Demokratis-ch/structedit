import { fireEvent, render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type {
  ContainerDocumentNode,
  HeadingDocumentNode,
  LeafDocumentNode,
} from '../types/document';
import { RecursiveTreeNode } from './RecursiveTreeNode';

const createTestNode = (): HeadingDocumentNode => ({
  id: 'h1',
  number: '1',
  type: 'heading',
  contents: { de: 'Test Heading' },
  children: [],
});

const defaultProps = {
  depth: 1,
  isSelected: false,
  isEditing: false,
  isDragging: false,
  isDropTarget: false,
  dropPosition: null as 'top' | 'bottom' | null,
  hoveredHandleId: null,
  language: 'de' as const,
  selectedIds: new Set<string>(),
  editingId: null,
  draggedNodeId: null,
  dropTarget: null,
  receivingParentId: null,
  blockRefs: { current: {} },
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
  editingNumberId: null as string | null,
  onNumberDoubleClick: vi.fn(),
  onUpdateNumber: vi.fn(),
};

describe('RecursiveTreeNode', () => {
  describe('drop indicator', () => {
    test('shows blue drop indicator when drop is valid (receivingParentId is set)', () => {
      const node = createTestNode();
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="top"
          draggedNodeId="other-node"
          receivingParentId="some-parent"
        />
      );

      const indicator = container.querySelector('.bg-blue-600');
      expect(indicator).not.toBeNull();
      expect(container.querySelector('.bg-red-500')).toBeNull();
    });

    test('shows red drop indicator when drop is invalid (receivingParentId is null while dragging)', () => {
      const node = createTestNode();
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="top"
          draggedNodeId="other-node"
          receivingParentId={null}
        />
      );

      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).not.toBeNull();
      expect(container.querySelector('.bg-blue-600')).toBeNull();
    });

    test('shows blue indicator at bottom position when valid', () => {
      const node = createTestNode();
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="bottom"
          draggedNodeId="other-node"
          receivingParentId="some-parent"
        />
      );

      const indicator = container.querySelector('.bg-blue-600');
      expect(indicator).not.toBeNull();
      expect(indicator?.classList.contains('-bottom-[3px]')).toBe(true);
    });

    test('shows red indicator at bottom position when invalid', () => {
      const node = createTestNode();
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="bottom"
          draggedNodeId="other-node"
          receivingParentId={null}
        />
      );

      const indicator = container.querySelector('.bg-red-500');
      expect(indicator).not.toBeNull();
      expect(indicator?.classList.contains('-bottom-[3px]')).toBe(true);
    });

    test('does not show indicator when not a drop target', () => {
      const node = createTestNode();
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={false}
          dropPosition={null}
          draggedNodeId="other-node"
          receivingParentId={null}
        />
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
      const { container } = render(<RecursiveTreeNode {...defaultProps} node={node} />);

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
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          onNumberDoubleClick={onNumberDoubleClick}
        />
      );

      const placeholder = container.querySelector('.border-dashed');
      expect(placeholder).not.toBeNull();
      fireEvent.doubleClick(placeholder!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'h-no-num');
    });

    test('heading with a number still renders a solid badge (not dashed)', () => {
      const node = createTestNode(); // has number: '1'
      const { container } = render(<RecursiveTreeNode {...defaultProps} node={node} />);

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
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          onNumberDoubleClick={onNumberDoubleClick}
        />
      );

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
      const { container } = render(<RecursiveTreeNode {...defaultProps} node={node} />);

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
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          onNumberDoubleClick={onNumberDoubleClick}
        />
      );

      const badge = container.querySelector('.border-amber-200');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('i.');
      fireEvent.doubleClick(badge!);
      expect(onNumberDoubleClick).toHaveBeenCalledWith(expect.any(Object), 'fn-with-num');
    });
  });

  describe('cursor style during drag', () => {
    test('shows not-allowed cursor when drop is invalid', () => {
      const node = createTestNode();
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="top"
          draggedNodeId="other-node"
          receivingParentId={null}
        />
      );

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement.classList.contains('cursor-not-allowed')).toBe(true);
    });

    test('does not show not-allowed cursor when drop is valid', () => {
      const node = createTestNode();
      const { container } = render(
        <RecursiveTreeNode
          {...defaultProps}
          node={node}
          isDropTarget={true}
          dropPosition="top"
          draggedNodeId="other-node"
          receivingParentId="some-parent"
        />
      );

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement.classList.contains('cursor-not-allowed')).toBe(false);
    });
  });
});

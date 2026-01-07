import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBlockOperations } from './useBlockOperations';
import { Block } from '../types';

describe('useBlockOperations', () => {
  const mockCommit = vi.fn();
  const mockUpdateHistory = vi.fn();
  const mockSetBlocks = vi.fn();
  const mockSetSelectedIds = vi.fn();
  const mockSetEditingId = vi.fn();

  const initialBlocks: Block[] = [
    { id: '1', content: 'First', type: 'p', depth: 0 },
    { id: '2', content: 'Second', type: 'p', depth: 0 },
    { id: '3', content: 'Third', type: 'p', depth: 0 }
  ];

  const defaultProps = {
    blocks: initialBlocks,
    commit: mockCommit,
    updateHistory: mockUpdateHistory,
    setBlocks: mockSetBlocks,
    selectedIds: new Set<string>(['2']),
    setSelectedIds: mockSetSelectedIds,
    editingId: null,
    setEditingId: mockSetEditingId
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addBlock', () => {
    it('adds block after specified id', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.addBlock('1');
      });

      expect(mockCommit).toHaveBeenCalled();
      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks.length).toBe(4);
      expect(newBlocks[1].content).toBe(''); // new empty block
      expect(newBlocks[2].id).toBe('2'); // shifted
    });

    it('inherits list type from previous block', () => {
      const listBlocks: Block[] = [
        { id: '1', content: 'Item', type: 'ul', depth: 1 }
      ];
      const { result } = renderHook(() => useBlockOperations({
        ...defaultProps,
        blocks: listBlocks
      }));
      
      act(() => {
        result.current.addBlock('1');
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].type).toBe('ul');
      expect(newBlocks[1].depth).toBe(1);
    });

    it('creates first block when empty', () => {
      const { result } = renderHook(() => useBlockOperations({
        ...defaultProps,
        blocks: []
      }));
      
      act(() => {
        result.current.addBlock();
      });

      expect(mockCommit).toHaveBeenCalled();
      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks.length).toBe(1);
      expect(newBlocks[0].type).toBe('p');
    });
  });

  describe('removeBlock', () => {
    it('removes specified block', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.removeBlock('2');
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks.length).toBe(2);
      expect(newBlocks.find((b: Block) => b.id === '2')).toBeUndefined();
    });

    it('selects previous block after removal', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.removeBlock('2');
      });

      expect(mockSetSelectedIds).toHaveBeenCalledWith(new Set(['1']));
    });

    it('does nothing for non-existent id', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.removeBlock('nonexistent');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateType', () => {
    it('updates type for selected blocks', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.bulkUpdateType('h1');
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].type).toBe('h1'); // id '2' is selected
      expect(newBlocks[0].type).toBe('p'); // id '1' unchanged
    });
  });

  describe('bulkDelete', () => {
    it('deletes all selected blocks', () => {
      const { result } = renderHook(() => useBlockOperations({
        ...defaultProps,
        selectedIds: new Set(['1', '3'])
      }));
      
      act(() => {
        result.current.bulkDelete();
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks.length).toBe(1);
      expect(newBlocks[0].id).toBe('2');
    });

    it('does nothing when no selection', () => {
      const { result } = renderHook(() => useBlockOperations({
        ...defaultProps,
        selectedIds: new Set()
      }));
      
      act(() => {
        result.current.bulkDelete();
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('indentSelection (@safety-officer: depth bounds)', () => {
    it('increases depth by 1', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.indentSelection(1);
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].depth).toBe(1); // selected block
      expect(newBlocks[0].depth).toBe(0); // unselected
    });

    it('decreases depth by 1', () => {
      const blocksWithDepth = initialBlocks.map(b => ({ ...b, depth: 2 }));
      const { result } = renderHook(() => useBlockOperations({
        ...defaultProps,
        blocks: blocksWithDepth
      }));
      
      act(() => {
        result.current.indentSelection(-1);
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].depth).toBe(1);
    });

    it('clamps depth minimum at 0', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.indentSelection(-1);
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].depth).toBe(0); // can't go below 0
    });

    it('clamps depth maximum at 5', () => {
      const blocksAtMax = initialBlocks.map(b => ({ ...b, depth: 5 }));
      const { result } = renderHook(() => useBlockOperations({
        ...defaultProps,
        blocks: blocksAtMax
      }));
      
      act(() => {
        result.current.indentSelection(1);
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].depth).toBe(5); // can't exceed 5
    });
  });

  describe('moveBlock', () => {
    it('moves block to new position', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.moveBlock('3', '1');
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[0].id).toBe('3');
      expect(newBlocks[1].id).toBe('1');
    });

    it('does nothing when moving to same position', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.moveBlock('1', '1');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('handleFormat', () => {
    it('wraps content in bold tags', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.handleFormat('bold');
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].content).toBe('<b>Second</b>');
    });

    it('wraps content in italic tags', () => {
      const { result } = renderHook(() => useBlockOperations(defaultProps));
      
      act(() => {
        result.current.handleFormat('italic');
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].content).toBe('<i>Second</i>');
    });

    it('unwraps if already formatted', () => {
      const formattedBlocks = initialBlocks.map(b => 
        b.id === '2' ? { ...b, content: '<b>Second</b>' } : b
      );
      const { result } = renderHook(() => useBlockOperations({
        ...defaultProps,
        blocks: formattedBlocks
      }));
      
      act(() => {
        result.current.handleFormat('bold');
      });

      const newBlocks = mockCommit.mock.calls[0][0];
      expect(newBlocks[1].content).toBe('Second');
    });
  });
});

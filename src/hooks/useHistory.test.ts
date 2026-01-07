import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from './useHistory';
import { Block } from '../types';

describe('useHistory (@safety-officer: Undo is Sacred)', () => {
  const initialBlocks: Block[] = [
    { id: '1', content: 'First', type: 'p', depth: 0 }
  ];

  describe('initialization', () => {
    it('starts with initial blocks', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      expect(result.current.blocks).toEqual(initialBlocks);
    });

    it('starts with historyIndex at 0', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      expect(result.current.historyIndex).toBe(0);
    });

    it('canUndo is false at start', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('commit', () => {
    it('adds new state to history', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      const newBlocks = [...initialBlocks, { id: '2', content: 'Second', type: 'p' as const, depth: 0 }];
      
      act(() => {
        result.current.commit(newBlocks);
      });

      expect(result.current.blocks).toEqual(newBlocks);
      expect(result.current.historyIndex).toBe(1);
      expect(result.current.canUndo).toBe(true);
    });

    it('commit with saveHistory=false does not add to history', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      const newBlocks = [...initialBlocks, { id: '2', content: 'Second', type: 'p' as const, depth: 0 }];
      
      act(() => {
        result.current.commit(newBlocks, false);
      });

      expect(result.current.blocks).toEqual(newBlocks);
      expect(result.current.historyIndex).toBe(0);
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('undo', () => {
    it('restores previous state', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      const newBlocks = [...initialBlocks, { id: '2', content: 'Second', type: 'p' as const, depth: 0 }];
      
      act(() => { result.current.commit(newBlocks); });
      act(() => { result.current.undo(); });

      expect(result.current.blocks).toEqual(initialBlocks);
      expect(result.current.historyIndex).toBe(0);
    });

    it('returns false when nothing to undo', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      
      let undoResult: boolean;
      act(() => {
        undoResult = result.current.undo();
      });

      expect(undoResult!).toBe(false);
    });
  });

  describe('redo', () => {
    it('restores next state after undo', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      const newBlocks = [...initialBlocks, { id: '2', content: 'Second', type: 'p' as const, depth: 0 }];
      
      act(() => { result.current.commit(newBlocks); });
      act(() => { result.current.undo(); });
      act(() => { result.current.redo(); });

      expect(result.current.blocks).toEqual(newBlocks);
    });

    it('returns false when nothing to redo', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      
      let redoResult: boolean;
      act(() => {
        redoResult = result.current.redo();
      });

      expect(redoResult!).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears history and sets new initial state', () => {
      const { result } = renderHook(() => useHistory(initialBlocks));
      const newBlocks = [{ id: 'new', content: 'New doc', type: 'h1' as const, depth: 0 }];
      
      act(() => { result.current.commit([...initialBlocks, { id: '2', content: 'X', type: 'p', depth: 0 }]); });
      act(() => { result.current.reset(newBlocks); });

      expect(result.current.blocks).toEqual(newBlocks);
      expect(result.current.historyIndex).toBe(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });
});

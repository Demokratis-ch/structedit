import { useState, useCallback } from 'react';
import { Block } from '../types';

export const useHistory = (initialBlocks: Block[]) => {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [history, setHistory] = useState<Block[][]>([initialBlocks]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const commit = useCallback((newBlocks: Block[], saveHistory = true) => {
    setBlocks(newBlocks);
    if (saveHistory) {
      setHistory(prev => {
        const currentHistory = prev.slice(0, historyIndex + 1);
        if (currentHistory.length > 50) currentHistory.shift();
        return [...currentHistory, newBlocks];
      });
      setHistoryIndex(prev => prev + 1);
    }
  }, [historyIndex]);

  const updateHistory = useCallback((newBlocks: Block[]) => {
    setHistory(prev => {
      const currentHistory = prev.slice(0, historyIndex + 1);
      if (currentHistory.length > 50) currentHistory.shift();
      return [...currentHistory, newBlocks];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setBlocks(history[prevIndex]);
      setHistoryIndex(prevIndex);
      return true;
    }
    return false;
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setBlocks(history[nextIndex]);
      setHistoryIndex(nextIndex);
      return true;
    }
    return false;
  }, [history, historyIndex]);

  const reset = useCallback((newBlocks: Block[]) => {
    setBlocks(newBlocks);
    setHistory([newBlocks]);
    setHistoryIndex(0);
  }, []);

  return {
    blocks,
    setBlocks,
    history,
    historyIndex,
    commit,
    updateHistory,
    undo,
    redo,
    reset,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1
  };
};

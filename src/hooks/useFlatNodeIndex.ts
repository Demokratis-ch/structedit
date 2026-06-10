import { useMemo } from 'react';
import type { FlattenedNode } from '../types/editor';

/**
 * Memoized lookup from node id to its index in the flattened node list,
 * used for range selection and ordering bulk operations.
 */
export function useFlatNodeIndex(flattenedNodes: FlattenedNode[]): Map<string, number> {
  return useMemo(() => {
    const map = new Map<string, number>();
    flattenedNodes.forEach((fn, idx) => {
      map.set(fn.node.id, idx);
    });
    return map;
  }, [flattenedNodes]);
}

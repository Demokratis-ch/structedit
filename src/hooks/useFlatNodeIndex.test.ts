import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { DocumentRootNode } from '../types/document';
import { flattenForRendering } from '../utils/tree-utils';
import { useFlatNodeIndex } from './useFlatNodeIndex';

const createTestDocument = (): DocumentRootNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [
        {
          id: 'p1',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'First paragraph' },
          children: [],
        },
        {
          id: 'p2',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'Second paragraph' },
          children: [],
        },
      ],
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

// Flat order of the test document: h1, p1, p2, h2.

describe('useFlatNodeIndex', () => {
  test('maps every node id to its flat index', () => {
    const flattenedNodes = flattenForRendering(createTestDocument());
    const { result } = renderHook(() => useFlatNodeIndex(flattenedNodes));

    expect(result.current.size).toBe(flattenedNodes.length);
    flattenedNodes.forEach((fn, idx) => {
      expect(result.current.get(fn.node.id)).toBe(idx);
    });
    expect(result.current.get('h1')).toBe(0);
    expect(result.current.get('p1')).toBe(1);
    expect(result.current.get('p2')).toBe(2);
    expect(result.current.get('h2')).toBe(3);
  });

  test('returns an empty map for an empty array', () => {
    const { result } = renderHook(() => useFlatNodeIndex([]));

    expect(result.current.size).toBe(0);
  });

  test('returns the same map instance while flattenedNodes is unchanged', () => {
    const flattenedNodes = flattenForRendering(createTestDocument());
    const { result, rerender } = renderHook(({ nodes }) => useFlatNodeIndex(nodes), {
      initialProps: { nodes: flattenedNodes },
    });
    const firstMap = result.current;

    rerender({ nodes: flattenedNodes });

    expect(result.current).toBe(firstMap);
  });

  test('rebuilds the map when flattenedNodes changes', () => {
    const flattenedNodes = flattenForRendering(createTestDocument());
    const { result, rerender } = renderHook(({ nodes }) => useFlatNodeIndex(nodes), {
      initialProps: { nodes: flattenedNodes },
    });
    const firstMap = result.current;

    const shorter = flattenedNodes.slice(0, 2);
    rerender({ nodes: shorter });

    expect(result.current).not.toBe(firstMap);
    expect(result.current.size).toBe(2);
    expect(result.current.get('h1')).toBe(0);
    expect(result.current.get('p1')).toBe(1);
    expect(result.current.has('p2')).toBe(false);
  });
});

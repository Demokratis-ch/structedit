import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useResizable } from './useResizable';

describe('useResizable', () => {
  test('returns the default size', () => {
    const { result } = renderHook(() => useResizable({ defaultSize: 400 }));
    expect(result.current.size).toBe(400);
  });

  test('setSize updates the size', () => {
    const { result } = renderHook(() => useResizable({ defaultSize: 400 }));
    act(() => result.current.setSize(600));
    expect(result.current.size).toBe(600);
  });

  test('setSize clamps to minSize', () => {
    const { result } = renderHook(() => useResizable({ defaultSize: 400, minSize: 200 }));
    act(() => result.current.setSize(100));
    expect(result.current.size).toBe(200);
  });

  test('setSize clamps to maxSize', () => {
    const { result } = renderHook(() => useResizable({ defaultSize: 400, maxSize: 600 }));
    act(() => result.current.setSize(800));
    expect(result.current.size).toBe(600);
  });

  test('handleProps has separator role and vertical aria-orientation', () => {
    const { result } = renderHook(() => useResizable({ defaultSize: 400 }));
    expect(result.current.handleProps.role).toBe('separator');
    expect(result.current.handleProps['aria-orientation']).toBe('vertical');
  });

  test('isDragging is false initially', () => {
    const { result } = renderHook(() => useResizable({ defaultSize: 400 }));
    expect(result.current.isDragging).toBe(false);
  });
});

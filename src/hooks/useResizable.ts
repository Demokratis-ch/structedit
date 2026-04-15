import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseResizableOptions {
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
  containerRef?: React.RefObject<HTMLElement | null>;
}

interface UseResizableReturn {
  size: number;
  setSize: (size: number) => void;
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    role: 'separator';
    'aria-orientation': 'vertical';
  };
  isDragging: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useResizable(options: UseResizableOptions): UseResizableReturn {
  const { defaultSize, minSize = 100, maxSize } = options;
  const [size, setSizeRaw] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = options.containerRef ?? internalContainerRef;
  const dragRef = useRef({ startX: 0, startSize: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const clamp = useCallback(
    (value: number) => {
      let clamped = value;
      if (clamped < minSize) clamped = minSize;
      if (maxSize !== undefined && clamped > maxSize) clamped = maxSize;
      return clamped;
    },
    [minSize, maxSize]
  );

  const setSize = useCallback(
    (newSize: number) => {
      setSizeRaw(clamp(newSize));
    },
    [clamp]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragRef.current.startX;
      const newSize = dragRef.current.startSize + delta;

      let effectiveMax = maxSize;
      if (effectiveMax === undefined && containerRef.current) {
        effectiveMax = containerRef.current.clientWidth - minSize;
      }

      let clamped = newSize;
      if (clamped < minSize) clamped = minSize;
      if (effectiveMax !== undefined && clamped > effectiveMax) clamped = effectiveMax;

      setSizeRaw(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minSize, maxSize, containerRef]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startSize: sizeRef.current };
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return {
    size,
    setSize,
    handleProps: {
      onMouseDown,
      role: 'separator' as const,
      'aria-orientation': 'vertical' as const,
    },
    isDragging,
    containerRef: containerRef as React.RefObject<HTMLDivElement | null>,
  };
}

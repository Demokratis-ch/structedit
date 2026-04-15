import type React from 'react';

interface DragHandleProps {
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    role: 'separator';
    'aria-orientation': 'vertical';
  };
  isDragging: boolean;
}

export function DragHandle({ handleProps, isDragging }: DragHandleProps) {
  return (
    <div
      {...handleProps}
      style={{ cursor: 'col-resize' }}
      className={`w-2 shrink-0 flex items-center justify-center group ${
        isDragging ? 'bg-blue-100' : 'hover:bg-gray-100'
      }`}
    >
      <div
        className={`w-0.5 h-8 rounded-full ${
          isDragging ? 'bg-blue-400' : 'bg-gray-300 group-hover:bg-gray-400'
        }`}
      />
    </div>
  );
}

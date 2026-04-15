import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { DragHandle } from './DragHandle';

const defaultHandleProps = {
  onMouseDown: vi.fn(),
  role: 'separator' as const,
  'aria-orientation': 'vertical' as const,
};

describe('DragHandle', () => {
  test('renders an element with separator role', () => {
    render(<DragHandle handleProps={defaultHandleProps} isDragging={false} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  test('has col-resize cursor', () => {
    render(<DragHandle handleProps={defaultHandleProps} isDragging={false} />);
    const handle = screen.getByRole('separator');
    expect(handle).toHaveStyle({ cursor: 'col-resize' });
  });
});

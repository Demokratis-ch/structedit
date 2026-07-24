import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AddQuestionMenu } from './AddQuestionMenu';

describe('AddQuestionMenu', () => {
  test('panel is hidden until the toggle is clicked', () => {
    render(<AddQuestionMenu onInsert={vi.fn()} />);
    expect(screen.queryByTestId('add-question-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('add-question-toggle'));
    expect(screen.getByTestId('add-question-panel')).toBeTruthy();
  });

  test('each flavour calls onInsert with its value and closes the panel', () => {
    const onInsert = vi.fn();
    render(<AddQuestionMenu onInsert={onInsert} />);

    fireEvent.click(screen.getByTestId('add-question-toggle'));
    fireEvent.click(screen.getByTestId('add-question-single'));
    expect(onInsert).toHaveBeenLastCalledWith('single');
    expect(screen.queryByTestId('add-question-panel')).toBeNull();

    fireEvent.click(screen.getByTestId('add-question-toggle'));
    fireEvent.click(screen.getByTestId('add-question-multiple'));
    expect(onInsert).toHaveBeenLastCalledWith('multiple');

    fireEvent.click(screen.getByTestId('add-question-toggle'));
    fireEvent.click(screen.getByTestId('add-question-text'));
    expect(onInsert).toHaveBeenLastCalledWith('text');
  });

  test('closes on Escape', () => {
    render(<AddQuestionMenu onInsert={vi.fn()} />);
    fireEvent.click(screen.getByTestId('add-question-toggle'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('add-question-panel')).toBeNull();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { NodeFormat } from '../types/document';
import { FloatingToolbar } from './FloatingToolbar';

const baseProps = {
  selectedCount: 0,
  isEditing: false,
  selectedNodeType: null,
  onUpdateType: vi.fn(),
  onDelete: vi.fn(),
  onClearSelection: vi.fn(),
  onChangeFormat: vi.fn(),
};

describe('FloatingToolbar — format selector visibility', () => {
  test('hides selector when nothing is selected and not editing', () => {
    const { container } = render(<FloatingToolbar {...baseProps} />);
    expect(container.querySelector('[data-testid="format-selector"]')).toBeNull();
  });

  test('hides selector when selection is multiple', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={3}
        selectedNodeType="content"
        selectedNodeFormat="TEXT"
      />
    );
    expect(screen.queryByTestId('format-selector')).toBeNull();
  });

  test('hides selector when the single selected node is container-only (list)', () => {
    render(<FloatingToolbar {...baseProps} selectedCount={1} selectedNodeType={'list' as never} />);
    expect(screen.queryByTestId('format-selector')).toBeNull();
  });

  test('shows selector when exactly one content-bearing node is selected', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        selectedNodeFormat="TEXT"
      />
    );
    expect(screen.getByTestId('format-selector')).toBeTruthy();
  });
});

describe('FloatingToolbar — format selector options', () => {
  test('lists exactly TEXT, NEWLINES, MARKDOWN_MINIMAL for a heading', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="heading"
        selectedNodeFormat="TEXT"
      />
    );
    const select = screen.getByTestId('format-selector') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['TEXT', 'NEWLINES', 'MARKDOWN_MINIMAL']);
  });

  test('lists TEXT, NEWLINES, MARKDOWN for a content node', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        selectedNodeFormat="TEXT"
      />
    );
    const select = screen.getByTestId('format-selector') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['TEXT', 'NEWLINES', 'MARKDOWN']);
  });

  test('lists TEXT, NEWLINES for an image', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="image"
        selectedNodeFormat="TEXT"
      />
    );
    const select = screen.getByTestId('format-selector') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['TEXT', 'NEWLINES']);
  });
});

describe('FloatingToolbar — onChangeFormat', () => {
  test('selecting a new format calls onChangeFormat once with the chosen value', () => {
    const onChangeFormat = vi.fn();
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        selectedNodeFormat="TEXT"
        onChangeFormat={onChangeFormat}
      />
    );
    const select = screen.getByTestId('format-selector') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'MARKDOWN' } });
    expect(onChangeFormat).toHaveBeenCalledTimes(1);
    expect(onChangeFormat).toHaveBeenCalledWith<[NodeFormat]>('MARKDOWN');
  });

  test('reflects the current format as the selector value', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        selectedNodeFormat="MARKDOWN"
      />
    );
    const select = screen.getByTestId('format-selector') as HTMLSelectElement;
    expect(select.value).toBe('MARKDOWN');
  });

  test('mousedown on the selector is NOT prevented (so the native dropdown opens)', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        selectedNodeFormat="TEXT"
      />
    );
    const select = screen.getByTestId('format-selector') as HTMLSelectElement;
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    select.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(false);
  });

  test('mousedown on a toolbar button IS prevented (preserves editor focus)', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        selectedNodeFormat="TEXT"
      />
    );
    const deleteBtn = screen.getByTitle('Delete Selected');
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    deleteBtn.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
  });
});

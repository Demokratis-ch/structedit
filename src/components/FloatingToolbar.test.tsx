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
  onMoveSelectedToTop: vi.fn(),
  onMoveSelectedToBottom: vi.fn(),
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

describe('FloatingToolbar — inline-marks group visibility', () => {
  test('hidden when nothing is being edited (no inlineMarksTarget)', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        selectedNodeFormat="MARKDOWN"
        isEditing
      />
    );
    expect(screen.queryByTestId('inline-marks-group')).toBeNull();
  });

  test('hidden when target is contenteditable but format is TEXT', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        selectedNodeFormat="TEXT"
        isEditing
        inlineMarksTarget="contenteditable"
        inlineMarksFormat="TEXT"
      />
    );
    expect(screen.queryByTestId('inline-marks-group')).toBeNull();
  });

  test('hidden when target is contenteditable but format is NEWLINES', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        isEditing
        inlineMarksTarget="contenteditable"
        inlineMarksFormat="NEWLINES"
      />
    );
    expect(screen.queryByTestId('inline-marks-group')).toBeNull();
  });

  test.each([
    'MARKDOWN_MINIMAL',
    'MARKDOWN_INLINE',
    'MARKDOWN',
  ] as const)('visible when target is contenteditable and format is %s', (format) => {
    render(
      <FloatingToolbar
        {...baseProps}
        isEditing
        inlineMarksTarget="contenteditable"
        inlineMarksFormat={format}
      />
    );
    expect(screen.getByTestId('inline-marks-group')).toBeTruthy();
  });

  test('visible when target is the number input regardless of node format', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        isEditing
        inlineMarksTarget="input-number"
        inlineMarksFormat="TEXT"
      />
    );
    expect(screen.getByTestId('inline-marks-group')).toBeTruthy();
  });
});

describe('FloatingToolbar — inline-marks buttons', () => {
  const visibleProps = {
    ...baseProps,
    isEditing: true,
    inlineMarksTarget: 'contenteditable' as const,
    inlineMarksFormat: 'MARKDOWN_MINIMAL' as const,
  };

  test('renders one button per mark with aria-pressed reflecting active state', () => {
    const onToggleMark = vi.fn();
    render(
      <FloatingToolbar
        {...visibleProps}
        onToggleMark={onToggleMark}
        markActiveState={{ bold: true, italic: false, strike: false, sup: false, sub: false }}
      />
    );
    expect(screen.getByTestId('inline-mark-bold').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('inline-mark-italic').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('inline-mark-strike').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('inline-mark-sup').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('inline-mark-sub').getAttribute('aria-pressed')).toBe('false');
  });

  test.each([
    'bold',
    'italic',
    'strike',
    'sup',
    'sub',
  ] as const)('clicking %s calls onToggleMark with that mark', (mark) => {
    const onToggleMark = vi.fn();
    render(<FloatingToolbar {...visibleProps} onToggleMark={onToggleMark} />);
    fireEvent.click(screen.getByTestId(`inline-mark-${mark}`));
    expect(onToggleMark).toHaveBeenCalledTimes(1);
    expect(onToggleMark).toHaveBeenCalledWith(mark);
  });

  test('mousedown on each mark button IS prevented (focus preservation)', () => {
    render(<FloatingToolbar {...visibleProps} onToggleMark={vi.fn()} />);
    for (const mark of ['bold', 'italic', 'strike', 'sup', 'sub']) {
      const btn = screen.getByTestId(`inline-mark-${mark}`);
      const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      btn.dispatchEvent(md);
      expect(md.defaultPrevented, `mousedown on ${mark} should be prevented`).toBe(true);
    }
  });
});

describe('FloatingToolbar — move to top/bottom buttons', () => {
  test('renders both buttons when something is selected', () => {
    render(<FloatingToolbar {...baseProps} selectedCount={1} selectedNodeType="content" />);
    expect(screen.getByTestId('move-to-top')).toBeTruthy();
    expect(screen.getByTestId('move-to-bottom')).toBeTruthy();
  });

  test('clicking move-to-top calls onMoveSelectedToTop', () => {
    const onMoveSelectedToTop = vi.fn();
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        onMoveSelectedToTop={onMoveSelectedToTop}
      />
    );
    fireEvent.click(screen.getByTestId('move-to-top'));
    expect(onMoveSelectedToTop).toHaveBeenCalledTimes(1);
  });

  test('clicking move-to-bottom calls onMoveSelectedToBottom', () => {
    const onMoveSelectedToBottom = vi.fn();
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="content"
        onMoveSelectedToBottom={onMoveSelectedToBottom}
      />
    );
    fireEvent.click(screen.getByTestId('move-to-bottom'));
    expect(onMoveSelectedToBottom).toHaveBeenCalledTimes(1);
  });

  test('mousedown on each button IS prevented (focus preservation)', () => {
    render(<FloatingToolbar {...baseProps} selectedCount={1} selectedNodeType="content" />);
    for (const id of ['move-to-top', 'move-to-bottom']) {
      const btn = screen.getByTestId(id);
      const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      btn.dispatchEvent(md);
      expect(md.defaultPrevented, `mousedown on ${id} should be prevented`).toBe(true);
    }
  });
});

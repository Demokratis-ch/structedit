import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { NumberBadge, NumberBadgeDisplay } from './NumberBadge';

describe('NumberBadge', () => {
  const baseProps = {
    nodeId: 'n1',
    isEditing: false,
    onUpdateNumber: vi.fn(),
    onDoubleClick: vi.fn(),
  };

  describe('edit mode', () => {
    test('renders an input carrying the inline-mark targeting attributes', () => {
      const { container } = render(
        <NumberBadge {...baseProps} value="1" isEditing nodeId="h-attr" />
      );
      const input = container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input?.getAttribute('data-structedit-field')).toBe('number');
      expect(input?.getAttribute('data-structedit-node-id')).toBe('h-attr');
    });

    test('shows the raw markdown source (not rendered) so it can be edited', () => {
      const { container } = render(<NumberBadge {...baseProps} value="**1**" isEditing />);
      const input = container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(input?.value).toBe('**1**');
    });

    test('commits the trimmed value on blur', () => {
      const onUpdateNumber = vi.fn();
      const { container } = render(
        <NumberBadge {...baseProps} value="1" isEditing onUpdateNumber={onUpdateNumber} />
      );
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;
      input.value = '  2.  ';
      fireEvent.blur(input);
      expect(onUpdateNumber).toHaveBeenCalledWith('n1', '2.');
    });

    test('commits null when blurred empty', () => {
      const onUpdateNumber = vi.fn();
      const { container } = render(
        <NumberBadge {...baseProps} value="1" isEditing onUpdateNumber={onUpdateNumber} />
      );
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;
      input.value = '   ';
      fireEvent.blur(input);
      expect(onUpdateNumber).toHaveBeenCalledWith('n1', null);
    });

    test('clicks inside the input do not bubble to the surrounding tree row', () => {
      const onParentClick = vi.fn();
      const onParentDoubleClick = vi.fn();
      const { container } = render(
        <div onClick={onParentClick} onDoubleClick={onParentDoubleClick}>
          <NumberBadge {...baseProps} value="1" isEditing />
        </div>
      );
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;
      fireEvent.click(input);
      fireEvent.doubleClick(input);
      expect(onParentClick).not.toHaveBeenCalled();
      expect(onParentDoubleClick).not.toHaveBeenCalled();
    });

    test('Escape reverts to the original value', () => {
      const onUpdateNumber = vi.fn();
      const { container } = render(
        <NumberBadge {...baseProps} value="1" isEditing onUpdateNumber={onUpdateNumber} />
      );
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;
      input.value = 'edited';
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onUpdateNumber).toHaveBeenCalledWith('n1', '1');
    });
  });

  describe('display mode with a value', () => {
    test('renders a solid (non-dashed) bordered box', () => {
      const { container } = render(
        <NumberBadge {...baseProps} value="2." className="border-gray-300" />
      );
      const badge = container.querySelector('.border-gray-300');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('2.');
      expect(badge?.classList.contains('border-dashed')).toBe(false);
    });

    test('renders the value as MARKDOWN_MINIMAL', () => {
      const { container } = render(
        <NumberBadge {...baseProps} value="**1**" className="border-blue-200" />
      );
      const badge = container.querySelector('.border-blue-200');
      expect(badge?.textContent).toBe('1');
      expect(badge?.querySelector('strong')?.textContent).toBe('1');
    });

    test('double-click invokes onDoubleClick with the node id', () => {
      const onDoubleClick = vi.fn();
      const { container } = render(
        <NumberBadge
          {...baseProps}
          value="2."
          className="border-gray-300"
          onDoubleClick={onDoubleClick}
        />
      );
      fireEvent.doubleClick(container.querySelector('.border-gray-300')!);
      expect(onDoubleClick).toHaveBeenCalledWith(expect.anything(), 'n1');
    });
  });

  describe('display mode without a value', () => {
    test('placeholder="dashed" renders a dashed box, double-clickable', () => {
      const onDoubleClick = vi.fn();
      const { container } = render(
        <NumberBadge
          {...baseProps}
          value={null}
          placeholder="dashed"
          onDoubleClick={onDoubleClick}
        />
      );
      const badge = container.querySelector('.border-dashed');
      expect(badge).not.toBeNull();
      fireEvent.doubleClick(badge!);
      expect(onDoubleClick).toHaveBeenCalledWith(expect.anything(), 'n1');
    });

    test('placeholder="bullet" renders a bullet dot, double-clickable', () => {
      const onDoubleClick = vi.fn();
      const { container } = render(
        <NumberBadge
          {...baseProps}
          value={null}
          placeholder="bullet"
          onDoubleClick={onDoubleClick}
        />
      );
      const dot = container.querySelector('.rounded-full');
      expect(dot).not.toBeNull();
      fireEvent.doubleClick(dot!.parentElement!);
      expect(onDoubleClick).toHaveBeenCalledWith(expect.anything(), 'n1');
    });

    test('defaults to the dashed placeholder when none is given', () => {
      const { container } = render(<NumberBadge {...baseProps} value={null} />);
      expect(container.querySelector('.border-dashed')).not.toBeNull();
    });
  });
});

describe('NumberBadgeDisplay', () => {
  test('renders the value as markup and applies the className', () => {
    const { container } = render(<NumberBadgeDisplay value="**1**" className="font-bold mr-1" />);
    expect(container.querySelector('.font-bold')?.querySelector('strong')?.textContent).toBe('1');
  });

  test('renders nothing when there is no value and bullet is off', () => {
    const { container } = render(<NumberBadgeDisplay value={null} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders a bullet when there is no value and bullet is on', () => {
    render(<NumberBadgeDisplay value={null} bullet />);
    expect(screen.getByText('•')).toBeInTheDocument();
  });
});

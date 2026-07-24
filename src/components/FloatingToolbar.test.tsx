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
        selectedNodeType="CONTENT"
        selectedNodeFormat="TEXT"
      />
    );
    expect(screen.queryByTestId('format-selector')).toBeNull();
  });

  test('hides selector when the single selected node is container-only (list)', () => {
    render(<FloatingToolbar {...baseProps} selectedCount={1} selectedNodeType={'LIST' as never} />);
    expect(screen.queryByTestId('format-selector')).toBeNull();
  });

  test('shows selector when exactly one content-bearing node is selected', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="CONTENT"
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
        selectedNodeType="HEADING"
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
        selectedNodeType="CONTENT"
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
        selectedNodeType="IMAGE"
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
        selectedNodeType="CONTENT"
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
        selectedNodeType="CONTENT"
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
        selectedNodeType="CONTENT"
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
        selectedNodeType="CONTENT"
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
        selectedNodeType="CONTENT"
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
        selectedNodeType="CONTENT"
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
    render(<FloatingToolbar {...baseProps} selectedCount={1} selectedNodeType="CONTENT" />);
    expect(screen.getByTestId('move-to-top')).toBeTruthy();
    expect(screen.getByTestId('move-to-bottom')).toBeTruthy();
  });

  test('clicking move-to-top calls onMoveSelectedToTop', () => {
    const onMoveSelectedToTop = vi.fn();
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="CONTENT"
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
        selectedNodeType="CONTENT"
        onMoveSelectedToBottom={onMoveSelectedToBottom}
      />
    );
    fireEvent.click(screen.getByTestId('move-to-bottom'));
    expect(onMoveSelectedToBottom).toHaveBeenCalledTimes(1);
  });

  test('mousedown on each button IS prevented (focus preservation)', () => {
    render(<FloatingToolbar {...baseProps} selectedCount={1} selectedNodeType="CONTENT" />);
    for (const id of ['move-to-top', 'move-to-bottom']) {
      const btn = screen.getByTestId(id);
      const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      btn.dispatchEvent(md);
      expect(md.defaultPrevented, `mousedown on ${id} should be prevented`).toBe(true);
    }
  });
});

describe('FloatingToolbar — merge button', () => {
  test('hidden when selectedCount < 2', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={1}
        selectedNodeType="CONTENT"
        canMerge={false}
        onMerge={vi.fn()}
      />
    );
    expect(screen.queryByTestId('merge-selected')).toBeNull();
  });

  test('hidden while editing', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={3}
        selectedNodeType="CONTENT"
        isEditing={true}
        canMerge={true}
        onMerge={vi.fn()}
      />
    );
    expect(screen.queryByTestId('merge-selected')).toBeNull();
  });

  test('disabled when canMerge is false', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={3}
        selectedNodeType="CONTENT"
        canMerge={false}
        onMerge={vi.fn()}
      />
    );
    const btn = screen.getByTestId('merge-selected') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test('enabled when canMerge is true', () => {
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={3}
        selectedNodeType="CONTENT"
        canMerge={true}
        onMerge={vi.fn()}
      />
    );
    const btn = screen.getByTestId('merge-selected') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  test('clicking the enabled merge button calls onMerge', () => {
    const onMerge = vi.fn();
    render(
      <FloatingToolbar
        {...baseProps}
        selectedCount={3}
        selectedNodeType="CONTENT"
        canMerge={true}
        onMerge={onMerge}
      />
    );
    fireEvent.click(screen.getByTestId('merge-selected'));
    expect(onMerge).toHaveBeenCalledTimes(1);
  });
});

describe('FloatingToolbar — contribution mode picker', () => {
  const modeProps = {
    ...baseProps,
    onChangeContributionMode: vi.fn(),
  };

  // The mode controls live behind a dropdown; open it before querying the panel.
  const openPanel = () => fireEvent.click(screen.getByTestId('contribution-mode-toggle'));

  test('the trigger is hidden when nothing is selected', () => {
    render(<FloatingToolbar {...modeProps} />);
    expect(screen.queryByTestId('contribution-mode-toggle')).toBeNull();
  });

  test('the trigger is hidden while editing', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={1} isEditing={true} />);
    expect(screen.queryByTestId('contribution-mode-toggle')).toBeNull();
  });

  test('the panel stays closed until the trigger is clicked', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={1} selectedNodeType="CONTENT" />);
    expect(screen.getByTestId('contribution-mode-toggle')).toBeTruthy();
    expect(screen.queryByTestId('contribution-mode-group')).toBeNull();
    openPanel();
    expect(screen.getByTestId('contribution-mode-group')).toBeTruthy();
  });

  test('the trigger is shown for a multi selection (containers included)', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={4} />);
    expect(screen.getByTestId('contribution-mode-toggle')).toBeTruthy();
  });

  test('the trigger is icon-only and does not restate the current mode', () => {
    // The mode a node carries is already visible on the node itself (the pill in the tree) and as
    // the active row in the dropdown, so the trigger stays static — no label, no per-mode styling.
    const { rerender } = render(
      <FloatingToolbar {...modeProps} selectedCount={1} selectedNodeMode="REMARK" />
    );
    const toggle = () => screen.getByTestId('contribution-mode-toggle');
    const remarkClass = toggle().className;
    expect(toggle().textContent).toBe('');

    rerender(<FloatingToolbar {...modeProps} selectedCount={2} selectedNodeMode="mixed" />);
    expect(toggle().textContent).toBe('');
    expect(toggle().className).toBe(remarkClass);

    rerender(<FloatingToolbar {...modeProps} selectedCount={1} selectedNodeMode={undefined} />);
    expect(toggle().textContent).toBe('');
    expect(toggle().className).toBe(remarkClass);
  });

  test('the trigger names the control accessibly, since it carries no text', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={1} selectedNodeMode="REMARK" />);
    expect(screen.getByTestId('contribution-mode-toggle')).toHaveAttribute(
      'aria-label',
      'Contribution mode'
    );
  });

  test('disables PROPOSAL when the selection has no proposable node', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={1} selectionHasProposable={false} />);
    openPanel();
    expect(screen.getByTestId('mode-proposal')).toBeDisabled();
  });

  test('enables PROPOSAL when the selection includes a proposable node', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={1} selectionHasProposable={true} />);
    openPanel();
    expect(screen.getByTestId('mode-proposal')).not.toBeDisabled();
  });

  test('each button calls onChangeContributionMode with its value', () => {
    const onChangeContributionMode = vi.fn();
    render(
      <FloatingToolbar
        {...modeProps}
        selectedCount={1}
        selectionHasProposable={true}
        onChangeContributionMode={onChangeContributionMode}
      />
    );
    openPanel();
    fireEvent.click(screen.getByTestId('mode-none'));
    fireEvent.click(screen.getByTestId('mode-remark'));
    fireEvent.click(screen.getByTestId('mode-proposal'));
    fireEvent.click(screen.getByTestId('mode-default'));
    expect(onChangeContributionMode.mock.calls.map((c) => c[0])).toEqual([
      'NONE',
      'REMARK',
      'PROPOSAL',
      undefined,
    ]);
  });

  test('marks the button matching selectedNodeMode as pressed', () => {
    render(
      <FloatingToolbar
        {...modeProps}
        selectedCount={1}
        selectedNodeMode="REMARK"
        selectionHasProposable={true}
      />
    );
    openPanel();
    expect(screen.getByTestId('mode-remark')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mode-none')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('mode-default')).toHaveAttribute('aria-pressed', 'false');
  });

  test('marks Default as pressed when the selection has no mode set', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={1} selectedNodeMode={undefined} />);
    openPanel();
    expect(screen.getByTestId('mode-default')).toHaveAttribute('aria-pressed', 'true');
  });

  test('marks nothing pressed for a mixed selection', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={2} selectedNodeMode="mixed" />);
    openPanel();
    expect(screen.getByTestId('mode-default')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('mode-none')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('mode-remark')).toHaveAttribute('aria-pressed', 'false');
  });

  test('closes on Escape', () => {
    render(<FloatingToolbar {...modeProps} selectedCount={1} selectedNodeType="CONTENT" />);
    openPanel();
    expect(screen.getByTestId('contribution-mode-group')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('contribution-mode-group')).toBeNull();
  });
});

describe('FloatingToolbar — contribution mode keyboard shortcuts', () => {
  const modeProps = {
    ...baseProps,
    selectedCount: 1,
    selectionHasProposable: true,
    onChangeContributionMode: vi.fn(),
  };

  test('pressing "i" opens the dropdown from selection mode', () => {
    render(<FloatingToolbar {...modeProps} selectedNodeType="CONTENT" />);
    expect(screen.queryByTestId('contribution-mode-group')).toBeNull();
    fireEvent.keyDown(document, { key: 'i' });
    expect(screen.getByTestId('contribution-mode-group')).toBeTruthy();
  });

  test('the open shortcut is ignored while typing in an editable target', () => {
    render(<FloatingToolbar {...modeProps} selectedNodeType="CONTENT" />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'i' });
    expect(screen.queryByTestId('contribution-mode-group')).toBeNull();
    input.remove();
  });

  test('the open shortcut is ignored when a modifier is held', () => {
    render(<FloatingToolbar {...modeProps} selectedNodeType="CONTENT" />);
    fireEvent.keyDown(document, { key: 'i', metaKey: true });
    expect(screen.queryByTestId('contribution-mode-group')).toBeNull();
  });

  test.each([
    ['1', undefined],
    ['2', 'NONE'],
    ['3', 'REMARK'],
    ['4', 'PROPOSAL'],
  ] as const)('while open, pressing %s applies its mode and closes', (digit, expected) => {
    const onChangeContributionMode = vi.fn();
    render(
      <FloatingToolbar
        {...modeProps}
        selectedNodeType="CONTENT"
        onChangeContributionMode={onChangeContributionMode}
      />
    );
    fireEvent.keyDown(document, { key: 'i' });
    fireEvent.keyDown(document, { key: digit });
    expect(onChangeContributionMode).toHaveBeenCalledTimes(1);
    expect(onChangeContributionMode).toHaveBeenCalledWith(expected);
    expect(screen.queryByTestId('contribution-mode-group')).toBeNull();
  });

  test('digit keys do nothing while the dropdown is closed', () => {
    const onChangeContributionMode = vi.fn();
    render(
      <FloatingToolbar
        {...modeProps}
        selectedNodeType="CONTENT"
        onChangeContributionMode={onChangeContributionMode}
      />
    );
    fireEvent.keyDown(document, { key: '3' });
    expect(onChangeContributionMode).not.toHaveBeenCalled();
  });

  test('pressing 4 (Proposal) is a no-op when the selection is not proposable', () => {
    const onChangeContributionMode = vi.fn();
    render(
      <FloatingToolbar
        {...modeProps}
        selectionHasProposable={false}
        onChangeContributionMode={onChangeContributionMode}
      />
    );
    fireEvent.keyDown(document, { key: 'i' });
    fireEvent.keyDown(document, { key: '4' });
    expect(onChangeContributionMode).not.toHaveBeenCalled();
    // The panel stays open so the user can pick a valid mode.
    expect(screen.getByTestId('contribution-mode-group')).toBeTruthy();
  });
});

describe('FloatingToolbar — bulk scope & type filter', () => {
  const bulkProps = {
    ...baseProps,
    onChangeContributionMode: vi.fn(),
    onChangeContributionScope: vi.fn(),
    onChangeContributionTypeFilter: vi.fn(),
  };

  const openPanel = () => fireEvent.click(screen.getByTestId('contribution-mode-toggle'));

  test('renders the scope toggle and type filter with a selection', () => {
    render(<FloatingToolbar {...bulkProps} selectedCount={2} />);
    openPanel();
    expect(screen.getByTestId('mode-scope-node')).toBeTruthy();
    expect(screen.getByTestId('mode-scope-subtree')).toBeTruthy();
    expect(screen.getByTestId('mode-type-filter')).toBeTruthy();
  });

  test('reflects the active scope via aria-pressed', () => {
    render(<FloatingToolbar {...bulkProps} selectedCount={1} contributionScope="subtree" />);
    openPanel();
    expect(screen.getByTestId('mode-scope-subtree')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mode-scope-node')).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a scope button calls onChangeContributionScope', () => {
    const onChangeContributionScope = vi.fn();
    render(
      <FloatingToolbar
        {...bulkProps}
        selectedCount={1}
        contributionScope="node"
        onChangeContributionScope={onChangeContributionScope}
      />
    );
    openPanel();
    fireEvent.click(screen.getByTestId('mode-scope-subtree'));
    expect(onChangeContributionScope).toHaveBeenCalledWith('subtree');
  });

  test('the type filter offers all node types and fires onChange', () => {
    const onChangeContributionTypeFilter = vi.fn();
    render(
      <FloatingToolbar
        {...bulkProps}
        selectedCount={1}
        onChangeContributionTypeFilter={onChangeContributionTypeFilter}
      />
    );
    openPanel();
    const filter = screen.getByTestId('mode-type-filter') as HTMLSelectElement;
    const values = Array.from(filter.options).map((o) => o.value);
    expect(values).toEqual(['all', 'HEADING', 'CONTENT', 'FOOTNOTE', 'LIST', 'LIST_ITEM', 'IMAGE']);
    fireEvent.change(filter, { target: { value: 'CONTENT' } });
    expect(onChangeContributionTypeFilter).toHaveBeenCalledWith('CONTENT');
  });

  test('reflects the current type filter value', () => {
    render(<FloatingToolbar {...bulkProps} selectedCount={1} contributionTypeFilter="FOOTNOTE" />);
    openPanel();
    expect((screen.getByTestId('mode-type-filter') as HTMLSelectElement).value).toBe('FOOTNOTE');
  });
});

describe('FloatingToolbar — the question popover', () => {
  const questionProps = {
    ...baseProps,
    selectedCount: 1,
    selectedNodeType: 'CONTENT' as const,
    canWrapInQuestion: true,
    onSelectQuestionFlavour: vi.fn(),
  };

  test('hides the trigger when the selection is neither wrappable nor a question', () => {
    render(<FloatingToolbar {...questionProps} canWrapInQuestion={false} />);
    expect(screen.queryByTestId('make-question-toggle')).toBeNull();
  });

  test('hides the trigger while editing', () => {
    render(<FloatingToolbar {...questionProps} isEditing />);
    expect(screen.queryByTestId('make-question-toggle')).toBeNull();
  });

  test('shows the trigger for a single wrappable content node', () => {
    render(<FloatingToolbar {...questionProps} />);
    expect(screen.getByTestId('make-question-toggle')).toBeTruthy();
  });

  test('shows the trigger for a selection already inside a question', () => {
    render(
      <FloatingToolbar {...questionProps} canWrapInQuestion={false} questionFlavour="single" />
    );
    expect(screen.getByTestId('make-question-toggle')).toBeTruthy();
  });

  test('the panel is closed until the trigger is clicked', () => {
    render(<FloatingToolbar {...questionProps} />);
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('make-question-toggle'));
    expect(screen.getByTestId('make-question-panel')).toBeTruthy();
  });

  test('offers the three flavours and reports the chosen one', () => {
    const onSelectQuestionFlavour = vi.fn();
    render(
      <FloatingToolbar {...questionProps} onSelectQuestionFlavour={onSelectQuestionFlavour} />
    );
    fireEvent.click(screen.getByTestId('make-question-toggle'));
    fireEvent.click(screen.getByTestId('make-question-multiple'));
    expect(onSelectQuestionFlavour).toHaveBeenCalledWith('multiple');

    fireEvent.click(screen.getByTestId('make-question-toggle'));
    fireEvent.click(screen.getByTestId('make-question-single'));
    expect(onSelectQuestionFlavour).toHaveBeenCalledWith('single');

    fireEvent.click(screen.getByTestId('make-question-toggle'));
    fireEvent.click(screen.getByTestId('make-question-text'));
    expect(onSelectQuestionFlavour).toHaveBeenCalledWith('text');
  });

  test('marks the current flavour as active for an existing question', () => {
    render(
      <FloatingToolbar {...questionProps} canWrapInQuestion={false} questionFlavour="multiple" />
    );
    fireEvent.click(screen.getByTestId('make-question-toggle'));
    expect(screen.getByTestId('make-question-multiple')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('make-question-single')).toHaveAttribute('aria-pressed', 'false');
  });

  test('marks no flavour active when the node is not yet a question', () => {
    render(<FloatingToolbar {...questionProps} />);
    fireEvent.click(screen.getByTestId('make-question-toggle'));
    for (const f of ['single', 'multiple', 'text']) {
      expect(screen.getByTestId(`make-question-${f}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('the trigger is icon-only, naming its purpose and the current flavour accessibly', () => {
    const { rerender } = render(<FloatingToolbar {...questionProps} />);
    const toggle = () => screen.getByTestId('make-question-toggle');
    // No visible text — the meaning lives in the accessible name and the tooltip.
    expect(toggle().textContent).toBe('');
    expect(toggle()).toHaveAttribute('aria-label', 'Make a question');

    rerender(
      <FloatingToolbar {...questionProps} canWrapInQuestion={false} questionFlavour="text" />
    );
    expect(toggle().textContent).toBe('');
    expect(toggle()).toHaveAttribute('aria-label', 'Question type: Free text');
  });

  test('closes the panel after a flavour is picked', () => {
    render(<FloatingToolbar {...questionProps} />);
    fireEvent.click(screen.getByTestId('make-question-toggle'));
    fireEvent.click(screen.getByTestId('make-question-single'));
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
  });

  test('closes the panel on Escape', () => {
    render(<FloatingToolbar {...questionProps} />);
    fireEvent.click(screen.getByTestId('make-question-toggle'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
  });
});

describe('FloatingToolbar — question keyboard shortcuts', () => {
  const questionProps = {
    ...baseProps,
    selectedCount: 1,
    selectedNodeType: 'CONTENT' as const,
    canWrapInQuestion: true,
    onSelectQuestionFlavour: vi.fn(),
  };

  test('pressing "q" opens the panel from selection mode', () => {
    render(<FloatingToolbar {...questionProps} />);
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
    fireEvent.keyDown(document, { key: 'q' });
    expect(screen.getByTestId('make-question-panel')).toBeTruthy();
  });

  test('"q" also opens it for a selection already inside a question', () => {
    render(
      <FloatingToolbar {...questionProps} canWrapInQuestion={false} questionFlavour="single" />
    );
    fireEvent.keyDown(document, { key: 'q' });
    expect(screen.getByTestId('make-question-panel')).toBeTruthy();
  });

  test('the open shortcut is ignored while typing in an editable target', () => {
    render(<FloatingToolbar {...questionProps} />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'q' });
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
    input.remove();
  });

  test('the open shortcut is ignored when a modifier is held', () => {
    render(<FloatingToolbar {...questionProps} />);
    fireEvent.keyDown(document, { key: 'q', metaKey: true });
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
  });

  test.each([
    ['1', 'single'],
    ['2', 'multiple'],
    ['3', 'text'],
  ] as const)('while open, pressing %s picks its flavour and closes', (digit, expected) => {
    const onSelectQuestionFlavour = vi.fn();
    render(
      <FloatingToolbar {...questionProps} onSelectQuestionFlavour={onSelectQuestionFlavour} />
    );
    fireEvent.keyDown(document, { key: 'q' });
    fireEvent.keyDown(document, { key: digit });
    expect(onSelectQuestionFlavour).toHaveBeenCalledTimes(1);
    expect(onSelectQuestionFlavour).toHaveBeenCalledWith(expected);
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
  });

  test('digit keys do nothing while the panel is closed', () => {
    const onSelectQuestionFlavour = vi.fn();
    render(
      <FloatingToolbar {...questionProps} onSelectQuestionFlavour={onSelectQuestionFlavour} />
    );
    fireEvent.keyDown(document, { key: '2' });
    expect(onSelectQuestionFlavour).not.toHaveBeenCalled();
  });

  test('4 is not bound (only three flavours exist)', () => {
    const onSelectQuestionFlavour = vi.fn();
    render(
      <FloatingToolbar {...questionProps} onSelectQuestionFlavour={onSelectQuestionFlavour} />
    );
    fireEvent.keyDown(document, { key: 'q' });
    fireEvent.keyDown(document, { key: '4' });
    expect(onSelectQuestionFlavour).not.toHaveBeenCalled();
    expect(screen.getByTestId('make-question-panel')).toBeTruthy();
  });

  test('the mode popover keeps its own digits when it is the open one', () => {
    // Both popovers are mounted for a question selection; only the open one may consume digits.
    const onSelectQuestionFlavour = vi.fn();
    const onChangeContributionMode = vi.fn();
    render(
      <FloatingToolbar
        {...questionProps}
        questionFlavour="single"
        onSelectQuestionFlavour={onSelectQuestionFlavour}
        onChangeContributionMode={onChangeContributionMode}
      />
    );
    fireEvent.keyDown(document, { key: 'i' });
    fireEvent.keyDown(document, { key: '2' });
    expect(onChangeContributionMode).toHaveBeenCalledWith('NONE');
    expect(onSelectQuestionFlavour).not.toHaveBeenCalled();
  });
});

describe('FloatingToolbar — only one popover open at a time', () => {
  // Both popovers are mounted for a question selection and both consume digits, so opening one must
  // close the other or a single digit press would be handled twice.
  const bothProps = {
    ...baseProps,
    selectedCount: 1,
    selectedNodeType: 'CONTENT' as const,
    questionFlavour: 'single' as const,
    onSelectQuestionFlavour: vi.fn(),
    onChangeContributionMode: vi.fn(),
  };

  test('opening the mode panel closes the question panel', () => {
    render(<FloatingToolbar {...bothProps} />);
    fireEvent.keyDown(document, { key: 'q' });
    fireEvent.keyDown(document, { key: 'i' });
    expect(screen.getByTestId('contribution-mode-group')).toBeTruthy();
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
  });

  test('opening the question panel closes the mode panel', () => {
    render(<FloatingToolbar {...bothProps} />);
    fireEvent.keyDown(document, { key: 'i' });
    fireEvent.keyDown(document, { key: 'q' });
    expect(screen.getByTestId('make-question-panel')).toBeTruthy();
    expect(screen.queryByTestId('contribution-mode-group')).toBeNull();
  });

  test('a digit is handled by exactly one popover', () => {
    const onSelectQuestionFlavour = vi.fn();
    const onChangeContributionMode = vi.fn();
    render(
      <FloatingToolbar
        {...bothProps}
        onSelectQuestionFlavour={onSelectQuestionFlavour}
        onChangeContributionMode={onChangeContributionMode}
      />
    );
    fireEvent.keyDown(document, { key: 'q' });
    fireEvent.keyDown(document, { key: 'i' });
    fireEvent.keyDown(document, { key: '2' });
    expect(onChangeContributionMode).toHaveBeenCalledTimes(1);
    expect(onSelectQuestionFlavour).not.toHaveBeenCalled();
  });

  test('clicking one trigger closes the other panel', () => {
    render(<FloatingToolbar {...bothProps} />);
    fireEvent.click(screen.getByTestId('make-question-toggle'));
    expect(screen.getByTestId('make-question-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('contribution-mode-toggle'));
    expect(screen.getByTestId('contribution-mode-group')).toBeTruthy();
    expect(screen.queryByTestId('make-question-panel')).toBeNull();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { DocumentContributionModeMenu } from './DocumentContributionModeMenu';

describe('DocumentContributionModeMenu', () => {
  test('panel is hidden until the toggle is clicked', () => {
    render(<DocumentContributionModeMenu onApply={vi.fn()} />);
    expect(screen.queryByTestId('document-contribution-mode-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    expect(screen.getByTestId('document-contribution-mode-panel')).toBeTruthy();
  });

  test('applies a mode with no type filter by default', () => {
    const onApply = vi.fn();
    render(<DocumentContributionModeMenu onApply={onApply} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    fireEvent.click(screen.getByTestId('doc-mode-remark'));
    expect(onApply).toHaveBeenCalledWith('REMARK', undefined);
  });

  test('Default applies undefined (clears the mode)', () => {
    const onApply = vi.fn();
    render(<DocumentContributionModeMenu onApply={onApply} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    fireEvent.click(screen.getByTestId('doc-mode-default'));
    expect(onApply).toHaveBeenCalledWith(undefined, undefined);
  });

  test('passes the chosen node-type filter', () => {
    const onApply = vi.fn();
    render(<DocumentContributionModeMenu onApply={onApply} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    fireEvent.change(screen.getByTestId('doc-mode-type-filter'), { target: { value: 'FOOTNOTE' } });
    fireEvent.click(screen.getByTestId('doc-mode-none'));
    expect(onApply).toHaveBeenCalledWith('NONE', 'FOOTNOTE');
  });

  test('closes the panel after applying', () => {
    render(<DocumentContributionModeMenu onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    fireEvent.click(screen.getByTestId('doc-mode-remark'));
    expect(screen.queryByTestId('document-contribution-mode-panel')).toBeNull();
  });

  test('closes on Escape', () => {
    render(<DocumentContributionModeMenu onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('document-contribution-mode-panel')).toBeNull();
  });
});

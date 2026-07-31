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

  test('disables Proposal when the type filter names a non-proposable type', () => {
    const onApply = vi.fn();
    render(<DocumentContributionModeMenu onApply={onApply} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    // A LIST can never hold PROPOSAL, so applying it document-wide would silently do nothing.
    fireEvent.change(screen.getByTestId('doc-mode-type-filter'), { target: { value: 'LIST' } });
    expect(screen.getByTestId('doc-mode-proposal')).toBeDisabled();
    fireEvent.click(screen.getByTestId('doc-mode-proposal'));
    expect(onApply).not.toHaveBeenCalled();
  });

  test('re-enables Proposal when the filter moves back to a proposable type', () => {
    render(<DocumentContributionModeMenu onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    fireEvent.change(screen.getByTestId('doc-mode-type-filter'), { target: { value: 'LIST' } });
    expect(screen.getByTestId('doc-mode-proposal')).toBeDisabled();
    fireEvent.change(screen.getByTestId('doc-mode-type-filter'), { target: { value: 'FOOTNOTE' } });
    expect(screen.getByTestId('doc-mode-proposal')).not.toBeDisabled();
  });

  test('leaves Proposal enabled for the unfiltered (all types) apply', () => {
    render(<DocumentContributionModeMenu onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    expect(screen.getByTestId('doc-mode-proposal')).not.toBeDisabled();
  });

  test('the other modes stay enabled under a non-proposable filter', () => {
    render(<DocumentContributionModeMenu onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('document-contribution-mode-toggle'));
    fireEvent.change(screen.getByTestId('doc-mode-type-filter'), { target: { value: 'LIST' } });
    expect(screen.getByTestId('doc-mode-none')).not.toBeDisabled();
    expect(screen.getByTestId('doc-mode-remark')).not.toBeDisabled();
    expect(screen.getByTestId('doc-mode-default')).not.toBeDisabled();
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

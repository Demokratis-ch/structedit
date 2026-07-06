import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const noop = () => {};

function renderWithName(onRename: (name: string) => void = noop) {
  return render(<Header documentName="entwurf.docx" onRename={onRename} />);
}

function startEditing(): HTMLInputElement {
  fireEvent.doubleClick(screen.getByText('entwurf.docx'));
  return screen.getByRole('textbox') as HTMLInputElement;
}

describe('Header', () => {
  it('renders Demokratis and StructEdit breadcrumb without a document name', () => {
    render(<Header onRename={noop} />);
    expect(screen.getByText('Demokratis')).toBeInTheDocument();
    expect(screen.getByText(/StructEdit/)).toBeInTheDocument();
    expect(screen.queryByText('entwurf.docx')).not.toBeInTheDocument();
  });

  it('shows the document name in the breadcrumb when provided', () => {
    renderWithName();
    expect(screen.getByText('entwurf.docx')).toBeInTheDocument();
  });

  it('double-clicking the title replaces it with a focused input holding the current name', () => {
    renderWithName();
    const input = startEditing();
    expect(input.value).toBe('entwurf.docx');
    expect(input).toHaveFocus();
  });

  it('the title is keyboard-reachable and Enter starts editing', () => {
    renderWithName();
    const title = screen.getByRole('button', { name: 'entwurf.docx' });

    fireEvent.keyDown(title, { key: 'Enter' });

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('entwurf.docx');
  });

  it('Space also starts editing, like an ARIA button', () => {
    renderWithName();
    fireEvent.keyDown(screen.getByRole('button', { name: 'entwurf.docx' }), { key: ' ' });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('the rename input has an accessible label', () => {
    renderWithName();
    startEditing();
    expect(screen.getByRole('textbox', { name: /document title/i })).toBeInTheDocument();
  });

  it('Enter commits the new name via onRename exactly once and returns to display mode', () => {
    const onRename = vi.fn();
    renderWithName(onRename);
    const input = startEditing();

    fireEvent.change(input, { target: { value: 'Vernehmlassung Q3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledExactlyOnceWith('Vernehmlassung Q3');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('blur commits like Enter', () => {
    const onRename = vi.fn();
    renderWithName(onRename);
    const input = startEditing();

    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.blur(input);

    expect(onRename).toHaveBeenCalledExactlyOnceWith('Renamed');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Escape cancels without calling onRename', () => {
    const onRename = vi.fn();
    renderWithName(onRename);
    const input = startEditing();

    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    // In a real browser the unmounting input still emits a focusout, which must
    // not commit. jsdom doesn't deliver events to detached nodes, so this blur
    // is a no-op here — the guard itself is only exercisable in a browser.
    fireEvent.blur(input);

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText('entwurf.docx')).toBeInTheDocument();
  });

  it('whitespace-only input cancels without calling onRename', () => {
    const onRename = vi.fn();
    renderWithName(onRename);
    const input = startEditing();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText('entwurf.docx')).toBeInTheDocument();
  });

  it('committing an unchanged name does not call onRename', () => {
    const onRename = vi.fn();
    renderWithName(onRename);
    const input = startEditing();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText('entwurf.docx')).toBeInTheDocument();
  });

  it('trims the committed value', () => {
    const onRename = vi.fn();
    renderWithName(onRename);
    const input = startEditing();

    fireEvent.change(input, { target: { value: '  New Title  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('New Title');
  });
});

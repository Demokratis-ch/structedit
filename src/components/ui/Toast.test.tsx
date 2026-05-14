import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast, useToast } from './Toast';

function ShowToastButton({ message, label = 'show' }: { message: string; label?: string }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message)}>
      {label}
    </button>
  );
}

/**
 * Radix Toast renders a *visible* toast inside a `region` viewport (as a `<li>`)
 * and a separate sr-only `role="status"` live region whose content is populated
 * after a brief announce delay. Tests assert against the visible viewport, not
 * the live region — that's what the user actually sees.
 */
function toastViewport() {
  return screen.queryByRole('region', { name: /notifications/i });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
  cleanup();
});

describe('Toast', () => {
  it('renders nothing visible when no toast has been shown', () => {
    render(<Toast />);
    // The viewport itself may or may not be present, but no toast item should be.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('shows the message after showToast is called', () => {
    render(
      <>
        <Toast />
        <ShowToastButton message="Storage full" />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    const viewport = toastViewport();
    expect(viewport).not.toBeNull();
    expect(within(viewport!).getByText('Storage full')).toBeInTheDocument();
  });

  it('auto-dismisses after 5 seconds', () => {
    render(
      <>
        <Toast />
        <ShowToastButton message="bye soon" />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(within(toastViewport()!).getByText('bye soon')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('bye soon')).toBeNull();
  });

  it('dismisses immediately when the close button is clicked', () => {
    render(
      <>
        <Toast />
        <ShowToastButton message="dismissable" />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('dismissable')).toBeNull();
  });

  it('a second showToast replaces the first message (single-slot, no stacking)', () => {
    render(
      <>
        <Toast />
        <ShowToastButton message="first" label="first" />
        <ShowToastButton message="second" label="second" />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'first' }));
    expect(within(toastViewport()!).getByText('first')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'second' }));
    expect(within(toastViewport()!).getByText('second')).toBeInTheDocument();
    expect(within(toastViewport()!).queryByText('first')).toBeNull();
    // Only one toast visible at a time
    expect(within(toastViewport()!).getAllByRole('listitem')).toHaveLength(1);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { REMOTE_LOAD_MESSAGES, type RemoteLoadErrorReason } from '../utils/remote-document';
import { RemoteLoadErrorView, RemoteLoadingView } from './RemoteDocumentStatus';

describe('RemoteLoadingView', () => {
  it('renders a visible loading indicator', () => {
    render(<RemoteLoadingView />);
    expect(screen.getByText(/loading document from demokratis\.ch/i)).toBeInTheDocument();
  });
});

describe('RemoteLoadErrorView', () => {
  const ALL_REASONS: RemoteLoadErrorReason[] = [
    'expired',
    'not-found',
    'network',
    'unsupported-content',
    'forbidden-host',
    'malformed',
  ];

  it('renders the verbatim expiry message for an expired link', () => {
    render(<RemoteLoadErrorView reason="expired" onGoToUpload={() => {}} />);
    expect(screen.getByText('Link expired, re-open from demokratis.ch.')).toBeInTheDocument();
  });

  it('renders a message distinct from the expiry copy for a 404', () => {
    render(<RemoteLoadErrorView reason="not-found" onGoToUpload={() => {}} />);
    expect(screen.queryByText('Link expired, re-open from demokratis.ch.')).not.toBeInTheDocument();
    expect(screen.getByText(REMOTE_LOAD_MESSAGES['not-found'])).toBeInTheDocument();
  });

  it.each(ALL_REASONS)('renders the mapped message for reason "%s"', (reason) => {
    render(<RemoteLoadErrorView reason={reason} onGoToUpload={() => {}} />);
    expect(screen.getByText(REMOTE_LOAD_MESSAGES[reason])).toBeInTheDocument();
  });

  it('invokes onGoToUpload when the action is clicked', () => {
    const onGoToUpload = vi.fn();
    render(<RemoteLoadErrorView reason="network" onGoToUpload={onGoToUpload} />);
    fireEvent.click(screen.getByRole('button', { name: /go to upload/i }));
    expect(onGoToUpload).toHaveBeenCalledTimes(1);
  });
});

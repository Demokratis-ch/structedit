import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import { LeftPane } from './LeftPane';

const makeDoc = (...children: ContainerDocumentNode['children']): ContainerDocumentNode => ({
  id: 'root',
  number: null,
  type: 'document',
  children,
});

const docWithHeading = makeDoc({
  id: 'h1',
  number: '1',
  type: 'heading',
  format: 'TEXT',
  contents: { de: 'Heading One' },
  children: [],
});

describe('LeftPane', () => {
  test('renders both tabs when documentUrl is provided', () => {
    render(
      <LeftPane
        documentUrl="http://example.com/doc.html"
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    expect(screen.getByRole('tab', { name: /original/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /preview/i })).toBeInTheDocument();
  });

  test('shows Original tab content by default when documentUrl exists', () => {
    render(
      <LeftPane
        documentUrl="http://example.com/doc.html"
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    expect(screen.getByRole('tab', { name: /original/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/may not correspond/i)).toBeInTheDocument();
  });

  test('shows Preview tab by default when documentUrl is null', () => {
    render(
      <LeftPane
        documentUrl={null}
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    expect(screen.queryByRole('tab', { name: /original/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /preview/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('shows processing warning in Original tab', () => {
    render(
      <LeftPane
        documentUrl="http://example.com/doc.html"
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    expect(screen.getByText(/may not correspond/i)).toBeInTheDocument();
  });

  test('Preview tab shows rendered document content', async () => {
    const user = userEvent.setup();
    render(
      <LeftPane
        documentUrl="http://example.com/doc.html"
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    await user.click(screen.getByRole('tab', { name: /preview/i }));

    expect(screen.getByRole('tab', { name: /preview/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 1, name: /heading one/i })).toBeInTheDocument();
  });

  test('passes onHeadingClick through to DocumentPreview TOC', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <LeftPane
        documentUrl={null}
        document={docWithHeading}
        language="de"
        onHeadingClick={onClick}
      />
    );

    // Click the heading in the TOC
    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
    await user.click(within(toc).getByText('Heading One'));
    expect(onClick).toHaveBeenCalledWith('h1');
  });
});

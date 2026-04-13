import { render, screen } from '@testing-library/react';
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
  contents: { de: 'Heading One' },
  children: [],
});

describe('LeftPane', () => {
  test('renders both tabs when pdfUrl is provided', () => {
    render(
      <LeftPane
        pdfUrl="http://example.com/doc.html"
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    expect(screen.getByRole('tab', { name: /original/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /outline/i })).toBeInTheDocument();
  });

  test('shows Original tab content by default when pdfUrl exists', () => {
    render(
      <LeftPane
        pdfUrl="http://example.com/doc.html"
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    // The Original tab should be selected
    expect(screen.getByRole('tab', { name: /original/i })).toHaveAttribute('aria-selected', 'true');
    // Should show the processing warning
    expect(screen.getByText(/may not correspond/i)).toBeInTheDocument();
  });

  test('switches to Outline tab on click', async () => {
    const user = userEvent.setup();
    render(
      <LeftPane
        pdfUrl="http://example.com/doc.html"
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    await user.click(screen.getByRole('tab', { name: /outline/i }));

    expect(screen.getByRole('tab', { name: /outline/i })).toHaveAttribute('aria-selected', 'true');
    // Outline content should be visible
    expect(screen.getByText('Heading One')).toBeInTheDocument();
  });

  test('only shows Outline tab when pdfUrl is null', () => {
    render(
      <LeftPane pdfUrl={null} document={docWithHeading} language="de" onHeadingClick={() => {}} />
    );

    expect(screen.queryByRole('tab', { name: /original/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /outline/i })).toBeInTheDocument();
    // Outline content should be visible by default
    expect(screen.getByText('Heading One')).toBeInTheDocument();
  });

  test('shows processing warning in Original tab', () => {
    render(
      <LeftPane
        pdfUrl="http://example.com/doc.html"
        document={docWithHeading}
        language="de"
        onHeadingClick={() => {}}
      />
    );

    expect(screen.getByText(/may not correspond/i)).toBeInTheDocument();
  });

  test('passes onHeadingClick through to DocumentOutline', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <LeftPane pdfUrl={null} document={docWithHeading} language="de" onHeadingClick={onClick} />
    );

    await user.click(screen.getByText('Heading One'));
    expect(onClick).toHaveBeenCalledWith('h1');
  });
});

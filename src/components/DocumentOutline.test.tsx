import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import { DocumentOutline } from './DocumentOutline';

const makeDoc = (...children: ContainerDocumentNode['children']): ContainerDocumentNode => ({
  id: 'root',
  number: null,
  type: 'document',
  children,
});

describe('DocumentOutline', () => {
  test('renders heading entries with correct indentation', () => {
    const doc = makeDoc({
      id: 'h1',
      number: '1',
      type: 'heading',
      contents: { de: 'Top Level' },
      children: [
        {
          id: 'h2',
          number: '1.1',
          type: 'heading',
          contents: { de: 'Nested' },
          children: [],
        },
      ],
    });
    render(<DocumentOutline document={doc} language="de" onHeadingClick={() => {}} />);

    expect(screen.getByText('Top Level')).toBeInTheDocument();
    expect(screen.getByText('Nested')).toBeInTheDocument();
  });

  test('calls onHeadingClick with node ID when heading is clicked', () => {
    const onClick = vi.fn();
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Click me' },
      children: [],
    });
    render(<DocumentOutline document={doc} language="de" onHeadingClick={onClick} />);

    fireEvent.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledWith('h1');
  });

  test('shows heading numbers when present', () => {
    const doc = makeDoc({
      id: 'h1',
      number: 'Art. 1',
      type: 'heading',
      contents: { de: 'First Article' },
      children: [],
    });
    render(<DocumentOutline document={doc} language="de" onHeadingClick={() => {}} />);

    expect(screen.getByText('Art. 1')).toBeInTheDocument();
    expect(screen.getByText('First Article')).toBeInTheDocument();
  });

  test('renders empty state when no headings exist', () => {
    const doc = makeDoc({
      id: 'c1',
      number: null,
      type: 'content',
      contents: { de: 'Text' },
      children: [],
    });
    render(<DocumentOutline document={doc} language="de" onHeadingClick={() => {}} />);

    expect(screen.getByText(/no headings/i)).toBeInTheDocument();
  });
});

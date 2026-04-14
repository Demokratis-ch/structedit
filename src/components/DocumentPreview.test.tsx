import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import { DocumentPreview } from './DocumentPreview';

const makeDoc = (...children: ContainerDocumentNode['children']): ContainerDocumentNode => ({
  id: 'root',
  number: null,
  type: 'document',
  children,
});

describe('DocumentPreview', () => {
  test('renders empty document without crashing', () => {
    const doc = makeDoc();
    const { container } = render(<DocumentPreview document={doc} language="de" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  test('renders heading nodes with correct heading levels based on depth', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Top Heading' },
      children: [
        {
          id: 'h2',
          number: null,
          type: 'heading',
          contents: { de: 'Sub Heading' },
          children: [],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Top Heading');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sub Heading');
  });

  test('renders heading number before heading text', () => {
    const doc = makeDoc({
      id: 'h1',
      number: 'Art. 1',
      type: 'heading',
      contents: { de: 'Gegenstand' },
      children: [],
    });

    render(<DocumentPreview document={doc} language="de" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Art. 1');
    expect(heading).toHaveTextContent('Gegenstand');
  });

  test('renders content nodes as paragraphs', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'c1',
          number: null,
          type: 'content',
          contents: { de: 'First paragraph text.' },
          children: [],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    expect(screen.getByText('First paragraph text.')).toBeInTheDocument();
  });

  test('renders content node with superscript number', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'c1',
          number: '1',
          type: 'content',
          contents: { de: 'Paragraph with number.' },
          children: [],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    const sup = screen.getByText('1');
    expect(sup.tagName).toBe('SUP');
  });

  test('renders list items with their number labels', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
          number: null,
          type: 'list',
          children: [
            {
              id: 'li1',
              number: 'a)',
              type: 'list_item',
              children: [
                {
                  id: 'c1',
                  number: null,
                  type: 'content',
                  contents: { de: 'First item text.' },
                  children: [],
                },
              ],
            },
            {
              id: 'li2',
              number: 'b)',
              type: 'list_item',
              children: [
                {
                  id: 'c2',
                  number: null,
                  type: 'content',
                  contents: { de: 'Second item text.' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    // Numbers should be rendered as superscript
    const labelA = screen.getByText('a)');
    expect(labelA.tagName).toBe('SUP');
    const labelB = screen.getByText('b)');
    expect(labelB.tagName).toBe('SUP');
    expect(screen.getByText('First item text.')).toBeInTheDocument();
    expect(screen.getByText('Second item text.')).toBeInTheDocument();
  });

  test('renders footnotes in a collapsible details element', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'c1',
          number: null,
          type: 'content',
          contents: { de: 'Some text.' },
          children: [
            {
              id: 'fn1',
              number: '1',
              type: 'footnote',
              contents: { de: 'Footnote text here.' },
            },
          ],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    // Should have a details/summary for footnotes
    const summary = screen.getByText(/fussnote/i);
    expect(summary.closest('details')).toBeInTheDocument();
    expect(screen.getByText('Footnote text here.')).toBeInTheDocument();
  });

  test('uses correct language content', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'German Title', fr: 'French Title' },
      children: [],
    });

    const { rerender } = render(<DocumentPreview document={doc} language="de" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('German Title');

    rerender(<DocumentPreview document={doc} language="fr" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('French Title');
  });

  test('caps heading levels at h4 for deeply nested headings', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Level 1' },
      children: [
        {
          id: 'h2',
          number: null,
          type: 'heading',
          contents: { de: 'Level 2' },
          children: [
            {
              id: 'h3',
              number: null,
              type: 'heading',
              contents: { de: 'Level 3' },
              children: [
                {
                  id: 'h4',
                  number: null,
                  type: 'heading',
                  contents: { de: 'Level 4' },
                  children: [
                    {
                      id: 'h5',
                      number: null,
                      type: 'heading',
                      contents: { de: 'Level 5' },
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    // Level 5 should still be h4 (capped)
    const headings = screen.getAllByRole('heading', { level: 4 });
    expect(headings).toHaveLength(2); // Level 4 and Level 5 both capped at h4
  });

  test('renders footnotes that are direct children of the document root', () => {
    const doc = makeDoc(
      {
        id: 'c1',
        number: null,
        type: 'content',
        contents: { de: 'Some text.' },
        children: [],
      },
      {
        id: 'fn1',
        number: '1',
        type: 'footnote',
        contents: { de: 'Root-level footnote.' },
      }
    );

    render(<DocumentPreview document={doc} language="de" />);
    expect(screen.getByText('Root-level footnote.')).toBeInTheDocument();
  });

  test('renders footnotes that are children of list_item nodes', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
          number: null,
          type: 'list',
          children: [
            {
              id: 'li1',
              number: 'a)',
              type: 'list_item',
              children: [
                {
                  id: 'c1',
                  number: null,
                  type: 'content',
                  contents: { de: 'Item text.' },
                  children: [],
                },
                {
                  id: 'fn1',
                  number: '1',
                  type: 'footnote',
                  contents: { de: 'List item footnote.' },
                },
              ],
            },
          ],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    expect(screen.getByText('List item footnote.')).toBeInTheDocument();
  });

  test('renders bullet points for list items without a number', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
          number: null,
          type: 'list',
          children: [
            {
              id: 'li1',
              number: null,
              type: 'list_item',
              children: [
                {
                  id: 'c1',
                  number: null,
                  type: 'content',
                  contents: { de: 'Unnumbered item.' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    expect(screen.getByText('Unnumbered item.')).toBeInTheDocument();
    // Should have a bullet character
    expect(screen.getByText('•')).toBeInTheDocument();
  });

  test('list item number is rendered as superscript before content', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
          number: null,
          type: 'list',
          children: [
            {
              id: 'li1',
              number: '1.',
              type: 'list_item',
              children: [
                {
                  id: 'c1',
                  number: null,
                  type: 'content',
                  contents: { de: 'Numbered item text.' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    const sup = screen.getByText('1.');
    expect(sup.tagName).toBe('SUP');
    // The marker and text must share the same parent so they render on one line
    const content = screen.getByText('Numbered item text.');
    expect(sup.parentElement).toBe(content.parentElement);
  });

  test('bullet and text share the same parent element', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
          number: null,
          type: 'list',
          children: [
            {
              id: 'li1',
              number: null,
              type: 'list_item',
              children: [
                {
                  id: 'c1',
                  number: null,
                  type: 'content',
                  contents: { de: 'Bullet item text.' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    const bullet = screen.getByText('•');
    const content = screen.getByText('Bullet item text.');
    expect(bullet.parentElement).toBe(content.parentElement);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type {
  ContentDocumentNode,
  HeadingDocumentNode,
  ListDocumentNode,
  ListItemDocumentNode,
} from '../types/document';
import { createQuestionNode } from '../utils/tree-mutations';
import {
  ContentNode,
  HeadingNode,
  ListItemNode,
  ListNode,
  PreviewNode,
} from './PreviewNodeRenderers';

describe('HeadingNode', () => {
  test('maps depth to the matching heading level', () => {
    const node: HeadingDocumentNode = {
      id: 'h',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Sub Heading' },
      children: [],
    };

    render(<HeadingNode node={node} language="de" depth={2} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sub Heading');
  });

  test('caps the heading level at h4 for depths beyond 4', () => {
    const node: HeadingDocumentNode = {
      id: 'h',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Deep Heading' },
      children: [],
    };

    render(<HeadingNode node={node} language="de" depth={7} />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Deep Heading');
  });

  test('renders the number before the heading text', () => {
    const node: HeadingDocumentNode = {
      id: 'h',
      number: 'Art. 1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Gegenstand' },
      children: [],
    };

    render(<HeadingNode node={node} language="de" depth={1} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Art. 1');
    expect(heading).toHaveTextContent('Gegenstand');
  });

  test('renders nested child nodes', () => {
    const node: HeadingDocumentNode = {
      id: 'h',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'c1',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'Body paragraph.' },
          children: [],
        },
      ],
    };

    render(<HeadingNode node={node} language="de" depth={1} />);
    expect(screen.getByText('Body paragraph.')).toBeInTheDocument();
  });

  test('renders footnote children inside a details element', () => {
    const node: HeadingDocumentNode = {
      id: 'h',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'fn1',
          number: '1',
          type: 'FOOTNOTE',
          format: 'TEXT',
          contents: { de: 'Heading footnote.' },
        },
      ],
    };

    render(<HeadingNode node={node} language="de" depth={1} />);
    const footnote = screen.getByText('Heading footnote.');
    expect(footnote.closest('details')).toBeInTheDocument();
  });
});

describe('ContentNode', () => {
  test('renders inline-format text inside a paragraph', () => {
    const node: ContentDocumentNode = {
      id: 'c',
      number: null,
      type: 'CONTENT',
      format: 'TEXT',
      contents: { de: 'A plain paragraph.' },
      children: [],
    };

    render(<ContentNode node={node} language="de" />);
    const text = screen.getByText('A plain paragraph.');
    expect(text.closest('p')).toBeInTheDocument();
  });

  test('renders MARKDOWN (block) content in a block wrapper, not a paragraph', () => {
    const node: ContentDocumentNode = {
      id: 'c',
      number: null,
      type: 'CONTENT',
      format: 'MARKDOWN',
      contents: { de: '- alpha\n- beta' },
      children: [],
    };

    const { container } = render(<ContentNode node={node} language="de" />);
    // A markdown list is block-level and cannot legally nest inside a <p>.
    expect(container.querySelector('div.markdown-rendered')).not.toBeNull();
    expect(container.querySelector('ul')).not.toBeNull();
  });

  test('renders footnote children inside a details element', () => {
    const node: ContentDocumentNode = {
      id: 'c',
      number: null,
      type: 'CONTENT',
      format: 'TEXT',
      contents: { de: 'Body.' },
      children: [
        {
          id: 'fn1',
          number: '1',
          type: 'FOOTNOTE',
          format: 'TEXT',
          contents: { de: 'Content footnote.' },
        },
      ],
    };

    render(<ContentNode node={node} language="de" />);
    const footnote = screen.getByText('Content footnote.');
    expect(footnote.closest('details')).toBeInTheDocument();
  });
});

describe('ListNode', () => {
  test('renders each list-item child', () => {
    const node: ListDocumentNode = {
      id: 'l',
      number: null,
      type: 'LIST',
      children: [
        {
          id: 'li1',
          number: 'a)',
          type: 'LIST_ITEM',
          children: [
            {
              id: 'c1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'First item.' },
              children: [],
            },
          ],
        },
        {
          id: 'li2',
          number: 'b)',
          type: 'LIST_ITEM',
          children: [
            {
              id: 'c2',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Second item.' },
              children: [],
            },
          ],
        },
      ],
    };

    render(<ListNode node={node} language="de" headingDepth={1} />);
    expect(screen.getByText('First item.')).toBeInTheDocument();
    expect(screen.getByText('Second item.')).toBeInTheDocument();
  });
});

describe('ListItemNode', () => {
  const itemWith = (
    number: string | null,
    extraChildren: ListItemDocumentNode['children'] = []
  ): ListItemDocumentNode => ({
    id: 'li',
    number,
    type: 'LIST_ITEM',
    children: [
      {
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Item body.' },
        children: [],
      },
      ...extraChildren,
    ],
  });

  test('renders the number marker inline with the first content', () => {
    render(<ListItemNode node={itemWith('1.')} language="de" headingDepth={1} />);
    const marker = screen.getByText('1.');
    const body = screen.getByText('Item body.');
    expect(marker.parentElement).toBe(body.parentElement);
  });

  test('renders a bullet when the item has no number', () => {
    render(<ListItemNode node={itemWith(null)} language="de" headingDepth={1} />);
    const bullet = screen.getByText('•');
    const body = screen.getByText('Item body.');
    expect(bullet.parentElement).toBe(body.parentElement);
  });

  test('renders remaining children after the first content', () => {
    const node = itemWith('1.', [
      {
        id: 'c2',
        number: null,
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Second paragraph.' },
        children: [],
      },
    ]);

    render(<ListItemNode node={node} language="de" headingDepth={1} />);
    expect(screen.getByText('Item body.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
  });
});

describe('QuestionNode (via PreviewNode)', () => {
  test('a single-choice question renders the prompt and disabled radios', () => {
    const q = createQuestionNode('single', 'de');
    (q.children[0] as ContentDocumentNode).contents = { de: 'Pick one' };
    (q.children[1] as { contents: Record<string, string> }).contents = { de: 'Alpha' };
    (q.children[2] as { contents: Record<string, string> }).contents = { de: 'Beta' };
    const { container } = render(<PreviewNode node={q} language="de" headingDepth={1} />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(2);
    for (const r of radios) expect(r).toBeDisabled();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  test('a multiple-choice question renders disabled checkboxes', () => {
    const q = createQuestionNode('multiple', 'de');
    const { container } = render(<PreviewNode node={q} language="de" headingDepth={1} />);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  test('a text question renders a disabled textarea', () => {
    const q = createQuestionNode('text', 'de');
    const { container } = render(<PreviewNode node={q} language="de" headingDepth={1} />);
    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea).toBeDisabled();
  });

  test('an option node renders nothing at top level (its question renders it)', () => {
    const option = createQuestionNode('single', 'de').children[1];
    const { container } = render(<PreviewNode node={option} language="de" headingDepth={1} />);
    expect(container.firstChild).toBeNull();
  });
});

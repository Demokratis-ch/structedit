import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type {
  ContentDocumentNode,
  ContentGroupDocumentNode,
  DefinitionListDocumentNode,
  HeadingDocumentNode,
  ListDocumentNode,
  ListItemDocumentNode,
  TableDocumentNode,
} from '../types/document';
import {
  ContentGroupNode,
  ContentNode,
  DefinitionListNode,
  HeadingNode,
  ListItemNode,
  ListNode,
  PreviewNode,
  TableNode,
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

describe('ContentGroupNode (issue #150)', () => {
  const paragraph = (
    id: string,
    text: string,
    number: string | null = null
  ): ContentDocumentNode => ({
    id,
    number,
    type: 'CONTENT',
    format: 'TEXT',
    contents: { de: text },
    children: [],
  });
  const list = (): ListDocumentNode => ({
    id: 'l',
    number: null,
    type: 'LIST',
    children: [{ id: 'li', number: 'a.', type: 'LIST_ITEM', children: [paragraph('lc', 'item')] }],
  });
  const group = (children: ContentGroupDocumentNode['children']): ContentGroupDocumentNode => ({
    id: 'g',
    number: '2',
    type: 'CONTENT_GROUP',
    contents: { de: 'hidden' },
    format: 'TEXT',
    children,
  });

  test('renders the number inline before the first paragraph', () => {
    render(<ContentGroupNode node={group([paragraph('p', 'Der Bund')])} language="de" />);
    const p = screen.getByText(/Der Bund/).closest('p');
    // The badge and the text are separated by a CSS margin, not whitespace.
    expect(p?.textContent?.replace(/\s+/g, '')).toBe('2DerBund');
  });

  test('renders the number on its own line when the first child is a list', () => {
    const { container } = render(<ContentGroupNode node={group([list()])} language="de" />);
    const number = screen.getByText('2');
    expect(number.closest('li, p')).toBeNull();
    expect(container.textContent?.trim().startsWith('2')).toBe(true);
    expect(screen.getByText(/item/)).toBeInTheDocument();
  });

  test("keeps a first paragraph's own number after the inherited one", () => {
    render(<ContentGroupNode node={group([paragraph('p', 'Text', '1')])} language="de" />);
    const p = screen.getByText(/Text/).closest('p');
    expect(p?.textContent?.replace(/\s+/g, '')).toBe('21Text');
  });

  test('never renders the group contents', () => {
    render(<ContentGroupNode node={group([paragraph('p', 'Der Bund')])} language="de" />);
    expect(screen.queryByText(/hidden/)).toBeNull();
  });

  test('renders remaining children after the first paragraph', () => {
    render(<ContentGroupNode node={group([paragraph('p', 'Der Bund'), list()])} language="de" />);
    expect(screen.getByText(/item/)).toBeInTheDocument();
  });

  test('is routed from PreviewNode', () => {
    render(
      <PreviewNode node={group([paragraph('p', 'Der Bund')])} language="de" headingDepth={1} />
    );
    expect(screen.getByText(/Der Bund/)).toBeInTheDocument();
  });
});

describe('TableNode (issue #150)', () => {
  const table = (number: string | null = ''): TableDocumentNode => ({
    id: 't',
    number,
    type: 'TABLE',
    format: 'MARKDOWN',
    contents: { de: '| a | b |\n| - | - |\n| 1 | 2 |' },
  });

  test('renders a pipe table as an HTML table', () => {
    const { container } = render(<TableNode node={table()} language="de" />);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('th')?.textContent).toBe('a');
    expect(Array.from(container.querySelectorAll('td')).map((td) => td.textContent)).toEqual([
      '1',
      '2',
    ]);
  });

  test('renders the number before the table', () => {
    const { container } = render(<TableNode node={table('Tab. 1')} language="de" />);
    expect(container.textContent?.trim().startsWith('Tab. 1')).toBe(true);
  });

  test('is routed from PreviewNode', () => {
    const { container } = render(<PreviewNode node={table()} language="de" headingDepth={1} />);
    expect(container.querySelector('table')).not.toBeNull();
  });
});

describe('DefinitionListNode (issue #150)', () => {
  const dl = (source: string, number: string | null = ''): DefinitionListDocumentNode => ({
    id: 'd',
    number,
    type: 'DEFINITION_LIST',
    format: 'MARKDOWN',
    contents: { de: source },
  });

  test('renders Term :: Value lines as a definition list', () => {
    const { container } = render(
      <DefinitionListNode
        node={dl('Bund :: Die Schweizerische Eidgenossenschaft\nKanton :: Ein Gliedstaat')}
        language="de"
      />
    );
    expect(container.querySelector('dl')).not.toBeNull();
    const terms = Array.from(container.querySelectorAll('dt')).map((dt) => dt.textContent);
    const values = Array.from(container.querySelectorAll('dd')).map((dd) => dd.textContent);
    expect(terms).toEqual(['Bund', 'Kanton']);
    expect(values).toEqual(['Die Schweizerische Eidgenossenschaft', 'Ein Gliedstaat']);
  });

  test('renders inline Markdown inside terms and values', () => {
    const { container } = render(
      <DefinitionListNode node={dl('**Bund** :: Der *Staat*')} language="de" />
    );
    expect(container.querySelector('dt strong')?.textContent).toBe('Bund');
    expect(container.querySelector('dd em')?.textContent).toBe('Staat');
  });

  test('treats a separator without surrounding whitespace as plain text', () => {
    const { container } = render(<DefinitionListNode node={dl('A::B')} language="de" />);
    expect(container.querySelector('dl')).toBeNull();
    expect(container).toHaveTextContent('A::B');
  });

  test('falls back to Markdown when any line is not a pair', () => {
    const { container } = render(
      <DefinitionListNode node={dl('Bund :: Staat\nkein Paar')} language="de" />
    );
    expect(container.querySelector('dl')).toBeNull();
    expect(container).toHaveTextContent('Bund :: Staat');
    expect(container).toHaveTextContent('kein Paar');
  });

  test('renders the number before the list and is routed from PreviewNode', () => {
    const { container } = render(
      <PreviewNode node={dl('Bund :: Staat', 'Anhang 1')} language="de" headingDepth={1} />
    );
    expect(container.textContent?.trim().startsWith('Anhang 1')).toBe(true);
    expect(container.querySelector('dl')).not.toBeNull();
  });
});

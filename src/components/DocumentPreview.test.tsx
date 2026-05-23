import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { BlockDocumentNode, ContainerDocumentNode } from '../types/document';
import { DocumentPreview } from './DocumentPreview';

const makeDoc = (...children: BlockDocumentNode[]): ContainerDocumentNode => ({
  id: 'root',
  type: 'DOCUMENT',
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
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Top Heading' },
      children: [
        {
          id: 'h2',
          number: null,
          type: 'HEADING',
          format: 'TEXT',
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
      type: 'HEADING',
      format: 'TEXT',
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
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'c1',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'First paragraph text.' },
          children: [],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    expect(screen.getByText('First paragraph text.')).toBeInTheDocument();
  });

  test('renders content node number without auto-superscript wrapper', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'c1',
          number: '1',
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'Paragraph with number.' },
          children: [],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" />);
    const number = screen.getByText('1');
    expect(number.tagName).not.toBe('SUP');
    expect(number.closest('sup')).toBeNull();
  });

  test('renders list items with their number labels', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
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
                  contents: { de: 'First item text.' },
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
    // Numbers should NOT be auto-superscripted any more.
    const labelA = screen.getByText('a)');
    expect(labelA.closest('sup')).toBeNull();
    const labelB = screen.getByText('b)');
    expect(labelB.closest('sup')).toBeNull();
    expect(screen.getByText('First item text.')).toBeInTheDocument();
    expect(screen.getByText('Second item text.')).toBeInTheDocument();
  });

  test('renders footnotes in a collapsible details element', () => {
    const doc = makeDoc({
      id: 'h1',
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
          contents: { de: 'Some text.' },
          children: [
            {
              id: 'fn1',
              number: '1',
              type: 'FOOTNOTE',
              format: 'TEXT',
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
      type: 'HEADING',
      format: 'TEXT',
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
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Level 1' },
      children: [
        {
          id: 'h2',
          number: null,
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Level 2' },
          children: [
            {
              id: 'h3',
              number: null,
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Level 3' },
              children: [
                {
                  id: 'h4',
                  number: null,
                  type: 'HEADING',
                  format: 'TEXT',
                  contents: { de: 'Level 4' },
                  children: [
                    {
                      id: 'h5',
                      number: null,
                      type: 'HEADING',
                      format: 'TEXT',
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
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Some text.' },
        children: [],
      },
      {
        id: 'fn1',
        number: '1',
        type: 'FOOTNOTE',
        format: 'TEXT',
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
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
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
                  contents: { de: 'Item text.' },
                  children: [],
                },
                {
                  id: 'fn1',
                  number: '1',
                  type: 'FOOTNOTE',
                  format: 'TEXT',
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
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
          number: null,
          type: 'LIST',
          children: [
            {
              id: 'li1',
              number: null,
              type: 'LIST_ITEM',
              children: [
                {
                  id: 'c1',
                  number: null,
                  type: 'CONTENT',
                  format: 'TEXT',
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

  test('list item number renders inline (not superscript) before content', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
          number: null,
          type: 'LIST',
          children: [
            {
              id: 'li1',
              number: '1.',
              type: 'LIST_ITEM',
              children: [
                {
                  id: 'c1',
                  number: null,
                  type: 'CONTENT',
                  format: 'TEXT',
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
    const marker = screen.getByText('1.');
    expect(marker.tagName).not.toBe('SUP');
    expect(marker.closest('sup')).toBeNull();
    // The marker and text must share the same parent so they render on one line
    const content = screen.getByText('Numbered item text.');
    expect(marker.parentElement).toBe(content.parentElement);
  });

  test('bullet and text share the same parent element', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'l1',
          number: null,
          type: 'LIST',
          children: [
            {
              id: 'li1',
              number: null,
              type: 'LIST_ITEM',
              children: [
                {
                  id: 'c1',
                  number: null,
                  type: 'CONTENT',
                  format: 'TEXT',
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

  test('renders a TOC with heading numbers, text, and nested indentation', () => {
    const doc = makeDoc({
      id: 'h1',
      number: 'I.',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Allgemeine Bestimmungen' },
      children: [
        {
          id: 'h2',
          number: 'Art. 1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Gegenstand' },
          children: [],
        },
        {
          id: 'h3',
          number: 'Art. 2',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Geltungsbereich' },
          children: [],
        },
      ],
    });

    render(<DocumentPreview document={doc} language="de" onHeadingClick={() => {}} />);

    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });

    // Top-level entry
    expect(within(toc).getByText('I.')).toBeInTheDocument();
    expect(within(toc).getByText('Allgemeine Bestimmungen')).toBeInTheDocument();

    // Nested entries
    expect(within(toc).getByText('Art. 1')).toBeInTheDocument();
    expect(within(toc).getByText('Gegenstand')).toBeInTheDocument();
    expect(within(toc).getByText('Art. 2')).toBeInTheDocument();

    // Nested entries should be in a nested ul with ml-4
    const nestedList = within(toc).getByText('Art. 1').closest('ul');
    expect(nestedList?.className).toContain('ml-4');
  });

  test('TOC click calls onHeadingClick with node ID', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const doc = makeDoc({
      id: 'h1',
      number: 'I.',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [],
    });

    render(<DocumentPreview document={doc} language="de" onHeadingClick={onClick} />);

    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
    await user.click(within(toc).getByText('First Heading'));

    expect(onClick).toHaveBeenCalledWith('h1');
  });

  test('TOC click scrolls the heading section into view in the preview', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Target Heading' },
      children: [],
    });

    render(<DocumentPreview document={doc} language="de" onHeadingClick={() => {}} />);

    // The heading section should have an id matching the node
    const section = document.getElementById('h1');
    expect(section).not.toBeNull();

    // Mock scrollIntoView on the section
    const scrollMock = vi.fn();
    section!.scrollIntoView = scrollMock;

    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
    await user.click(within(toc).getByText('Target Heading'));

    expect(scrollMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  test('TOC has a collapse button that hides the TOC list', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      id: 'h1',
      number: 'I.',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [],
    });

    render(<DocumentPreview document={doc} language="de" onHeadingClick={() => {}} />);

    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
    expect(within(toc).getByText('First Heading')).toBeInTheDocument();

    // Click the collapse button
    const collapseBtn = within(toc).getByRole('button', { name: /collapse/i });
    await user.click(collapseBtn);

    // TOC entries should be hidden
    expect(within(toc).queryByText('First Heading')).not.toBeInTheDocument();
    // The heading title should also be hidden
    expect(within(toc).queryByText('Inhaltsverzeichnis')).not.toBeInTheDocument();
  });

  test('renders a drag handle next to the TOC when expanded', () => {
    const doc = makeDoc({
      id: 'h1',
      number: 'I.',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [],
    });

    render(<DocumentPreview document={doc} language="de" onHeadingClick={() => {}} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  test('does not render drag handle when TOC is collapsed', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      id: 'h1',
      number: 'I.',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [],
    });

    render(<DocumentPreview document={doc} language="de" onHeadingClick={() => {}} />);

    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
    await user.click(within(toc).getByRole('button', { name: /collapse/i }));

    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  test('collapsed TOC can be expanded again', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      id: 'h1',
      number: 'I.',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [],
    });

    render(<DocumentPreview document={doc} language="de" onHeadingClick={() => {}} />);

    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });

    // Collapse
    await user.click(within(toc).getByRole('button', { name: /collapse/i }));
    expect(within(toc).queryByText('First Heading')).not.toBeInTheDocument();

    // Expand
    await user.click(within(toc).getByRole('button', { name: /expand/i }));
    expect(within(toc).getByText('First Heading')).toBeInTheDocument();
  });

  describe('number field MARKDOWN_MINIMAL rendering', () => {
    test('renders content number with markdown bold', () => {
      const doc = makeDoc({
        id: 'c1',
        number: '**1**',
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Bold-numbered paragraph.' },
        children: [],
      });

      render(<DocumentPreview document={doc} language="de" />);
      const paragraph = screen.getByText('Bold-numbered paragraph.').parentElement!;
      const strong = paragraph.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('1');
    });

    test('renders content number as superscript when markdown sup syntax is used', () => {
      const doc = makeDoc({
        id: 'c1',
        number: '^1^',
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Sup-numbered paragraph.' },
        children: [],
      });

      render(<DocumentPreview document={doc} language="de" />);
      const paragraph = screen.getByText('Sup-numbered paragraph.').parentElement!;
      const sup = paragraph.querySelector('sup');
      expect(sup).not.toBeNull();
      expect(sup?.textContent).toBe('1');
    });

    test('renders list item number with markdown italic', () => {
      const doc = makeDoc({
        id: 'l1',
        number: null,
        type: 'LIST',
        children: [
          {
            id: 'li1',
            number: '*a)*',
            type: 'LIST_ITEM',
            children: [
              {
                id: 'c1',
                number: null,
                type: 'CONTENT',
                format: 'TEXT',
                contents: { de: 'Italic-marker item.' },
                children: [],
              },
            ],
          },
        ],
      });

      render(<DocumentPreview document={doc} language="de" />);
      const paragraph = screen.getByText('Italic-marker item.').parentElement!;
      const em = paragraph.querySelector('em');
      expect(em).not.toBeNull();
      expect(em?.textContent).toBe('a)');
    });

    test('renders footnote number with markdown formatting', () => {
      const doc = makeDoc({
        id: 'h1',
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
            contents: { de: 'Some text.' },
            children: [
              {
                id: 'fn1',
                number: '^1^',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'Footnote content.' },
              },
            ],
          },
        ],
      });

      render(<DocumentPreview document={doc} language="de" />);
      const footnoteParagraph = screen.getByText('Footnote content.').parentElement!;
      const sup = footnoteParagraph.querySelector('sup');
      expect(sup).not.toBeNull();
      expect(sup?.textContent).toBe('1');
    });

    test('renders heading number with markdown formatting', () => {
      const doc = makeDoc({
        id: 'h1',
        number: '**Art. 1**',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Gegenstand' },
        children: [],
      });

      render(<DocumentPreview document={doc} language="de" />);
      const heading = screen.getByRole('heading', { level: 1 });
      const strong = heading.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('Art. 1');
    });

    test('renders TOC entry number with markdown formatting', () => {
      const doc = makeDoc({
        id: 'h1',
        number: '**I.**',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Allgemeine Bestimmungen' },
        children: [],
      });

      render(<DocumentPreview document={doc} language="de" onHeadingClick={() => {}} />);
      const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
      const entry = within(toc).getByText('Allgemeine Bestimmungen').closest('button')!;
      const strong = entry.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('I.');
    });

    test('escapes raw HTML in numbers', () => {
      const doc = makeDoc({
        id: 'c1',
        number: '<script>alert(1)</script>',
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Paragraph with hostile number.' },
        children: [],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      // The hostile tag must not become a real element.
      expect(container.querySelector('script')).toBeNull();
      // ...but its source text is visible (escaped) in the rendered DOM.
      expect(container.textContent).toContain('<script>alert(1)</script>');
    });
  });

  describe('body rendering — markdown marks', () => {
    test('renders MARKDOWN_MINIMAL bold inside heading', () => {
      const doc = makeDoc({
        id: 'h1',
        number: null,
        type: 'HEADING',
        format: 'MARKDOWN_MINIMAL',
        contents: { de: '**Important** topic' },
        children: [],
      });

      render(<DocumentPreview document={doc} language="de" />);
      const heading = screen.getByRole('heading', { level: 1 });
      const strong = heading.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('Important');
    });

    test('renders MARKDOWN_MINIMAL sup inside heading', () => {
      const doc = makeDoc({
        id: 'h1',
        number: null,
        type: 'HEADING',
        format: 'MARKDOWN_MINIMAL',
        contents: { de: 'Note^*^' },
        children: [],
      });

      render(<DocumentPreview document={doc} language="de" />);
      const heading = screen.getByRole('heading', { level: 1 });
      const sup = heading.querySelector('sup');
      expect(sup).not.toBeNull();
      expect(sup?.textContent).toBe('*');
    });

    test('does not show raw asterisks for MARKDOWN_MINIMAL heading', () => {
      const doc = makeDoc({
        id: 'h1',
        number: null,
        type: 'HEADING',
        format: 'MARKDOWN_MINIMAL',
        contents: { de: '**Important**' },
        children: [],
      });

      render(<DocumentPreview document={doc} language="de" />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).not.toContain('**');
    });

    test('renders MARKDOWN content with bold mark', () => {
      const doc = makeDoc({
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'MARKDOWN',
        contents: { de: '**bold body** rest' },
        children: [],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      const strong = container.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('bold body');
      expect(container.textContent).not.toContain('**');
    });

    test('renders MARKDOWN content with paragraph breaks', () => {
      const doc = makeDoc({
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'MARKDOWN',
        contents: { de: 'first para\n\nsecond para' },
        children: [],
      });

      render(<DocumentPreview document={doc} language="de" />);
      expect(screen.getByText('first para')).toBeInTheDocument();
      expect(screen.getByText('second para')).toBeInTheDocument();
    });

    test('renders MARKDOWN content with bulleted list', () => {
      const doc = makeDoc({
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'MARKDOWN',
        contents: { de: '- alpha\n- beta\n- gamma' },
        children: [],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      const ul = container.querySelector('ul');
      expect(ul).not.toBeNull();
      const items = ul?.querySelectorAll('li') ?? [];
      expect(items).toHaveLength(3);
      expect(items[0].textContent).toBe('alpha');
      expect(items[1].textContent).toBe('beta');
      expect(items[2].textContent).toBe('gamma');
    });

    test('renders NEWLINES content with <br>', () => {
      const doc = makeDoc({
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'NEWLINES',
        contents: { de: 'line one\nline two' },
        children: [],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      expect(container.querySelector('br')).not.toBeNull();
    });

    test('renders MARKDOWN inline mark inside list_item first content', () => {
      const doc = makeDoc({
        id: 'l1',
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
                format: 'MARKDOWN',
                contents: { de: '**bold** item body' },
                children: [],
              },
            ],
          },
        ],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      const strong = container.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('bold');
      expect(container.textContent).not.toContain('**');
    });

    test('renders MARKDOWN inline mark inside footnote', () => {
      const doc = makeDoc({
        id: 'h1',
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
            contents: { de: 'Body' },
            children: [
              {
                id: 'fn1',
                number: '1',
                type: 'FOOTNOTE',
                format: 'MARKDOWN',
                contents: { de: '**bold note** body' },
              },
            ],
          },
        ],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      const details = container.querySelector('details');
      expect(details).not.toBeNull();
      const strong = details?.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('bold note');
    });

    test('escapes raw HTML in TEXT content', () => {
      const doc = makeDoc({
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: '<script>alert(1)</script>' },
        children: [],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toContain('<script>alert(1)</script>');
    });

    test('strips XSS payloads in MARKDOWN content', () => {
      const doc = makeDoc({
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'MARKDOWN',
        contents: { de: '<img src=x onerror=alert(1)>' },
        children: [],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('script')).toBeNull();
      for (const el of Array.from(container.querySelectorAll('*'))) {
        for (const attr of Array.from(el.attributes)) {
          expect(attr.name.startsWith('on')).toBe(false);
        }
      }
    });

    test('rejects javascript: links in MARKDOWN content', () => {
      const doc = makeDoc({
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'MARKDOWN',
        contents: { de: '[click](javascript:alert(1))' },
        children: [],
      });

      const { container } = render(<DocumentPreview document={doc} language="de" />);
      for (const a of Array.from(container.querySelectorAll('a'))) {
        const href = a.getAttribute('href') ?? '';
        expect(href).not.toMatch(/^javascript:/i);
      }
    });
  });
});

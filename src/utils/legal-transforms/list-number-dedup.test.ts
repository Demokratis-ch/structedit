import { describe, expect, it } from 'vitest';
import {
  type ContentDocumentNode,
  type HeadingDocumentNode,
  isValidDocument,
  type ListDocumentNode,
  type ListItemDocumentNode,
  type NumberedDocumentNode,
} from '../../types/document';
import { generateId, parseHtmlToTree } from '../document-utils';
import { listNumberDedupTransform } from './list-number-dedup';
import { content, createDoc, heading, list } from './test-helpers';

describe('listNumberDedupTransform', () => {
  it('extracts leading number from list item content and sets it as number', () => {
    const input = createDoc([
      list([
        { number: '1.', content: '1 First paragraph' },
        { number: '2.', content: '2 Second paragraph' },
      ]),
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const listNode = result.children[0] as ListDocumentNode;
    expect((listNode.children[0] as NumberedDocumentNode).number).toBe('1');
    expect((listNode.children[1] as NumberedDocumentNode).number).toBe('2');
  });

  it('strips number prefix from content text', () => {
    const input = createDoc([
      list([{ number: '1.', content: '1 Dieser Erlass regelt das Bildungswesen.' }]),
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const listNode = result.children[0] as ListDocumentNode;
    const listItem = listNode.children[0] as ListItemDocumentNode;
    const contentNode = listItem.children[0] as ContentDocumentNode;
    expect(contentNode.contents.de).toBe('Dieser Erlass regelt das Bildungswesen.');
  });

  it('handles the example HTML from Mammoth output (superscript Absatznummern dissolve into content nodes)', () => {
    const html = `<ol>
    <li><sup>1</sup> Dieser Erlass regelt das Bildungswesen in der Volksschule.</li>
    <li><sup>2</sup> Er gilt für: ...</li>
    <li><sup>3</sup> Er regelt zudem die schulpsychologische Versorgung im Bereich der Volksschule und die <br />ergänzenden Angebote.</li>
</ol>`;

    const parsed = parseHtmlToTree(html, 'de');
    const result = listNumberDedupTransform(parsed, 'de');

    // The list is fully dissolved — three content nodes sit at the root.
    expect(result.children).toHaveLength(3);
    expect(result.children.every((c) => c.type === 'CONTENT')).toBe(true);

    const c0 = result.children[0] as ContentDocumentNode;
    const c1 = result.children[1] as ContentDocumentNode;
    const c2 = result.children[2] as ContentDocumentNode;

    // The Absatznummer keeps its superscript formatting in the number field.
    expect(c0.number).toBe('^1^');
    expect(c1.number).toBe('^2^');
    expect(c2.number).toBe('^3^');

    expect(c0.contents.de).toBe('Dieser Erlass regelt das Bildungswesen in der Volksschule.');
    expect(c0.format).toBe('TEXT');

    expect(c1.contents.de).toBe('Er gilt für: ...');
    expect(c1.format).toBe('TEXT');

    // The third item's source had a <br> (now `\n` in markdown source). The bare
    // newline isn't treated as an inline mark for downgrade purposes — visually
    // a single `\n` is rendered the same under TEXT and MARKDOWN — so the
    // format downgrades to TEXT alongside the other two items.
    expect(c2.contents.de).toContain('Er regelt zudem');
    expect(c2.contents.de).toContain('\n');
    expect(c2.format).toBe('TEXT');

    expect(isValidDocument(result)).toBe(true);
  });

  it('leaves list items without leading numbers unchanged', () => {
    const input = createDoc([
      list([
        { number: '1.', content: 'No leading number here' },
        { number: '2.', content: 'Also no number' },
      ]),
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const listNode = result.children[0] as ListDocumentNode;
    expect((listNode.children[0] as NumberedDocumentNode).number).toBe('1.');
    expect((listNode.children[1] as NumberedDocumentNode).number).toBe('2.');

    const content0 = (listNode.children[0] as ListItemDocumentNode)
      .children[0] as ContentDocumentNode;
    expect(content0.contents.de).toBe('No leading number here');
  });

  it('handles bis/ter suffixes', () => {
    const input = createDoc([
      list([
        { number: '1.', content: '1 Normal paragraph' },
        { number: '2.', content: '1bis Added paragraph' },
        { number: '3.', content: '2 Another paragraph' },
      ]),
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const listNode = result.children[0] as ListDocumentNode;
    expect((listNode.children[0] as NumberedDocumentNode).number).toBe('1');
    expect((listNode.children[1] as NumberedDocumentNode).number).toBe('1bis');
    expect((listNode.children[2] as NumberedDocumentNode).number).toBe('2');
  });

  it('applies recursively to nested structures', () => {
    const input = createDoc([
      heading('Art. 1', [
        list([
          { number: '1.', content: '1 First' },
          { number: '2.', content: '2 Second' },
        ]),
      ]),
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    const listNode = h.children[0] as ListDocumentNode;
    expect((listNode.children[0] as NumberedDocumentNode).number).toBe('1');
    expect((listNode.children[1] as NumberedDocumentNode).number).toBe('2');
  });

  it('preserves non-list nodes unchanged', () => {
    const input = createDoc([content('Some text'), heading('Title')]);

    const result = listNumberDedupTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('CONTENT');
    expect(result.children[1].type).toBe('HEADING');
  });

  it('handles empty lists', () => {
    const input = createDoc([
      {
        id: 'test',
        number: null,
        type: 'LIST' as const,
        children: [],
      },
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const listNode = result.children[0] as ListDocumentNode;
    expect(listNode.children).toHaveLength(0);
  });

  it('processes nested lists inside list items', () => {
    const input = createDoc([
      {
        id: 'outer-list',
        number: null,
        type: 'LIST' as const,
        children: [
          {
            id: 'outer-item',
            number: '1.',
            type: 'LIST_ITEM' as const,
            children: [
              content('1 Outer text'),
              list([
                { number: '1.', content: '1 Inner first' },
                { number: '2.', content: '2 Inner second' },
              ]),
            ],
          },
        ],
      },
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const outerList = result.children[0] as ListDocumentNode;
    const outerItem = outerList.children[0] as ListItemDocumentNode;

    // Outer item should be deduped
    expect((outerItem as NumberedDocumentNode).number).toBe('1');
    const outerContent = outerItem.children[0] as ContentDocumentNode;
    expect(outerContent.contents.de).toBe('Outer text');

    // Inner list should also be deduped
    const innerList = outerItem.children[1] as ListDocumentNode;
    expect((innerList.children[0] as NumberedDocumentNode).number).toBe('1');
    expect((innerList.children[1] as NumberedDocumentNode).number).toBe('2');

    const innerContent0 = (innerList.children[0] as ListItemDocumentNode)
      .children[0] as ContentDocumentNode;
    expect(innerContent0.contents.de).toBe('Inner first');

    const innerContent1 = (innerList.children[1] as ListItemDocumentNode)
      .children[0] as ContentDocumentNode;
    expect(innerContent1.contents.de).toBe('Inner second');
  });

  it('handles list items whose first child is not a content node', () => {
    const input = createDoc([
      {
        id: 'outer-list',
        number: null,
        type: 'LIST' as const,
        children: [
          {
            id: 'item-with-nested-only',
            number: '1.',
            type: 'LIST_ITEM' as const,
            children: [list([{ number: '1.', content: '1 Sub item' }])],
          },
        ],
      },
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const outerList = result.children[0] as ListDocumentNode;
    const outerItem = outerList.children[0] as ListItemDocumentNode;
    // Should not have undefined in children
    expect(outerItem.children.every((c) => c !== undefined)).toBe(true);
    // The nested list should still be processed
    const innerList = outerItem.children[0] as ListDocumentNode;
    expect(innerList.type).toBe('LIST');
    expect((innerList.children[0] as NumberedDocumentNode).number).toBe('1');
  });

  it('preserves the document id', () => {
    const input = createDoc([list([{ number: '1.', content: '1 Text' }])]);
    const originalId = input.id;

    const result = listNumberDedupTransform(input, 'de');

    expect(result.id).toBe(originalId);
  });

  describe('superscript Absatznummer conversion', () => {
    // Build a list with content nodes that already carry MARKDOWN-formatted source
    // (i.e. what document-utils produces for <li><sup>N</sup> ... </li>).
    const supList = (
      items: { itemNumber: string | null; mdContent: string; format?: 'TEXT' | 'MARKDOWN' }[]
    ): ListDocumentNode => ({
      id: generateId(),
      number: null,
      type: 'LIST' as const,
      children: items.map((item) => ({
        id: generateId(),
        number: item.itemNumber,
        type: 'LIST_ITEM' as const,
        children: [
          {
            id: generateId(),
            number: null,
            type: 'CONTENT' as const,
            format: item.format ?? 'MARKDOWN',
            contents: { de: item.mdContent },
            children: [],
          },
        ],
      })),
    });

    it('converts a list_item with a superscript leading number to a content node', () => {
      const input = createDoc([
        supList([{ itemNumber: '1.', mdContent: '^1^ Dieser Erlass regelt das Bildungswesen.' }]),
      ]);

      const result = listNumberDedupTransform(input, 'de');

      // The list is dissolved; a single content node sits at the root.
      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe('CONTENT');
      const c = result.children[0] as ContentDocumentNode;
      expect(c.number).toBe('^1^');
      expect(c.contents.de).toBe('Dieser Erlass regelt das Bildungswesen.');
    });

    it('dissolves an all-superscript list into content nodes', () => {
      const input = createDoc([
        supList([
          { itemNumber: '1.', mdContent: '^1^ A' },
          { itemNumber: '2.', mdContent: '^2^ B' },
          { itemNumber: '3.', mdContent: '^3^ C' },
        ]),
      ]);

      const result = listNumberDedupTransform(input, 'de');

      expect(result.children).toHaveLength(3);
      expect(result.children.every((c) => c.type === 'CONTENT')).toBe(true);
      expect((result.children[0] as ContentDocumentNode).number).toBe('^1^');
      expect((result.children[1] as ContentDocumentNode).number).toBe('^2^');
      expect((result.children[2] as ContentDocumentNode).number).toBe('^3^');
      expect((result.children[0] as ContentDocumentNode).contents.de).toBe('A');
      expect((result.children[1] as ContentDocumentNode).contents.de).toBe('B');
      expect((result.children[2] as ContentDocumentNode).contents.de).toBe('C');
      expect(isValidDocument(result)).toBe(true);
    });

    it('splits a mixed list with superscript and regular items', () => {
      const input = createDoc([
        {
          id: 'mixed',
          number: null,
          type: 'LIST' as const,
          children: [
            {
              id: 'i1',
              number: '1.',
              type: 'LIST_ITEM' as const,
              children: [
                {
                  id: 'i1c',
                  number: null,
                  type: 'CONTENT' as const,
                  format: 'TEXT',
                  contents: { de: 'Plain list item' },
                  children: [],
                },
              ],
            },
            {
              id: 'i2',
              number: '2.',
              type: 'LIST_ITEM' as const,
              children: [
                {
                  id: 'i2c',
                  number: null,
                  type: 'CONTENT' as const,
                  format: 'MARKDOWN',
                  contents: { de: '^2^ Absatz text' },
                  children: [],
                },
              ],
            },
            {
              id: 'i3',
              number: '3.',
              type: 'LIST_ITEM' as const,
              children: [
                {
                  id: 'i3c',
                  number: null,
                  type: 'CONTENT' as const,
                  format: 'TEXT',
                  contents: { de: 'Another plain item' },
                  children: [],
                },
              ],
            },
          ],
        },
      ]);

      const result = listNumberDedupTransform(input, 'de');

      // Expected: list(plain) → content(Absatz) → list(another plain)
      expect(result.children).toHaveLength(3);
      expect(result.children[0].type).toBe('LIST');
      expect(result.children[1].type).toBe('CONTENT');
      expect(result.children[2].type).toBe('LIST');

      const firstList = result.children[0] as ListDocumentNode;
      expect(firstList.children).toHaveLength(1);
      expect((firstList.children[0] as NumberedDocumentNode).number).toBe('1.');

      const absatz = result.children[1] as ContentDocumentNode;
      expect(absatz.number).toBe('^2^');
      expect(absatz.contents.de).toBe('Absatz text');

      const secondList = result.children[2] as ListDocumentNode;
      expect(secondList.children).toHaveLength(1);
      expect((secondList.children[0] as NumberedDocumentNode).number).toBe('3.');
      expect(isValidDocument(result)).toBe(true);
    });

    it('does not convert a list_item that also has non-footnote children', () => {
      const input = createDoc([
        {
          id: 'outer',
          number: null,
          type: 'LIST' as const,
          children: [
            {
              id: 'i1',
              number: '1.',
              type: 'LIST_ITEM' as const,
              children: [
                {
                  id: 'i1c',
                  number: null,
                  type: 'CONTENT' as const,
                  format: 'MARKDOWN',
                  contents: { de: '^1^ Absatz with sublist' },
                  children: [],
                },
                {
                  id: 'sub',
                  number: null,
                  type: 'LIST' as const,
                  children: [],
                },
              ],
            },
          ],
        },
      ]);

      const result = listNumberDedupTransform(input, 'de');

      // Stays as list with list_item; markup stripped, number set on the list_item.
      expect(result.children).toHaveLength(1);
      const outerList = result.children[0] as ListDocumentNode;
      expect(outerList.type).toBe('LIST');
      const li = outerList.children[0] as ListItemDocumentNode;
      expect(li.type).toBe('LIST_ITEM');
      expect((li as NumberedDocumentNode).number).toBe('1');
      const content = li.children[0] as ContentDocumentNode;
      expect(content.type).toBe('CONTENT');
      expect(content.contents.de).toBe('Absatz with sublist');
    });

    it('converts a list_item whose content child has only footnote children', () => {
      const input = createDoc([
        {
          id: 'outer',
          number: null,
          type: 'LIST' as const,
          children: [
            {
              id: 'i1',
              number: '1.',
              type: 'LIST_ITEM' as const,
              children: [
                {
                  id: 'i1c',
                  number: null,
                  type: 'CONTENT' as const,
                  format: 'MARKDOWN',
                  contents: { de: '^1^ Text with footnote' },
                  children: [
                    {
                      id: 'fn',
                      number: 'i.',
                      type: 'FOOTNOTE' as const,
                      contents: { de: 'A footnote' },
                      format: 'TEXT',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);

      const result = listNumberDedupTransform(input, 'de');

      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe('CONTENT');
      const c = result.children[0] as ContentDocumentNode;
      expect(c.number).toBe('^1^');
      expect(c.contents.de).toBe('Text with footnote');
      expect(c.children).toHaveLength(1);
      expect(c.children[0].type).toBe('FOOTNOTE');
      expect(isValidDocument(result)).toBe(true);
    });

    it('extracts bis/ter suffix from a superscript leading number', () => {
      const input = createDoc([
        supList([
          { itemNumber: '1.', mdContent: '^1^ First' },
          { itemNumber: '2.', mdContent: '^1bis^ Inserted' },
          { itemNumber: '3.', mdContent: '^2^ Second' },
        ]),
      ]);

      const result = listNumberDedupTransform(input, 'de');

      expect(result.children).toHaveLength(3);
      expect((result.children[0] as ContentDocumentNode).number).toBe('^1^');
      expect((result.children[1] as ContentDocumentNode).number).toBe('^1bis^');
      expect((result.children[2] as ContentDocumentNode).number).toBe('^2^');
    });

    it('preserves the original list id on the first emitted segment after a split', () => {
      const originalId = 'original-list-id';
      const input = createDoc([
        {
          id: originalId,
          number: null,
          type: 'LIST' as const,
          children: [
            {
              id: 'i1',
              number: '1.',
              type: 'LIST_ITEM' as const,
              children: [
                {
                  id: 'i1c',
                  number: null,
                  type: 'CONTENT' as const,
                  format: 'TEXT',
                  contents: { de: 'Plain item' },
                  children: [],
                },
              ],
            },
            {
              id: 'i2',
              number: '2.',
              type: 'LIST_ITEM' as const,
              children: [
                {
                  id: 'i2c',
                  number: null,
                  type: 'CONTENT' as const,
                  format: 'MARKDOWN',
                  contents: { de: '^2^ Absatz' },
                  children: [],
                },
              ],
            },
          ],
        },
      ]);

      const result = listNumberDedupTransform(input, 'de');

      expect(result.children[0].type).toBe('LIST');
      expect((result.children[0] as ListDocumentNode).id).toBe(originalId);
    });

    it('downgrades format to TEXT when stripping leaves no inline marks', () => {
      const input = createDoc([supList([{ itemNumber: '1.', mdContent: '^1^ Plain text only' }])]);

      const result = listNumberDedupTransform(input, 'de');

      const c = result.children[0] as ContentDocumentNode;
      expect(c.format).toBe('TEXT');
      expect(c.contents.de).toBe('Plain text only');
    });

    it('keeps format MARKDOWN when other inline marks remain after stripping', () => {
      const input = createDoc([
        supList([{ itemNumber: '1.', mdContent: '^1^ With *italic* text' }]),
      ]);

      const result = listNumberDedupTransform(input, 'de');

      const c = result.children[0] as ContentDocumentNode;
      expect(c.format).toBe('MARKDOWN');
      expect(c.contents.de).toBe('With *italic* text');
    });
  });
});

import { describe, expect, it } from 'vitest';
import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  HeadingDocumentNode,
} from '../../types/document';
import { parseHtmlToTree } from '../document-utils';
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

    const listNode = result.children[0] as ContainerDocumentNode;
    expect(listNode.children[0].number).toBe('1');
    expect(listNode.children[1].number).toBe('2');
  });

  it('strips number prefix from content text', () => {
    const input = createDoc([
      list([{ number: '1.', content: '1 Dieser Erlass regelt das Bildungswesen.' }]),
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    const listItem = listNode.children[0] as ContainerDocumentNode;
    const contentNode = listItem.children[0] as ContentDocumentNode;
    expect(contentNode.contents.de).toBe('Dieser Erlass regelt das Bildungswesen.');
  });

  it('handles the example HTML from Mammoth output', () => {
    const html = `<ol>
    <li><sup>1</sup> Dieser Erlass regelt das Bildungswesen in der Volksschule.</li>
    <li><sup>2</sup> Er gilt für: ...</li>
    <li><sup>3</sup> Er regelt zudem die schulpsychologische Versorgung im Bereich der Volksschule und die <br />ergänzenden Angebote.</li>
</ol>`;

    const parsed = parseHtmlToTree(html, 'de');
    const result = listNumberDedupTransform(parsed, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    expect(listNode.children).toHaveLength(3);

    expect(listNode.children[0].number).toBe('1');
    expect(listNode.children[1].number).toBe('2');
    expect(listNode.children[2].number).toBe('3');

    const content0 = (listNode.children[0] as ContainerDocumentNode)
      .children[0] as ContentDocumentNode;
    expect(content0.contents.de).toBe('Dieser Erlass regelt das Bildungswesen in der Volksschule.');

    const content1 = (listNode.children[1] as ContainerDocumentNode)
      .children[0] as ContentDocumentNode;
    expect(content1.contents.de).toBe('Er gilt für: ...');

    const content2 = (listNode.children[2] as ContainerDocumentNode)
      .children[0] as ContentDocumentNode;
    expect(content2.contents.de).toContain('Er regelt zudem');
  });

  it('leaves list items without leading numbers unchanged', () => {
    const input = createDoc([
      list([
        { number: '1.', content: 'No leading number here' },
        { number: '2.', content: 'Also no number' },
      ]),
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    expect(listNode.children[0].number).toBe('1.');
    expect(listNode.children[1].number).toBe('2.');

    const content0 = (listNode.children[0] as ContainerDocumentNode)
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

    const listNode = result.children[0] as ContainerDocumentNode;
    expect(listNode.children[0].number).toBe('1');
    expect(listNode.children[1].number).toBe('1bis');
    expect(listNode.children[2].number).toBe('2');
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
    const listNode = h.children[0] as ContainerDocumentNode;
    expect(listNode.children[0].number).toBe('1');
    expect(listNode.children[1].number).toBe('2');
  });

  it('preserves non-list nodes unchanged', () => {
    const input = createDoc([content('Some text'), heading('Title')]);

    const result = listNumberDedupTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('content');
    expect(result.children[1].type).toBe('heading');
  });

  it('handles empty lists', () => {
    const input = createDoc([
      {
        id: 'test',
        number: null,
        type: 'list' as const,
        children: [],
      },
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    expect(listNode.children).toHaveLength(0);
  });

  it('processes nested lists inside list items', () => {
    const input = createDoc([
      {
        id: 'outer-list',
        number: null,
        type: 'list' as const,
        children: [
          {
            id: 'outer-item',
            number: '1.',
            type: 'list_item' as const,
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

    const outerList = result.children[0] as ContainerDocumentNode;
    const outerItem = outerList.children[0] as ContainerDocumentNode;

    // Outer item should be deduped
    expect(outerItem.number).toBe('1');
    const outerContent = outerItem.children[0] as ContentDocumentNode;
    expect(outerContent.contents.de).toBe('Outer text');

    // Inner list should also be deduped
    const innerList = outerItem.children[1] as ContainerDocumentNode;
    expect(innerList.children[0].number).toBe('1');
    expect(innerList.children[1].number).toBe('2');

    const innerContent0 = (innerList.children[0] as ContainerDocumentNode)
      .children[0] as ContentDocumentNode;
    expect(innerContent0.contents.de).toBe('Inner first');

    const innerContent1 = (innerList.children[1] as ContainerDocumentNode)
      .children[0] as ContentDocumentNode;
    expect(innerContent1.contents.de).toBe('Inner second');
  });

  it('handles list items whose first child is not a content node', () => {
    const input = createDoc([
      {
        id: 'outer-list',
        number: null,
        type: 'list' as const,
        children: [
          {
            id: 'item-with-nested-only',
            number: '1.',
            type: 'list_item' as const,
            children: [list([{ number: '1.', content: '1 Sub item' }])],
          },
        ],
      },
    ]);

    const result = listNumberDedupTransform(input, 'de');

    const outerList = result.children[0] as ContainerDocumentNode;
    const outerItem = outerList.children[0] as ContainerDocumentNode;
    // Should not have undefined in children
    expect(outerItem.children.every((c) => c !== undefined)).toBe(true);
    // The nested list should still be processed
    const innerList = outerItem.children[0] as ContainerDocumentNode;
    expect(innerList.type).toBe('list');
    expect(innerList.children[0].number).toBe('1');
  });

  it('preserves the document id', () => {
    const input = createDoc([list([{ number: '1.', content: '1 Text' }])]);
    const originalId = input.id;

    const result = listNumberDedupTransform(input, 'de');

    expect(result.id).toBe(originalId);
  });
});

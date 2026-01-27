import { describe, expect, it } from 'vitest';
import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  HeadingDocumentNode,
} from '../../types/document';
import { letteredItemsTransform } from './lettered-items';
import { content, createDoc, heading, list } from './test-helpers';

describe('letteredItemsTransform', () => {
  it('groups consecutive lettered items into list', () => {
    const input = createDoc([content('a. First'), content('b. Second')]);

    const result = letteredItemsTransform(input, 'de');

    expect(result.children).toHaveLength(1);
    expect(result.children[0].type).toBe('list');
    expect((result.children[0] as ContainerDocumentNode).children).toHaveLength(2);
  });

  it('sets correct number on list items', () => {
    const input = createDoc([content('a. First')]);

    const result = letteredItemsTransform(input, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    expect(listNode.children[0].number).toBe('a.');
  });

  it('strips letter prefix from content', () => {
    const input = createDoc([content('a. First item text')]);

    const result = letteredItemsTransform(input, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    const listItem = listNode.children[0] as ContainerDocumentNode;
    const contentNode = listItem.children[0] as ContentDocumentNode;
    expect(contentNode.contents.de).toBe('First item text');
  });

  it('breaks list on non-lettered content', () => {
    const input = createDoc([
      content('a. First'),
      content('b. Second'),
      content('Not lettered'),
      content('c. Third'),
    ]);

    const result = letteredItemsTransform(input, 'de');

    expect(result.children).toHaveLength(3);
    expect(result.children[0].type).toBe('list');
    expect((result.children[0] as ContainerDocumentNode).children).toHaveLength(2);
    expect(result.children[1].type).toBe('content');
    expect(result.children[2].type).toBe('list');
    expect((result.children[2] as ContainerDocumentNode).children).toHaveLength(1);
  });

  it('applies recursively to nested containers', () => {
    const input = createDoc([heading('Section', [content('a. First'), content('b. Second')])]);

    const result = letteredItemsTransform(input, 'de');

    const section = result.children[0] as HeadingDocumentNode;
    expect(section.children).toHaveLength(1);
    expect(section.children[0].type).toBe('list');
  });

  it('handles lettered items within headings', () => {
    const input = createDoc([
      heading('Title', [content('Intro'), content('a. First'), content('b. Second')]),
    ]);

    const result = letteredItemsTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.children).toHaveLength(2);
    expect(h.children[0].type).toBe('content');
    expect(h.children[1].type).toBe('list');
  });

  it('creates separate lists for non-consecutive runs', () => {
    const input = createDoc([
      content('a. First run A'),
      content('b. First run B'),
      content('Break'),
      content('a. Second run A'),
      content('b. Second run B'),
    ]);

    const result = letteredItemsTransform(input, 'de');

    expect(result.children).toHaveLength(3);
    expect(result.children[0].type).toBe('list');
    expect(result.children[1].type).toBe('content');
    expect(result.children[2].type).toBe('list');
  });

  it('preserves content before lettered items', () => {
    const input = createDoc([content('Preamble'), content('a. First')]);

    const result = letteredItemsTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('content');
    expect(result.children[1].type).toBe('list');
  });

  it('preserves existing lists', () => {
    const input = createDoc([
      list([
        { number: '1.', content: 'Numbered' },
        { number: '2.', content: 'Items' },
      ]),
      content('a. Lettered'),
    ]);

    const result = letteredItemsTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('list');
    expect(result.children[1].type).toBe('list');
  });

  it('handles empty document', () => {
    const input = createDoc([]);

    const result = letteredItemsTransform(input, 'de');

    expect(result.children).toHaveLength(0);
  });

  it('handles document with only non-lettered content', () => {
    const input = createDoc([content('Just text'), content('More text')]);

    const result = letteredItemsTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('content');
    expect(result.children[1].type).toBe('content');
  });

  it('preserves the document id', () => {
    const input = createDoc([content('a. First')]);
    const originalId = input.id;

    const result = letteredItemsTransform(input, 'de');

    expect(result.id).toBe(originalId);
  });

  it('handles all lowercase letters', () => {
    const input = createDoc([
      content('a. Alpha'),
      content('b. Beta'),
      content('c. Charlie'),
      content('z. Zulu'),
    ]);

    const result = letteredItemsTransform(input, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    expect(listNode.children).toHaveLength(4);
    expect(listNode.children[0].number).toBe('a.');
    expect(listNode.children[3].number).toBe('z.');
  });

  it('creates list_item with content child', () => {
    const input = createDoc([content('a. Item text')]);

    const result = letteredItemsTransform(input, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    const listItem = listNode.children[0];
    expect(listItem.type).toBe('list_item');
    expect((listItem as ContainerDocumentNode).children).toHaveLength(1);
    expect((listItem as ContainerDocumentNode).children[0].type).toBe('content');
  });

  it('handles deeply nested structure', () => {
    const input = createDoc([
      heading('Level 1', [
        heading('Level 2', [content('a. Deep item'), content('b. Another deep item')]),
      ]),
    ]);

    const result = letteredItemsTransform(input, 'de');

    const l1 = result.children[0] as HeadingDocumentNode;
    const l2 = l1.children[0] as HeadingDocumentNode;
    expect(l2.children).toHaveLength(1);
    expect(l2.children[0].type).toBe('list');
  });

  it('preserves plain text content after stripping letter prefix', () => {
    // Note: HTML formatting is stripped at parse time in document-utils.ts
    // so input to this transform is already plain text
    const input = createDoc([content('a. Bold item')]);

    const result = letteredItemsTransform(input, 'de');

    const listNode = result.children[0] as ContainerDocumentNode;
    const listItem = listNode.children[0] as ContainerDocumentNode;
    const contentNode = listItem.children[0] as ContentDocumentNode;
    expect(contentNode.contents.de).toBe('Bold item');
  });
});

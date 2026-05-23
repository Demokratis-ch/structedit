import { describe, expect, it } from 'vitest';
import type {
  ContentDocumentNode,
  DocumentRootNode,
  HeadingDocumentNode,
  ListDocumentNode,
  NumberedDocumentNode,
} from '../../types/document';
import { applySwissLegalTransforms, composeTransforms } from './index';
import { content, createDoc, heading, list } from './test-helpers';

describe('composeTransforms', () => {
  it('applies transforms left to right', () => {
    const addPrefix = (root: DocumentRootNode) => ({
      ...root,
      children: root.children.map((c) =>
        c.type === 'CONTENT'
          ? { ...c, contents: { de: `PREFIX: ${(c as ContentDocumentNode).contents.de}` } }
          : c
      ),
    });
    const addSuffix = (root: DocumentRootNode) => ({
      ...root,
      children: root.children.map((c) =>
        c.type === 'CONTENT'
          ? { ...c, contents: { de: `${(c as ContentDocumentNode).contents.de} :SUFFIX` } }
          : c
      ),
    });

    const composed = composeTransforms(addPrefix, addSuffix);
    const input = createDoc([content('Hello')]);
    const result = composed(input, 'de');

    const contentNode = result.children[0] as ContentDocumentNode;
    expect(contentNode.contents.de).toBe('PREFIX: Hello :SUFFIX');
  });

  it('returns identity for empty array', () => {
    const composed = composeTransforms();
    const input = createDoc([content('Test')]);
    const result = composed(input, 'de');

    expect(result.children).toHaveLength(1);
    expect((result.children[0] as ContentDocumentNode).contents.de).toBe('Test');
  });

  it('works with single transform', () => {
    const upper = (root: DocumentRootNode) => ({
      ...root,
      children: root.children.map((c) =>
        c.type === 'CONTENT'
          ? { ...c, contents: { de: (c as ContentDocumentNode).contents.de?.toUpperCase() } }
          : c
      ),
    });

    const composed = composeTransforms(upper);
    const input = createDoc([content('hello')]);
    const result = composed(input, 'de');

    expect((result.children[0] as ContentDocumentNode).contents.de).toBe('HELLO');
  });
});

describe('applySwissLegalTransforms', () => {
  it('applies all transforms in correct order', () => {
    const input = createDoc([
      content('I. First Section'),
      content('Art. 1 Title'),
      content('a. First item'),
      content('b. Second item'),
      content('II. Second Section'),
    ]);

    const result = applySwissLegalTransforms(input, 'de');

    // Should have 2 top-level headings (I., II.)
    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('HEADING');
    expect(result.children[1].type).toBe('HEADING');

    // I. should contain Art. 1 as nested heading
    const section1 = result.children[0] as HeadingDocumentNode;
    expect(section1.number).toBe('I.');
    expect(section1.contents.de).toBe('First Section');
    expect(section1.children).toHaveLength(1);
    expect(section1.children[0].type).toBe('HEADING');

    // Art. 1 should contain a list
    const article = section1.children[0] as HeadingDocumentNode;
    expect(article.number).toBe('Art. 1');
    expect(article.contents.de).toBe('Title');
    expect(article.children).toHaveLength(1);
    expect(article.children[0].type).toBe('LIST');

    // List should have 2 items
    const list = article.children[0] as ListDocumentNode;
    expect(list.children).toHaveLength(2);
    expect((list.children[0] as NumberedDocumentNode).number).toBe('a.');
    expect((list.children[1] as NumberedDocumentNode).number).toBe('b.');
  });

  it('respects config to disable romanSections', () => {
    const input = createDoc([content('I. Section')]);

    const result = applySwissLegalTransforms(input, 'de', { romanSections: false });

    expect(result.children[0].type).toBe('CONTENT');
  });

  it('respects config to disable articles', () => {
    const input = createDoc([content('Art. 1 Title')]);

    const result = applySwissLegalTransforms(input, 'de', { articles: false });

    expect(result.children[0].type).toBe('CONTENT');
  });

  it('respects config to disable letteredItems', () => {
    const input = createDoc([content('a. First'), content('b. Second')]);

    const result = applySwissLegalTransforms(input, 'de', { letteredItems: false });

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('CONTENT');
    expect(result.children[1].type).toBe('CONTENT');
  });

  it('merges adjacent lists by default', () => {
    const input = createDoc([
      list([{ number: '1.', content: 'A' }]),
      list([{ number: '1.', content: 'B' }]),
    ]);

    const result = applySwissLegalTransforms(input, 'de');

    expect(result.children).toHaveLength(1);
    expect(result.children[0].type).toBe('LIST');
    const merged = result.children[0] as ListDocumentNode;
    expect(merged.children).toHaveLength(2);
  });

  it('respects config to disable mergeAdjacentLists', () => {
    const input = createDoc([
      list([{ number: '1.', content: 'A' }]),
      list([{ number: '1.', content: 'B' }]),
    ]);

    const result = applySwissLegalTransforms(input, 'de', { mergeAdjacentLists: false });

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('LIST');
    expect(result.children[1].type).toBe('LIST');
  });

  it('preserves lettered list_item numbers verbatim through the full pipeline', () => {
    // Whole-pipeline assertion of the user's "no auto-renumber" requirement:
    // when two adjacent lettered lists are merged, the original markers from
    // both lists survive — even if the apparent sequence restarts.
    const input = createDoc([
      list([
        { number: 'a)', content: 'A' },
        { number: 'b)', content: 'B' },
      ]),
      list([
        { number: 'a)', content: 'C' },
        { number: 'b)', content: 'D' },
      ]),
    ]);

    const result = applySwissLegalTransforms(input, 'de');

    expect(result.children).toHaveLength(1);
    const merged = result.children[0] as ListDocumentNode;
    expect(merged.children.map((c) => (c as NumberedDocumentNode).number)).toEqual([
      'a)',
      'b)',
      'a)',
      'b)',
    ]);
  });

  it('handles complex nested structure', () => {
    const input = createDoc([
      content('I. First Section'),
      content('Art. 1 First Article'),
      content('Some intro text'),
      content('a. Item A'),
      content('b. Item B'),
      content('Art. 2 Second Article'),
      content('More content'),
      content('II. Second Section'),
      content('Art. 3 Third Article'),
      content('Final content'),
    ]);

    const result = applySwissLegalTransforms(input, 'de');

    // Two top-level sections
    expect(result.children).toHaveLength(2);

    // Section I
    const section1 = result.children[0] as HeadingDocumentNode;
    expect(section1.number).toBe('I.');
    expect(section1.contents.de).toBe('First Section');
    expect(section1.children).toHaveLength(2); // Art. 1 and Art. 2

    // Art. 1 under Section I
    const art1 = section1.children[0] as HeadingDocumentNode;
    expect(art1.number).toBe('Art. 1');
    expect(art1.contents.de).toBe('First Article');
    expect(art1.children).toHaveLength(2); // intro text and list

    // Art. 2 under Section I
    const art2 = section1.children[1] as HeadingDocumentNode;
    expect(art2.number).toBe('Art. 2');
    expect(art2.contents.de).toBe('Second Article');
    expect(art2.children).toHaveLength(1); // More content

    // Section II
    const section2 = result.children[1] as HeadingDocumentNode;
    expect(section2.number).toBe('II.');
    expect(section2.contents.de).toBe('Second Section');
    expect(section2.children).toHaveLength(1); // Art. 3

    // Art. 3 under Section II
    const art3 = section2.children[0] as HeadingDocumentNode;
    expect(art3.number).toBe('Art. 3');
    expect(art3.contents.de).toBe('Third Article');
  });

  it('preserves existing headings', () => {
    const input = createDoc([heading('Existing'), content('I. Roman Section')]);

    const result = applySwissLegalTransforms(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('HEADING');
    expect((result.children[0] as HeadingDocumentNode).contents.de).toBe('Existing');
  });

  it('handles document with no legal patterns', () => {
    const input = createDoc([content('Plain text'), content('More text')]);

    const result = applySwissLegalTransforms(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('CONTENT');
    expect(result.children[1].type).toBe('CONTENT');
  });

  it('handles empty document', () => {
    const input = createDoc([]);

    const result = applySwissLegalTransforms(input, 'de');

    expect(result.children).toHaveLength(0);
  });

  it('preserves document id', () => {
    const input = createDoc([content('I. Section')]);
    const originalId = input.id;

    const result = applySwissLegalTransforms(input, 'de');

    expect(result.id).toBe(originalId);
  });
});

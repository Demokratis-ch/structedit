import { describe, expect, it } from 'vitest';
import type { ContainerDocumentNode, HeadingDocumentNode } from '../../types/document';
import { romanSectionTransform } from './roman-section';
import { content, createDoc, heading, list } from './test-helpers';

describe('romanSectionTransform', () => {
  it('converts roman numeral content to heading', () => {
    const input = createDoc([content('I. First Section'), content('Some content')]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(1);
    expect(result.children[0].type).toBe('heading');
    const h = result.children[0] as HeadingDocumentNode;
    expect(h.contents.de).toBe('I. First Section');
    expect(h.children).toHaveLength(1);
    expect(h.children[0].type).toBe('content');
  });

  it('creates multiple sections for multiple roman numerals', () => {
    const input = createDoc([
      content('I. First'),
      content('Content 1'),
      content('II. Second'),
      content('Content 2'),
    ]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    const section1 = result.children[0] as HeadingDocumentNode;
    const section2 = result.children[1] as HeadingDocumentNode;
    expect(section1.contents.de).toBe('I. First');
    expect(section1.children).toHaveLength(1);
    expect(section2.contents.de).toBe('II. Second');
    expect(section2.children).toHaveLength(1);
  });

  it('preserves content before first section', () => {
    const input = createDoc([content('Preamble'), content('I. First Section')]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('content');
    expect(result.children[1].type).toBe('heading');
  });

  it('does not modify non-document roots', () => {
    const input = heading('Some heading', [content('I. This should not become heading')]);

    const result = romanSectionTransform(input as ContainerDocumentNode, 'de');

    expect(result.children[0].type).toBe('content');
  });

  it('preserves existing headings in document', () => {
    const input = createDoc([heading('Existing heading'), content('I. First Section')]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('heading');
    expect((result.children[0] as HeadingDocumentNode).contents.de).toBe('Existing heading');
    expect(result.children[1].type).toBe('heading');
    expect((result.children[1] as HeadingDocumentNode).contents.de).toBe('I. First Section');
  });

  it('preserves existing lists in document', () => {
    const input = createDoc([
      list([
        { number: '1.', content: 'Item 1' },
        { number: '2.', content: 'Item 2' },
      ]),
      content('I. First Section'),
    ]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('list');
    expect(result.children[1].type).toBe('heading');
  });

  it('nests multiple content nodes under a section', () => {
    const input = createDoc([
      content('I. First Section'),
      content('First paragraph'),
      content('Second paragraph'),
      content('Third paragraph'),
    ]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(1);
    const section = result.children[0] as HeadingDocumentNode;
    expect(section.children).toHaveLength(3);
  });

  it('nests lists under sections', () => {
    const input = createDoc([
      content('I. First Section'),
      list([{ number: null, content: 'Item' }]),
    ]);

    const result = romanSectionTransform(input, 'de');

    const section = result.children[0] as HeadingDocumentNode;
    expect(section.children).toHaveLength(1);
    expect(section.children[0].type).toBe('list');
  });

  it('nests headings under sections', () => {
    const input = createDoc([content('I. First Section'), heading('Sub heading')]);

    const result = romanSectionTransform(input, 'de');

    const section = result.children[0] as HeadingDocumentNode;
    expect(section.children).toHaveLength(1);
    expect(section.children[0].type).toBe('heading');
  });

  it('handles empty document', () => {
    const input = createDoc([]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(0);
  });

  it('handles document with only non-section content', () => {
    const input = createDoc([content('Just some text'), content('More text')]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('content');
    expect(result.children[1].type).toBe('content');
  });

  it('preserves the document id', () => {
    const input = createDoc([content('I. First')]);
    const originalId = input.id;

    const result = romanSectionTransform(input, 'de');

    expect(result.id).toBe(originalId);
  });

  it('handles all roman numeral variations', () => {
    const input = createDoc([
      content('III. Section Three'),
      content('Content under III'),
      content('IV. Section Four'),
      content('Content under IV'),
      content('IX. Section Nine'),
      content('Content under IX'),
    ]);

    const result = romanSectionTransform(input, 'de');

    expect(result.children).toHaveLength(3);
    expect((result.children[0] as HeadingDocumentNode).contents.de).toContain('III.');
    expect((result.children[1] as HeadingDocumentNode).contents.de).toContain('IV.');
    expect((result.children[2] as HeadingDocumentNode).contents.de).toContain('IX.');
  });
});

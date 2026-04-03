import { describe, expect, it } from 'vitest';
import type { HeadingDocumentNode } from '../../types/document';
import { articleTransform } from './article';
import { content, createDoc, heading, list } from './test-helpers';

describe('articleTransform', () => {
  it('converts article content to heading with number extracted', () => {
    const input = createDoc([content('Art. 1 Title'), content('Article content')]);

    const result = articleTransform(input, 'de');

    expect(result.children).toHaveLength(1);
    expect(result.children[0].type).toBe('heading');
    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBe('Art. 1');
    expect(h.contents.de).toBe('Title');
  });

  it('nests following content under article', () => {
    const input = createDoc([content('Art. 1 Title'), content('Article content')]);

    const result = articleTransform(input, 'de');

    const article = result.children[0] as HeadingDocumentNode;
    expect(article.children).toHaveLength(1);
    expect(article.children[0].type).toBe('content');
  });

  it('handles multiple articles in sequence', () => {
    const input = createDoc([
      content('Art. 1 First'),
      content('Content 1'),
      content('Art. 2 Second'),
      content('Content 2'),
    ]);

    const result = articleTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    const art1 = result.children[0] as HeadingDocumentNode;
    const art2 = result.children[1] as HeadingDocumentNode;
    expect(art1.number).toBe('Art. 1');
    expect(art1.contents.de).toBe('First');
    expect(art1.children).toHaveLength(1);
    expect(art2.number).toBe('Art. 2');
    expect(art2.contents.de).toBe('Second');
    expect(art2.children).toHaveLength(1);
  });

  it('applies recursively to nested headings', () => {
    const input = createDoc([
      heading('Section', [content('Art. 1 Title'), content('Article content')]),
    ]);

    const result = articleTransform(input, 'de');

    const section = result.children[0] as HeadingDocumentNode;
    expect(section.children).toHaveLength(1);
    expect(section.children[0].type).toBe('heading');
    const article = section.children[0] as HeadingDocumentNode;
    expect(article.number).toBe('Art. 1');
    expect(article.contents.de).toBe('Title');
  });

  it('stops nesting at next article', () => {
    const input = createDoc([
      content('Art. 1 First'),
      content('Content under Art 1'),
      content('Art. 2 Second'),
    ]);

    const result = articleTransform(input, 'de');

    const art1 = result.children[0] as HeadingDocumentNode;
    expect(art1.children).toHaveLength(1);
    expect(art1.children[0].type).toBe('content');
  });

  it('handles § pattern', () => {
    const input = createDoc([content('§ 5 Some title'), content('Content')]);

    const result = articleTransform(input, 'de');

    expect(result.children).toHaveLength(1);
    const h = result.children[0] as HeadingDocumentNode;
    expect(h.type).toBe('heading');
    expect(h.number).toBe('§ 5');
    expect(h.contents.de).toBe('Some title');
  });

  it('preserves non-content nodes', () => {
    const input = createDoc([
      content('Art. 1 Title'),
      list([{ number: null, content: 'Item' }]),
      content('After list'),
    ]);

    const result = articleTransform(input, 'de');

    const article = result.children[0] as HeadingDocumentNode;
    // list breaks the nesting
    expect(article.children).toHaveLength(0);
    expect(result.children).toHaveLength(3);
  });

  it('preserves content before first article', () => {
    const input = createDoc([content('Preamble'), content('Art. 1 Title')]);

    const result = articleTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('content');
    expect(result.children[1].type).toBe('heading');
  });

  it('handles Art. X Abs. Y pattern', () => {
    const input = createDoc([content('Art. 1 Abs. 2 Title')]);

    const result = articleTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.type).toBe('heading');
    expect(h.number).toBe('Art. 1 Abs. 2');
    expect(h.contents.de).toBe('Title');
  });

  it('handles article with letter suffix', () => {
    const input = createDoc([content('Art. 12a Title')]);

    const result = articleTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.type).toBe('heading');
    expect(h.number).toBe('Art. 12a');
    expect(h.contents.de).toBe('Title');
  });

  it('handles empty document', () => {
    const input = createDoc([]);

    const result = articleTransform(input, 'de');

    expect(result.children).toHaveLength(0);
  });

  it('handles document with only non-article content', () => {
    const input = createDoc([content('Just some text'), content('More text')]);

    const result = articleTransform(input, 'de');

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('content');
    expect(result.children[1].type).toBe('content');
  });

  it('preserves the document id', () => {
    const input = createDoc([content('Art. 1 Title')]);
    const originalId = input.id;

    const result = articleTransform(input, 'de');

    expect(result.id).toBe(originalId);
  });

  it('handles deeply nested structure', () => {
    const input = createDoc([
      heading('Section I', [heading('Subsection', [content('Art. 1 Deep'), content('Content')])]),
    ]);

    const result = articleTransform(input, 'de');

    const section = result.children[0] as HeadingDocumentNode;
    const subsection = section.children[0] as HeadingDocumentNode;
    expect(subsection.children).toHaveLength(1);
    expect(subsection.children[0].type).toBe('heading');
    const article = subsection.children[0] as HeadingDocumentNode;
    expect(article.number).toBe('Art. 1');
    expect(article.contents.de).toBe('Deep');
  });

  it('nests multiple content nodes under article', () => {
    const input = createDoc([
      content('Art. 1 Title'),
      content('First paragraph'),
      content('Second paragraph'),
      content('Third paragraph'),
    ]);

    const result = articleTransform(input, 'de');

    const article = result.children[0] as HeadingDocumentNode;
    expect(article.children).toHaveLength(3);
  });
});

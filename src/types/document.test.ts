import { describe, expect, it } from 'vitest';
import {
  ALLOWED_FORMATS,
  canBeChildOf,
  canHaveFormat,
  DEFAULT_FORMAT,
  exampleDocument,
  isValidDocument,
  isValidNode,
  type NodeFormat,
} from './document';

describe('Document validation', () => {
  it('validates the example document', () => {
    expect(isValidDocument(exampleDocument)).toBe(true);
  });

  it('validates individual nodes', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Hello' },
        children: [],
        format: 'TEXT',
      })
    ).toBe(true);
  });

  it('rejects nodes with invalid type', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'invalid',
        contents: {},
      })
    ).toBe(false);
  });

  it('rejects nodes with duplicate ids', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          { id: '2', number: null, type: 'content', contents: { en: 'A' }, children: [] },
          { id: '2', number: null, type: 'content', contents: { en: 'B' }, children: [] },
        ],
      })
    ).toBe(false);
  });

  it('rejects list_item outside of list', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list_item',
            children: [
              { id: '3', number: null, type: 'content', contents: { en: 'Item' }, children: [] },
            ],
          },
        ],
      })
    ).toBe(false);
  });

  it('accepts list_item inside list', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'list_item',
                children: [
                  {
                    id: '4',
                    number: null,
                    type: 'content',
                    contents: { en: 'Item' },
                    children: [],
                    format: 'TEXT',
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toBe(true);
  });

  it('rejects list_item with contents property (old leaf structure)', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [{ id: '3', number: '1.', type: 'list_item', contents: { en: 'Item' } }],
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects container nodes with contents', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'document',
        children: [],
        contents: { en: 'Should not have this' },
      })
    ).toBe(false);
  });

  it('rejects leaf nodes with children', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'image',
        contents: { en: 'image.png' },
        children: [],
      })
    ).toBe(false);
  });

  it('rejects invalid language keys in contents', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { xyz: 'Invalid language' },
      })
    ).toBe(false);
  });

  it('accepts footnote as a leaf node with contents', () => {
    expect(
      isValidNode({
        id: '1',
        number: 'i.',
        type: 'footnote',
        contents: { en: 'This is a footnote.' },
        format: 'TEXT',
      })
    ).toBe(true);
  });

  it('rejects footnote with children (old container structure)', () => {
    expect(
      isValidNode({
        id: '1',
        number: 'i.',
        type: 'footnote',
        children: [{ id: '2', number: null, type: 'content', contents: { en: 'Text' } }],
      })
    ).toBe(false);
  });
});

describe('canBeChildOf', () => {
  describe('document parent', () => {
    it('allows heading as child of document', () => {
      expect(canBeChildOf('heading', 'document')).toBe(true);
    });

    it('allows list as child of document', () => {
      expect(canBeChildOf('list', 'document')).toBe(true);
    });

    it('allows content as child of document', () => {
      expect(canBeChildOf('content', 'document')).toBe(true);
    });

    it('allows footnote as child of document', () => {
      expect(canBeChildOf('footnote', 'document')).toBe(true);
    });

    it('allows image as child of document', () => {
      expect(canBeChildOf('image', 'document')).toBe(true);
    });

    it('rejects list_item as child of document', () => {
      expect(canBeChildOf('list_item', 'document')).toBe(false);
    });
  });

  describe('heading parent', () => {
    it('allows heading as child of heading', () => {
      expect(canBeChildOf('heading', 'heading')).toBe(true);
    });

    it('allows list as child of heading', () => {
      expect(canBeChildOf('list', 'heading')).toBe(true);
    });

    it('allows content as child of heading', () => {
      expect(canBeChildOf('content', 'heading')).toBe(true);
    });

    it('allows footnote as child of heading', () => {
      expect(canBeChildOf('footnote', 'heading')).toBe(true);
    });

    it('allows image as child of heading', () => {
      expect(canBeChildOf('image', 'heading')).toBe(true);
    });

    it('rejects list_item as child of heading', () => {
      expect(canBeChildOf('list_item', 'heading')).toBe(false);
    });
  });

  describe('list parent', () => {
    it('allows list_item as child of list', () => {
      expect(canBeChildOf('list_item', 'list')).toBe(true);
    });

    it('rejects heading as child of list', () => {
      expect(canBeChildOf('heading', 'list')).toBe(false);
    });

    it('rejects content as child of list', () => {
      expect(canBeChildOf('content', 'list')).toBe(false);
    });

    it('rejects list as child of list', () => {
      expect(canBeChildOf('list', 'list')).toBe(false);
    });

    it('rejects footnote as child of list', () => {
      expect(canBeChildOf('footnote', 'list')).toBe(false);
    });

    it('rejects image as child of list', () => {
      expect(canBeChildOf('image', 'list')).toBe(false);
    });
  });

  describe('list_item parent', () => {
    it('allows content as child of list_item', () => {
      expect(canBeChildOf('content', 'list_item')).toBe(true);
    });

    it('allows heading as child of list_item', () => {
      expect(canBeChildOf('heading', 'list_item')).toBe(true);
    });

    it('allows nested list as child of list_item', () => {
      expect(canBeChildOf('list', 'list_item')).toBe(true);
    });

    it('allows footnote as child of list_item', () => {
      expect(canBeChildOf('footnote', 'list_item')).toBe(true);
    });

    it('allows image as child of list_item', () => {
      expect(canBeChildOf('image', 'list_item')).toBe(true);
    });

    it('rejects list_item as direct child of list_item', () => {
      expect(canBeChildOf('list_item', 'list_item')).toBe(false);
    });
  });

  describe('null parent (root level)', () => {
    it('allows heading at root level', () => {
      expect(canBeChildOf('heading', null)).toBe(true);
    });

    it('allows content at root level', () => {
      expect(canBeChildOf('content', null)).toBe(true);
    });

    it('allows list at root level', () => {
      expect(canBeChildOf('list', null)).toBe(true);
    });

    it('rejects list_item at root level', () => {
      expect(canBeChildOf('list_item', null)).toBe(false);
    });
  });
});

describe('Document validation - parent-child rules', () => {
  it('rejects content directly inside list', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [
              {
                id: '3',
                number: null,
                type: 'content',
                contents: { en: 'Invalid!' },
                children: [],
              },
            ],
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects heading directly inside list', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [
              { id: '3', number: '1', type: 'heading', contents: { en: 'Invalid!' }, children: [] },
            ],
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects nested list directly inside list (must be inside list_item)', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [
              {
                id: '3',
                number: null,
                type: 'list',
                children: [
                  {
                    id: '4',
                    number: '1.',
                    type: 'list_item',
                    children: [
                      {
                        id: '5',
                        number: null,
                        type: 'content',
                        contents: { en: 'Item' },
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects footnote directly inside list', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [{ id: '3', number: 'i.', type: 'footnote', contents: { en: 'Invalid' } }],
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects image directly inside list', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [{ id: '3', number: null, type: 'image', contents: { en: 'image.png' } }],
          },
        ],
      })
    ).toBe(false);
  });

  it('accepts nested list inside list_item', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'list_item',
                children: [
                  {
                    id: '4',
                    number: null,
                    type: 'content',
                    contents: { en: 'Item' },
                    children: [],
                    format: 'TEXT',
                  },
                  {
                    id: '5',
                    number: null,
                    type: 'list',
                    children: [
                      {
                        id: '6',
                        number: 'a.',
                        type: 'list_item',
                        children: [
                          {
                            id: '7',
                            number: null,
                            type: 'content',
                            contents: { en: 'Nested' },
                            children: [],
                            format: 'TEXT',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toBe(true);
  });

  it('accepts footnote inside heading', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: '1',
            type: 'heading',
            contents: { en: 'Title' },
            format: 'TEXT',
            children: [
              {
                id: '3',
                number: 'i.',
                type: 'footnote',
                contents: { en: 'Note' },
                format: 'TEXT',
              },
            ],
          },
        ],
      })
    ).toBe(true);
  });

  it('accepts image inside list_item', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'list_item',
                children: [
                  {
                    id: '4',
                    number: null,
                    type: 'image',
                    contents: { en: 'image.png' },
                    format: 'TEXT',
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toBe(true);
  });
});

describe('Content node as hybrid type (with footnote children)', () => {
  it('accepts content node with empty children array', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Hello' },
        children: [],
        format: 'TEXT',
      })
    ).toBe(true);
  });

  it('accepts content node with footnote children', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Text with footnote' },
        format: 'TEXT',
        children: [
          {
            id: '2',
            number: 'i.',
            type: 'footnote',
            contents: { en: 'Footnote text' },
            format: 'TEXT',
          },
        ],
      })
    ).toBe(true);
  });

  it('accepts content node with multiple footnote children', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Text' },
        format: 'TEXT',
        children: [
          { id: '2', number: 'i.', type: 'footnote', contents: { en: 'First' }, format: 'TEXT' },
          { id: '3', number: 'ii.', type: 'footnote', contents: { en: 'Second' }, format: 'TEXT' },
        ],
      })
    ).toBe(true);
  });

  it('rejects content node without children property (old structure)', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Hello' },
      })
    ).toBe(false);
  });

  it('rejects content node with heading child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Text' },
        children: [
          { id: '2', number: '1', type: 'heading', contents: { en: 'Heading' }, children: [] },
        ],
      })
    ).toBe(false);
  });

  it('rejects content node with nested content child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Text' },
        children: [
          { id: '2', number: null, type: 'content', contents: { en: 'Nested' }, children: [] },
        ],
      })
    ).toBe(false);
  });

  it('rejects content node with list child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Text' },
        children: [{ id: '2', number: null, type: 'list', children: [] }],
      })
    ).toBe(false);
  });

  it('rejects content node with image child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Text' },
        children: [{ id: '2', number: null, type: 'image', contents: { en: 'img.png' } }],
      })
    ).toBe(false);
  });

  it('rejects content node with list_item child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'Text' },
        children: [{ id: '2', number: null, type: 'list_item', children: [] }],
      })
    ).toBe(false);
  });

  it('rejects content node with invalid contents', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: 'not an object',
        children: [],
      })
    ).toBe(false);
  });
});

describe('canBeChildOf - content parent', () => {
  it('allows footnote as child of content', () => {
    expect(canBeChildOf('footnote', 'content')).toBe(true);
  });

  it('rejects heading as child of content', () => {
    expect(canBeChildOf('heading', 'content')).toBe(false);
  });

  it('rejects content as child of content', () => {
    expect(canBeChildOf('content', 'content')).toBe(false);
  });

  it('rejects list as child of content', () => {
    expect(canBeChildOf('list', 'content')).toBe(false);
  });

  it('rejects list_item as child of content', () => {
    expect(canBeChildOf('list_item', 'content')).toBe(false);
  });

  it('rejects image as child of content', () => {
    expect(canBeChildOf('image', 'content')).toBe(false);
  });
});

describe('NodeFormat — type and tables', () => {
  it('NodeFormat union accepts the five spec values', () => {
    const values: NodeFormat[] = [
      'TEXT',
      'NEWLINES',
      'MARKDOWN_MINIMAL',
      'MARKDOWN_INLINE',
      'MARKDOWN',
    ];
    expect(values).toHaveLength(5);
  });

  it('ALLOWED_FORMATS exposes per-type allow-lists', () => {
    expect(ALLOWED_FORMATS.heading).toEqual(['TEXT', 'NEWLINES', 'MARKDOWN_MINIMAL']);
    expect(ALLOWED_FORMATS.content).toEqual(['TEXT', 'NEWLINES', 'MARKDOWN']);
    expect(ALLOWED_FORMATS.footnote).toEqual(['TEXT', 'NEWLINES', 'MARKDOWN']);
    expect(ALLOWED_FORMATS.image).toEqual(['TEXT', 'NEWLINES']);
  });

  it('DEFAULT_FORMAT is TEXT for every content-bearing type', () => {
    expect(DEFAULT_FORMAT.heading).toBe('TEXT');
    expect(DEFAULT_FORMAT.content).toBe('TEXT');
    expect(DEFAULT_FORMAT.footnote).toBe('TEXT');
    expect(DEFAULT_FORMAT.image).toBe('TEXT');
  });
});

describe('canHaveFormat', () => {
  it('returns true for an allowed (heading, MARKDOWN_MINIMAL) pair', () => {
    expect(canHaveFormat('heading', 'MARKDOWN_MINIMAL')).toBe(true);
  });

  it('returns false for (heading, MARKDOWN)', () => {
    expect(canHaveFormat('heading', 'MARKDOWN')).toBe(false);
  });

  it('returns true for (content, MARKDOWN)', () => {
    expect(canHaveFormat('content', 'MARKDOWN')).toBe(true);
  });

  it('returns false for (content, MARKDOWN_MINIMAL)', () => {
    expect(canHaveFormat('content', 'MARKDOWN_MINIMAL')).toBe(false);
  });

  it('returns true for (footnote, MARKDOWN)', () => {
    expect(canHaveFormat('footnote', 'MARKDOWN')).toBe(true);
  });

  it('returns false for (image, MARKDOWN)', () => {
    expect(canHaveFormat('image', 'MARKDOWN')).toBe(false);
  });

  it('returns true for (image, NEWLINES)', () => {
    expect(canHaveFormat('image', 'NEWLINES')).toBe(true);
  });

  it('returns false for container types like document/list/list_item', () => {
    // @ts-expect-error — container types are not allowed in canHaveFormat callers
    expect(canHaveFormat('document', 'TEXT')).toBe(false);
    // @ts-expect-error
    expect(canHaveFormat('list', 'TEXT')).toBe(false);
    // @ts-expect-error
    expect(canHaveFormat('list_item', 'TEXT')).toBe(false);
  });
});

describe('isValidNode — format field rules', () => {
  it('rejects content node missing format field', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'hello' },
        children: [],
      })
    ).toBe(false);
  });

  it('rejects heading node missing format field', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'heading',
        contents: { en: 'Title' },
        children: [],
      })
    ).toBe(false);
  });

  it('rejects footnote node missing format field', () => {
    expect(
      isValidNode({
        id: '1',
        number: 'i.',
        type: 'footnote',
        contents: { en: 'Note' },
      })
    ).toBe(false);
  });

  it('rejects image node missing format field', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'image',
        contents: { en: 'img.png' },
      })
    ).toBe(false);
  });

  it('accepts heading with allowed format MARKDOWN_MINIMAL', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'heading',
        contents: { en: 'Title' },
        children: [],
        format: 'MARKDOWN_MINIMAL',
      })
    ).toBe(true);
  });

  it('rejects heading with disallowed format MARKDOWN', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'heading',
        contents: { en: 'Title' },
        children: [],
        format: 'MARKDOWN',
      })
    ).toBe(false);
  });

  it('rejects content with disallowed format MARKDOWN_MINIMAL', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'x' },
        children: [],
        format: 'MARKDOWN_MINIMAL',
      })
    ).toBe(false);
  });

  it('rejects image with disallowed format MARKDOWN', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'image',
        contents: { en: 'i.png' },
        format: 'MARKDOWN',
      })
    ).toBe(false);
  });

  it('rejects content node with format set to a totally unknown value', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'content',
        contents: { en: 'x' },
        children: [],
        format: 'WHATEVER',
      })
    ).toBe(false);
  });

  it('rejects container node (list) carrying a format field', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'list',
        children: [],
        format: 'TEXT',
      })
    ).toBe(false);
  });

  it('rejects document node carrying a format field', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [],
        format: 'TEXT',
      })
    ).toBe(false);
  });

  it('rejects list_item carrying a format field', () => {
    expect(
      isValidDocument({
        id: '1',
        number: null,
        type: 'document',
        children: [
          {
            id: '2',
            number: null,
            type: 'list',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'list_item',
                children: [],
                format: 'TEXT',
              },
            ],
          },
        ],
      })
    ).toBe(false);
  });
});

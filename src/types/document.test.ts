import { describe, expect, it } from 'vitest';
import {
  ALLOWED_FORMATS,
  type ContentDocumentNode,
  canBeChildOf,
  canHaveFormat,
  DEFAULT_FORMAT,
  DOC_TREE_VERSION,
  type DocumentNode,
  type DocumentRootNode,
  exampleDocument,
  type FootnoteDocumentNode,
  type HeadingDocumentNode,
  type ImageDocumentNode,
  isValidDocTreeEnvelope,
  isValidDocument,
  isValidNode,
  type ListDocumentNode,
  type ListItemDocumentNode,
  type NodeFormat,
  type NumberedDocumentNode,
} from './document';

/**
 * ============================ Type-level assertions (issue #104) ============================
 * These are erased at runtime; they are verified by `npm run typecheck` (tsc). They lock the
 * per-node-type interface shapes so the module stays a faithful reference for the DocTree format.
 */
type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

// Collected into one (non-exported) tuple so tsc checks them without exporting from a test module.
type _TypeAssertions = [
  // Each node type owns its own `type` discriminant.
  Expect<Equal<DocumentRootNode['type'], 'DOCUMENT'>>,
  Expect<Equal<ListDocumentNode['type'], 'LIST'>>,
  Expect<Equal<ListItemDocumentNode['type'], 'LIST_ITEM'>>,
  Expect<Equal<HeadingDocumentNode['type'], 'HEADING'>>,
  Expect<Equal<ContentDocumentNode['type'], 'CONTENT'>>,
  Expect<Equal<FootnoteDocumentNode['type'], 'FOOTNOTE'>>,
  Expect<Equal<ImageDocumentNode['type'], 'IMAGE'>>,
  // The document root has no `number`; every other node type does.
  Expect<Equal<HasKey<DocumentRootNode, 'number'>, false>>,
  Expect<Equal<HasKey<ListDocumentNode, 'number'>, true>>,
  Expect<Equal<HasKey<HeadingDocumentNode, 'number'>, true>>,
  Expect<Equal<HasKey<FootnoteDocumentNode, 'number'>, true>>,
  // `DocumentNode` is the union of all seven per-type interfaces.
  Expect<
    Equal<
      DocumentNode,
      | DocumentRootNode
      | ListDocumentNode
      | ListItemDocumentNode
      | HeadingDocumentNode
      | ContentDocumentNode
      | FootnoteDocumentNode
      | ImageDocumentNode
    >
  >,
  // `NumberedDocumentNode` is exactly the non-root nodes, and every one carries a `number`.
  Expect<Equal<HasKey<NumberedDocumentNode, 'number'>, true>>,
  Expect<Equal<Extract<NumberedDocumentNode, DocumentRootNode>, never>>,
];

describe('Document validation', () => {
  it('validates the example document', () => {
    expect(isValidDocument(exampleDocument)).toBe(true);
  });

  describe('SCREAMING_SNAKE_CASE type values (issue #103)', () => {
    it('accepts an uppercase HEADING node', () => {
      expect(
        isValidNode({
          id: '1',
          number: null,
          type: 'HEADING',
          contents: { en: 'Title' },
          children: [],
          format: 'TEXT',
        })
      ).toBe(true);
    });

    it('rejects a lowercase heading node (legacy form)', () => {
      expect(
        isValidNode({
          id: '1',
          number: null,
          type: 'heading',
          contents: { en: 'Title' },
          children: [],
          format: 'TEXT',
        })
      ).toBe(false);
    });

    it('accepts an uppercase DOCUMENT root', () => {
      expect(
        isValidDocument({
          id: '1',
          type: 'DOCUMENT',
          children: [],
        })
      ).toBe(true);
    });

    it('rejects a lowercase document root (legacy form)', () => {
      expect(
        isValidDocument({
          id: '1',
          number: null,
          type: 'document',
          children: [],
        })
      ).toBe(false);
    });

    it('accepts a LIST containing a LIST_ITEM (uppercase)', () => {
      expect(
        isValidDocument({
          id: '1',
          type: 'DOCUMENT',
          children: [
            {
              id: '2',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: '3',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: '4',
                      number: null,
                      type: 'CONTENT',
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
  });

  it('validates individual nodes', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
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
        type: 'DOCUMENT',
        children: [
          { id: '2', number: null, type: 'CONTENT', contents: { en: 'A' }, children: [] },
          { id: '2', number: null, type: 'CONTENT', contents: { en: 'B' }, children: [] },
        ],
      })
    ).toBe(false);
  });

  it('rejects list_item outside of list', () => {
    expect(
      isValidDocument({
        id: '1',
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST_ITEM',
            children: [
              { id: '3', number: null, type: 'CONTENT', contents: { en: 'Item' }, children: [] },
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
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: '4',
                    number: null,
                    type: 'CONTENT',
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
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [{ id: '3', number: '1.', type: 'LIST_ITEM', contents: { en: 'Item' } }],
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects container nodes with contents', () => {
    expect(
      isValidNode({
        id: '1',
        type: 'DOCUMENT',
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
        type: 'IMAGE',
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
        type: 'CONTENT',
        contents: { xyz: 'Invalid language' },
      })
    ).toBe(false);
  });

  it('accepts footnote as a leaf node with contents', () => {
    expect(
      isValidNode({
        id: '1',
        number: 'i.',
        type: 'FOOTNOTE',
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
        type: 'FOOTNOTE',
        children: [{ id: '2', number: null, type: 'CONTENT', contents: { en: 'Text' } }],
      })
    ).toBe(false);
  });
});

describe('DOCUMENT number-field rules (issue #104)', () => {
  it('accepts a DOCUMENT root with no number field', () => {
    expect(isValidDocument({ id: '1', type: 'DOCUMENT', children: [] })).toBe(true);
  });

  it('rejects a DOCUMENT root carrying a real (string) number', () => {
    expect(isValidDocument({ id: '1', number: 'X', type: 'DOCUMENT', children: [] })).toBe(false);
  });

  it('still accepts a legacy DOCUMENT root with number: null', () => {
    // Persisted documents created before the field was removed still carry `number: null`.
    expect(isValidDocument({ id: '1', number: null, type: 'DOCUMENT', children: [] })).toBe(true);
  });

  it('still rejects a non-DOCUMENT node that omits the number field', () => {
    // Guards against an over-broad loosening: only the document root may drop number.
    expect(
      isValidNode({
        id: '1',
        type: 'CONTENT',
        contents: { en: 'x' },
        children: [],
        format: 'TEXT',
      })
    ).toBe(false);
  });
});

describe('canBeChildOf', () => {
  describe('document parent', () => {
    it('allows heading as child of document', () => {
      expect(canBeChildOf('HEADING', 'DOCUMENT')).toBe(true);
    });

    it('allows list as child of document', () => {
      expect(canBeChildOf('LIST', 'DOCUMENT')).toBe(true);
    });

    it('allows content as child of document', () => {
      expect(canBeChildOf('CONTENT', 'DOCUMENT')).toBe(true);
    });

    it('allows footnote as child of document', () => {
      expect(canBeChildOf('FOOTNOTE', 'DOCUMENT')).toBe(true);
    });

    it('allows image as child of document', () => {
      expect(canBeChildOf('IMAGE', 'DOCUMENT')).toBe(true);
    });

    it('rejects list_item as child of document', () => {
      expect(canBeChildOf('LIST_ITEM', 'DOCUMENT')).toBe(false);
    });
  });

  describe('heading parent', () => {
    it('allows heading as child of heading', () => {
      expect(canBeChildOf('HEADING', 'HEADING')).toBe(true);
    });

    it('allows list as child of heading', () => {
      expect(canBeChildOf('LIST', 'HEADING')).toBe(true);
    });

    it('allows content as child of heading', () => {
      expect(canBeChildOf('CONTENT', 'HEADING')).toBe(true);
    });

    it('allows footnote as child of heading', () => {
      expect(canBeChildOf('FOOTNOTE', 'HEADING')).toBe(true);
    });

    it('allows image as child of heading', () => {
      expect(canBeChildOf('IMAGE', 'HEADING')).toBe(true);
    });

    it('rejects list_item as child of heading', () => {
      expect(canBeChildOf('LIST_ITEM', 'HEADING')).toBe(false);
    });
  });

  describe('list parent', () => {
    it('allows list_item as child of list', () => {
      expect(canBeChildOf('LIST_ITEM', 'LIST')).toBe(true);
    });

    it('rejects heading as child of list', () => {
      expect(canBeChildOf('HEADING', 'LIST')).toBe(false);
    });

    it('rejects content as child of list', () => {
      expect(canBeChildOf('CONTENT', 'LIST')).toBe(false);
    });

    it('rejects list as child of list', () => {
      expect(canBeChildOf('LIST', 'LIST')).toBe(false);
    });

    it('rejects footnote as child of list', () => {
      expect(canBeChildOf('FOOTNOTE', 'LIST')).toBe(false);
    });

    it('rejects image as child of list', () => {
      expect(canBeChildOf('IMAGE', 'LIST')).toBe(false);
    });
  });

  describe('list_item parent', () => {
    it('allows content as child of list_item', () => {
      expect(canBeChildOf('CONTENT', 'LIST_ITEM')).toBe(true);
    });

    it('allows heading as child of list_item', () => {
      expect(canBeChildOf('HEADING', 'LIST_ITEM')).toBe(true);
    });

    it('allows nested list as child of list_item', () => {
      expect(canBeChildOf('LIST', 'LIST_ITEM')).toBe(true);
    });

    it('allows footnote as child of list_item', () => {
      expect(canBeChildOf('FOOTNOTE', 'LIST_ITEM')).toBe(true);
    });

    it('allows image as child of list_item', () => {
      expect(canBeChildOf('IMAGE', 'LIST_ITEM')).toBe(true);
    });

    it('rejects list_item as direct child of list_item', () => {
      expect(canBeChildOf('LIST_ITEM', 'LIST_ITEM')).toBe(false);
    });
  });

  describe('null parent (root level)', () => {
    it('allows heading at root level', () => {
      expect(canBeChildOf('HEADING', null)).toBe(true);
    });

    it('allows content at root level', () => {
      expect(canBeChildOf('CONTENT', null)).toBe(true);
    });

    it('allows list at root level', () => {
      expect(canBeChildOf('LIST', null)).toBe(true);
    });

    it('rejects list_item at root level', () => {
      expect(canBeChildOf('LIST_ITEM', null)).toBe(false);
    });
  });
});

describe('Document validation - parent-child rules', () => {
  it('rejects content directly inside list', () => {
    expect(
      isValidDocument({
        id: '1',
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [
              {
                id: '3',
                number: null,
                type: 'CONTENT',
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
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [
              { id: '3', number: '1', type: 'HEADING', contents: { en: 'Invalid!' }, children: [] },
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
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [
              {
                id: '3',
                number: null,
                type: 'LIST',
                children: [
                  {
                    id: '4',
                    number: '1.',
                    type: 'LIST_ITEM',
                    children: [
                      {
                        id: '5',
                        number: null,
                        type: 'CONTENT',
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
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [{ id: '3', number: 'i.', type: 'FOOTNOTE', contents: { en: 'Invalid' } }],
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects image directly inside list', () => {
    expect(
      isValidDocument({
        id: '1',
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [{ id: '3', number: null, type: 'IMAGE', contents: { en: 'image.png' } }],
          },
        ],
      })
    ).toBe(false);
  });

  it('accepts nested list inside list_item', () => {
    expect(
      isValidDocument({
        id: '1',
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: '4',
                    number: null,
                    type: 'CONTENT',
                    contents: { en: 'Item' },
                    children: [],
                    format: 'TEXT',
                  },
                  {
                    id: '5',
                    number: null,
                    type: 'LIST',
                    children: [
                      {
                        id: '6',
                        number: 'a.',
                        type: 'LIST_ITEM',
                        children: [
                          {
                            id: '7',
                            number: null,
                            type: 'CONTENT',
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
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: '1',
            type: 'HEADING',
            contents: { en: 'Title' },
            format: 'TEXT',
            children: [
              {
                id: '3',
                number: 'i.',
                type: 'FOOTNOTE',
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
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: '4',
                    number: null,
                    type: 'IMAGE',
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
        type: 'CONTENT',
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
        type: 'CONTENT',
        contents: { en: 'Text with footnote' },
        format: 'TEXT',
        children: [
          {
            id: '2',
            number: 'i.',
            type: 'FOOTNOTE',
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
        type: 'CONTENT',
        contents: { en: 'Text' },
        format: 'TEXT',
        children: [
          { id: '2', number: 'i.', type: 'FOOTNOTE', contents: { en: 'First' }, format: 'TEXT' },
          { id: '3', number: 'ii.', type: 'FOOTNOTE', contents: { en: 'Second' }, format: 'TEXT' },
        ],
      })
    ).toBe(true);
  });

  it('rejects content node without children property (old structure)', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
        contents: { en: 'Hello' },
      })
    ).toBe(false);
  });

  it('rejects content node with heading child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
        contents: { en: 'Text' },
        children: [
          { id: '2', number: '1', type: 'HEADING', contents: { en: 'Heading' }, children: [] },
        ],
      })
    ).toBe(false);
  });

  it('rejects content node with nested content child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
        contents: { en: 'Text' },
        children: [
          { id: '2', number: null, type: 'CONTENT', contents: { en: 'Nested' }, children: [] },
        ],
      })
    ).toBe(false);
  });

  it('rejects content node with list child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
        contents: { en: 'Text' },
        children: [{ id: '2', number: null, type: 'LIST', children: [] }],
      })
    ).toBe(false);
  });

  it('rejects content node with image child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
        contents: { en: 'Text' },
        children: [{ id: '2', number: null, type: 'IMAGE', contents: { en: 'img.png' } }],
      })
    ).toBe(false);
  });

  it('rejects content node with list_item child', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
        contents: { en: 'Text' },
        children: [{ id: '2', number: null, type: 'LIST_ITEM', children: [] }],
      })
    ).toBe(false);
  });

  it('rejects content node with invalid contents', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
        contents: 'not an object',
        children: [],
      })
    ).toBe(false);
  });
});

describe('canBeChildOf - content parent', () => {
  it('allows footnote as child of content', () => {
    expect(canBeChildOf('FOOTNOTE', 'CONTENT')).toBe(true);
  });

  it('rejects heading as child of content', () => {
    expect(canBeChildOf('HEADING', 'CONTENT')).toBe(false);
  });

  it('rejects content as child of content', () => {
    expect(canBeChildOf('CONTENT', 'CONTENT')).toBe(false);
  });

  it('rejects list as child of content', () => {
    expect(canBeChildOf('LIST', 'CONTENT')).toBe(false);
  });

  it('rejects list_item as child of content', () => {
    expect(canBeChildOf('LIST_ITEM', 'CONTENT')).toBe(false);
  });

  it('rejects image as child of content', () => {
    expect(canBeChildOf('IMAGE', 'CONTENT')).toBe(false);
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
    expect(ALLOWED_FORMATS.HEADING).toEqual(['TEXT', 'NEWLINES', 'MARKDOWN_MINIMAL']);
    expect(ALLOWED_FORMATS.CONTENT).toEqual(['TEXT', 'NEWLINES', 'MARKDOWN']);
    expect(ALLOWED_FORMATS.FOOTNOTE).toEqual(['TEXT', 'NEWLINES', 'MARKDOWN']);
    expect(ALLOWED_FORMATS.IMAGE).toEqual(['TEXT', 'NEWLINES']);
  });

  it('DEFAULT_FORMAT is TEXT for every content-bearing type', () => {
    expect(DEFAULT_FORMAT.HEADING).toBe('TEXT');
    expect(DEFAULT_FORMAT.CONTENT).toBe('TEXT');
    expect(DEFAULT_FORMAT.FOOTNOTE).toBe('TEXT');
    expect(DEFAULT_FORMAT.IMAGE).toBe('TEXT');
  });
});

describe('canHaveFormat', () => {
  it('returns true for an allowed (heading, MARKDOWN_MINIMAL) pair', () => {
    expect(canHaveFormat('HEADING', 'MARKDOWN_MINIMAL')).toBe(true);
  });

  it('returns false for (heading, MARKDOWN)', () => {
    expect(canHaveFormat('HEADING', 'MARKDOWN')).toBe(false);
  });

  it('returns true for (content, MARKDOWN)', () => {
    expect(canHaveFormat('CONTENT', 'MARKDOWN')).toBe(true);
  });

  it('returns false for (content, MARKDOWN_MINIMAL)', () => {
    expect(canHaveFormat('CONTENT', 'MARKDOWN_MINIMAL')).toBe(false);
  });

  it('returns true for (footnote, MARKDOWN)', () => {
    expect(canHaveFormat('FOOTNOTE', 'MARKDOWN')).toBe(true);
  });

  it('returns false for (image, MARKDOWN)', () => {
    expect(canHaveFormat('IMAGE', 'MARKDOWN')).toBe(false);
  });

  it('returns true for (image, NEWLINES)', () => {
    expect(canHaveFormat('IMAGE', 'NEWLINES')).toBe(true);
  });

  it('returns false for container types like document/list/list_item', () => {
    // @ts-expect-error — container types are not allowed in canHaveFormat callers
    expect(canHaveFormat('DOCUMENT', 'TEXT')).toBe(false);
    // @ts-expect-error
    expect(canHaveFormat('LIST', 'TEXT')).toBe(false);
    // @ts-expect-error
    expect(canHaveFormat('LIST_ITEM', 'TEXT')).toBe(false);
  });
});

describe('DocTreeEnvelope', () => {
  const envelopeFor = (overrides: Record<string, unknown> = {}) => ({
    DocTreeVersion: DOC_TREE_VERSION,
    metadata: { title: { de: 'Beispieldokument' } },
    document: exampleDocument,
    ...overrides,
  });

  it('exports DOC_TREE_VERSION as 1', () => {
    expect(DOC_TREE_VERSION).toBe(1);
  });

  it('accepts a well-formed envelope around exampleDocument', () => {
    expect(isValidDocTreeEnvelope(envelopeFor())).toBe(true);
  });

  it('accepts an envelope with an empty title map', () => {
    expect(isValidDocTreeEnvelope(envelopeFor({ metadata: { title: {} } }))).toBe(true);
  });

  it('rejects an envelope with a missing DocTreeVersion', () => {
    const env = envelopeFor() as Record<string, unknown>;
    delete env.DocTreeVersion;
    expect(isValidDocTreeEnvelope(env)).toBe(false);
  });

  it('rejects an envelope with an unsupported DocTreeVersion', () => {
    expect(isValidDocTreeEnvelope(envelopeFor({ DocTreeVersion: 2 }))).toBe(false);
  });

  it('rejects an envelope with missing metadata', () => {
    const env = envelopeFor() as Record<string, unknown>;
    delete env.metadata;
    expect(isValidDocTreeEnvelope(env)).toBe(false);
  });

  it('rejects an envelope whose metadata.title is missing', () => {
    expect(isValidDocTreeEnvelope(envelopeFor({ metadata: {} }))).toBe(false);
  });

  it('rejects an envelope whose metadata.title uses an invalid language key', () => {
    expect(isValidDocTreeEnvelope(envelopeFor({ metadata: { title: { xyz: 'Hi' } } }))).toBe(false);
  });

  it('rejects an envelope whose metadata.title has a non-string value', () => {
    expect(isValidDocTreeEnvelope(envelopeFor({ metadata: { title: { de: 42 } } }))).toBe(false);
  });

  it('rejects an envelope with a missing document', () => {
    const env = envelopeFor() as Record<string, unknown>;
    delete env.document;
    expect(isValidDocTreeEnvelope(env)).toBe(false);
  });

  it('rejects an envelope whose document is not a valid document tree', () => {
    expect(
      isValidDocTreeEnvelope(
        envelopeFor({
          document: { id: '1', number: null, type: 'HEADING', contents: {}, children: [] },
        })
      )
    ).toBe(false);
  });

  it('rejects non-object inputs', () => {
    expect(isValidDocTreeEnvelope(null)).toBe(false);
    expect(isValidDocTreeEnvelope(undefined)).toBe(false);
    expect(isValidDocTreeEnvelope('envelope')).toBe(false);
  });
});

describe('isValidNode — format field rules', () => {
  it('rejects content node missing format field', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'CONTENT',
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
        type: 'HEADING',
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
        type: 'FOOTNOTE',
        contents: { en: 'Note' },
      })
    ).toBe(false);
  });

  it('rejects image node missing format field', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'IMAGE',
        contents: { en: 'img.png' },
      })
    ).toBe(false);
  });

  it('accepts heading with allowed format MARKDOWN_MINIMAL', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'HEADING',
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
        type: 'HEADING',
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
        type: 'CONTENT',
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
        type: 'IMAGE',
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
        type: 'CONTENT',
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
        type: 'LIST',
        children: [],
        format: 'TEXT',
      })
    ).toBe(false);
  });

  it('rejects document node carrying a format field', () => {
    expect(
      isValidDocument({
        id: '1',
        type: 'DOCUMENT',
        children: [],
        format: 'TEXT',
      })
    ).toBe(false);
  });

  it('rejects list_item carrying a format field', () => {
    expect(
      isValidDocument({
        id: '1',
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'LIST_ITEM',
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

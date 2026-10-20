import { describe, expect, it } from 'vitest';
import {
  ALLOWED_FORMATS,
  type BlockDocumentNode,
  type ContentDocumentNode,
  type ContentGroupChildNode,
  type ContentGroupDocumentNode,
  canBeChildOf,
  canHaveFormat,
  DEFAULT_FORMAT,
  type DefinitionListDocumentNode,
  DOC_TREE_VERSION,
  type DocumentNode,
  type DocumentRootNode,
  exampleDocument,
  type FootnoteDocumentNode,
  type HeadingDocumentNode,
  hasEditableText,
  type ImageDocumentNode,
  isValidDocTreeEnvelope,
  isValidDocument,
  isValidNode,
  type ListDocumentNode,
  type ListItemChildNode,
  type ListItemDocumentNode,
  type NodeFormat,
  type NumberedDocumentNode,
  type ParentDocumentNode,
  type TableDocumentNode,
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
  Expect<Equal<ContentGroupDocumentNode['type'], 'CONTENT_GROUP'>>,
  Expect<Equal<TableDocumentNode['type'], 'TABLE'>>,
  Expect<Equal<DefinitionListDocumentNode['type'], 'DEFINITION_LIST'>>,
  // The document root has no `number`; every other node type does.
  Expect<Equal<HasKey<DocumentRootNode, 'number'>, false>>,
  Expect<Equal<HasKey<ListDocumentNode, 'number'>, true>>,
  Expect<Equal<HasKey<HeadingDocumentNode, 'number'>, true>>,
  Expect<Equal<HasKey<FootnoteDocumentNode, 'number'>, true>>,
  Expect<Equal<HasKey<ContentGroupDocumentNode, 'number'>, true>>,
  Expect<Equal<HasKey<TableDocumentNode, 'number'>, true>>,
  Expect<Equal<HasKey<DefinitionListDocumentNode, 'number'>, true>>,
  // The platform types carry the wire fields the Demokratis envelope requires (issue #150):
  // a content group has contents + format + children, the two leaves have contents + format.
  Expect<Equal<HasKey<ContentGroupDocumentNode, 'contents'>, true>>,
  Expect<Equal<HasKey<ContentGroupDocumentNode, 'format'>, true>>,
  Expect<Equal<HasKey<ContentGroupDocumentNode, 'children'>, true>>,
  Expect<Equal<HasKey<TableDocumentNode, 'children'>, false>>,
  Expect<Equal<HasKey<DefinitionListDocumentNode, 'children'>, false>>,
  // `DocumentNode` is the union of all ten per-type interfaces.
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
      | ContentGroupDocumentNode
      | TableDocumentNode
      | DefinitionListDocumentNode
    >
  >,
  // `NumberedDocumentNode` is exactly the non-root nodes, and every one carries a `number`.
  Expect<Equal<HasKey<NumberedDocumentNode, 'number'>, true>>,
  Expect<Equal<Extract<NumberedDocumentNode, DocumentRootNode>, never>>,
  // Each `children` field is typed to its exact allowed child union (issue #114): the parent→child
  // rules `ALLOWED_CHILDREN`/`canBeChildOf` enforce at runtime are now also encoded in the types.
  Expect<Equal<ListDocumentNode['children'], ListItemDocumentNode[]>>,
  Expect<Equal<ContentDocumentNode['children'], FootnoteDocumentNode[]>>,
  Expect<Equal<DocumentRootNode['children'], BlockDocumentNode[]>>,
  Expect<Equal<HeadingDocumentNode['children'], BlockDocumentNode[]>>,
  // A list item may hold everything a heading may, except a content group (platform rule).
  Expect<Equal<ListItemDocumentNode['children'], ListItemChildNode[]>>,
  Expect<Equal<ListItemChildNode, Exclude<BlockDocumentNode, ContentGroupDocumentNode>>>,
  // A content group holds only lists, paragraphs and images.
  Expect<Equal<ContentGroupDocumentNode['children'], ContentGroupChildNode[]>>,
  Expect<Equal<ContentGroupChildNode, ListDocumentNode | ContentDocumentNode | ImageDocumentNode>>,
  // `BlockDocumentNode` is the block-level union; `ParentDocumentNode` is exactly the nodes that
  // carry `children` (every node type except the four leaves).
  Expect<
    Equal<
      BlockDocumentNode,
      | HeadingDocumentNode
      | ListDocumentNode
      | ContentDocumentNode
      | FootnoteDocumentNode
      | ImageDocumentNode
      | ContentGroupDocumentNode
      | TableDocumentNode
      | DefinitionListDocumentNode
    >
  >,
  Expect<
    Equal<
      Exclude<DocumentNode, ParentDocumentNode>,
      FootnoteDocumentNode | ImageDocumentNode | TableDocumentNode | DefinitionListDocumentNode
    >
  >,
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

/**
 * ====================== Platform node types (issue #150) ======================
 * CONTENT_GROUP, TABLE and DEFINITION_LIST mirror the Demokratis DocTree exactly as its JSON
 * envelope exposes them (see openspec/changes/add-platform-node-types/design.md).
 */

const tableNode = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 't1',
  number: '',
  type: 'TABLE',
  contents: { de: '| a | b |\n| - | - |\n| 1 | 2 |' },
  format: 'MARKDOWN',
  ...overrides,
});

const definitionListNode = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'd1',
  number: '',
  type: 'DEFINITION_LIST',
  contents: { de: 'Bund :: Die Eidgenossenschaft' },
  format: 'MARKDOWN',
  ...overrides,
});

const contentGroupNode = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'g1',
  number: '2',
  type: 'CONTENT_GROUP',
  contents: {},
  format: 'TEXT',
  children: [],
  ...overrides,
});

const paragraph = (id: string, number: string | null = null): ContentDocumentNode => ({
  id,
  number,
  type: 'CONTENT',
  format: 'TEXT',
  contents: { de: `Absatz ${id}` },
  children: [],
});

const documentWith = (children: unknown[]): Record<string, unknown> => ({
  id: 'root',
  type: 'DOCUMENT',
  children,
});

describe('Platform node types (issue #150) — node type set', () => {
  it('accepts a document using a content group, a table and a definition list', () => {
    expect(
      isValidDocument(
        documentWith([
          contentGroupNode({
            children: [
              paragraph('p1'),
              { id: 'l1', number: null, type: 'LIST', children: [] },
              { id: 'i1', number: null, type: 'IMAGE', contents: { de: 'x.png' }, format: 'TEXT' },
            ],
          }),
          tableNode(),
          definitionListNode(),
        ])
      )
    ).toBe(true);
  });

  it('rejects a node of an unknown type', () => {
    expect(isValidNode({ id: '1', number: null, type: 'QUESTION', children: [] })).toBe(false);
  });

  it('shows every node type in the example document', () => {
    const types = new Set<string>();
    const walk = (n: DocumentNode) => {
      types.add(n.type);
      if ('children' in n) n.children.forEach(walk);
    };
    walk(exampleDocument);
    expect([...types].sort()).toEqual(
      [
        'CONTENT',
        'CONTENT_GROUP',
        'DEFINITION_LIST',
        'DOCUMENT',
        'FOOTNOTE',
        'HEADING',
        'IMAGE',
        'LIST',
        'LIST_ITEM',
        'TABLE',
      ].sort()
    );
  });
});

describe('Platform node types (issue #150) — canBeChildOf', () => {
  it('allows a content group under the document root and under a heading', () => {
    expect(canBeChildOf('CONTENT_GROUP', 'DOCUMENT')).toBe(true);
    expect(canBeChildOf('CONTENT_GROUP', null)).toBe(true);
    expect(canBeChildOf('CONTENT_GROUP', 'HEADING')).toBe(true);
  });

  it('rejects a content group under a list item, a list, a content node or another group', () => {
    expect(canBeChildOf('CONTENT_GROUP', 'LIST_ITEM')).toBe(false);
    expect(canBeChildOf('CONTENT_GROUP', 'LIST')).toBe(false);
    expect(canBeChildOf('CONTENT_GROUP', 'CONTENT')).toBe(false);
    expect(canBeChildOf('CONTENT_GROUP', 'CONTENT_GROUP')).toBe(false);
  });

  it('allows only lists, content and images inside a content group', () => {
    expect(canBeChildOf('LIST', 'CONTENT_GROUP')).toBe(true);
    expect(canBeChildOf('CONTENT', 'CONTENT_GROUP')).toBe(true);
    expect(canBeChildOf('IMAGE', 'CONTENT_GROUP')).toBe(true);
    expect(canBeChildOf('HEADING', 'CONTENT_GROUP')).toBe(false);
    expect(canBeChildOf('FOOTNOTE', 'CONTENT_GROUP')).toBe(false);
    expect(canBeChildOf('TABLE', 'CONTENT_GROUP')).toBe(false);
    expect(canBeChildOf('DEFINITION_LIST', 'CONTENT_GROUP')).toBe(false);
    expect(canBeChildOf('LIST_ITEM', 'CONTENT_GROUP')).toBe(false);
  });

  it('allows tables and definition lists under document, heading and list item', () => {
    for (const type of ['TABLE', 'DEFINITION_LIST'] as const) {
      expect(canBeChildOf(type, 'DOCUMENT')).toBe(true);
      expect(canBeChildOf(type, 'HEADING')).toBe(true);
      expect(canBeChildOf(type, 'LIST_ITEM')).toBe(true);
    }
  });

  it('rejects tables and definition lists under content, list and content group', () => {
    for (const type of ['TABLE', 'DEFINITION_LIST'] as const) {
      expect(canBeChildOf(type, 'CONTENT')).toBe(false);
      expect(canBeChildOf(type, 'LIST')).toBe(false);
      expect(canBeChildOf(type, 'CONTENT_GROUP')).toBe(false);
    }
  });

  it('rejects a content group nested in a list item at document level', () => {
    expect(
      isValidDocument(
        documentWith([
          {
            id: 'l',
            number: null,
            type: 'LIST',
            children: [
              { id: 'li', number: '1.', type: 'LIST_ITEM', children: [contentGroupNode()] },
            ],
          },
        ])
      )
    ).toBe(false);
  });

  it('rejects a content group nested in a content group', () => {
    expect(
      isValidDocument(
        documentWith([contentGroupNode({ children: [contentGroupNode({ id: 'g2' })] })])
      )
    ).toBe(false);
  });

  it('rejects a heading or a table inside a content group', () => {
    const heading = {
      id: 'h',
      number: null,
      type: 'HEADING',
      contents: { de: 'x' },
      format: 'TEXT',
      children: [],
    };
    expect(isValidDocument(documentWith([contentGroupNode({ children: [heading] })]))).toBe(false);
    expect(isValidDocument(documentWith([contentGroupNode({ children: [tableNode()] })]))).toBe(
      false
    );
  });
});

describe('Platform node types (issue #150) — TABLE and DEFINITION_LIST are leaves', () => {
  it('accepts a well-formed table and definition list', () => {
    expect(isValidNode(tableNode())).toBe(true);
    expect(isValidNode(definitionListNode())).toBe(true);
  });

  it('rejects a children field on either leaf', () => {
    expect(isValidNode(tableNode({ children: [] }))).toBe(false);
    expect(isValidNode(definitionListNode({ children: [] }))).toBe(false);
  });

  it('rejects a missing contents field', () => {
    const t = tableNode();
    delete t.contents;
    expect(isValidNode(t)).toBe(false);
    const d = definitionListNode();
    delete d.contents;
    expect(isValidNode(d)).toBe(false);
  });

  it('requires a number field but accepts the empty string the platform emits', () => {
    const t = tableNode();
    delete t.number;
    expect(isValidNode(t)).toBe(false);
    expect(isValidNode(tableNode({ number: '' }))).toBe(true);
    expect(isValidNode(tableNode({ number: 'Tab. 1' }))).toBe(true);
    expect(isValidNode(tableNode({ number: null }))).toBe(true);
  });

  it('rejects a missing format and any format other than MARKDOWN', () => {
    const t = tableNode();
    delete t.format;
    expect(isValidNode(t)).toBe(false);
    expect(isValidNode(tableNode({ format: 'TEXT' }))).toBe(false);
    expect(isValidNode(tableNode({ format: 'MARKDOWN_INLINE' }))).toBe(false);
    expect(isValidNode(definitionListNode({ format: 'TEXT' }))).toBe(false);
    expect(isValidNode(definitionListNode({ format: 'NEWLINES' }))).toBe(false);
  });
});

describe('Platform node types (issue #150) — CONTENT_GROUP wire shape', () => {
  it('accepts a group with empty contents and a number', () => {
    expect(isValidNode(contentGroupNode())).toBe(true);
  });

  it('accepts a group exactly as the platform exports it (empty string per language)', () => {
    expect(isValidNode(contentGroupNode({ contents: { de: '', fr: '' } }))).toBe(true);
  });

  it('tolerates text in the hidden contents rather than rejecting a platform export', () => {
    expect(isValidNode(contentGroupNode({ contents: { de: 'stray' } }))).toBe(true);
  });

  it('rejects a group missing contents', () => {
    const g = contentGroupNode();
    delete g.contents;
    expect(isValidNode(g)).toBe(false);
  });

  it('rejects a group missing format, or with a Markdown format', () => {
    const g = contentGroupNode();
    delete g.format;
    expect(isValidNode(g)).toBe(false);
    expect(isValidNode(contentGroupNode({ format: 'MARKDOWN' }))).toBe(false);
    expect(isValidNode(contentGroupNode({ format: 'MARKDOWN_MINIMAL' }))).toBe(false);
    expect(isValidNode(contentGroupNode({ format: 'NEWLINES' }))).toBe(true);
  });

  it('rejects a group missing its children array', () => {
    const g = contentGroupNode();
    delete g.children;
    expect(isValidNode(g)).toBe(false);
  });

  it('rejects a group missing its number field', () => {
    const g = contentGroupNode();
    delete g.number;
    expect(isValidNode(g)).toBe(false);
  });

  it('validates the children of a group against the group rules', () => {
    expect(isValidNode(contentGroupNode({ children: [paragraph('p')] }))).toBe(true);
    expect(
      isValidNode(
        contentGroupNode({
          children: [{ id: 'f', number: null, type: 'FOOTNOTE', contents: {}, format: 'TEXT' }],
        })
      )
    ).toBe(false);
  });
});

describe('Platform node types (issue #150) — formats', () => {
  it('ALLOWED_FORMATS mirrors the platform allow-lists', () => {
    expect(ALLOWED_FORMATS.TABLE).toEqual(['MARKDOWN']);
    expect(ALLOWED_FORMATS.DEFINITION_LIST).toEqual(['MARKDOWN']);
    expect(ALLOWED_FORMATS.CONTENT_GROUP).toEqual(['TEXT', 'NEWLINES']);
  });

  it('DEFAULT_FORMAT is MARKDOWN for the structured blocks and TEXT for a group', () => {
    expect(DEFAULT_FORMAT.TABLE).toBe('MARKDOWN');
    expect(DEFAULT_FORMAT.DEFINITION_LIST).toBe('MARKDOWN');
    expect(DEFAULT_FORMAT.CONTENT_GROUP).toBe('TEXT');
  });

  it('canHaveFormat reflects the new allow-lists', () => {
    expect(canHaveFormat('TABLE', 'MARKDOWN')).toBe(true);
    expect(canHaveFormat('TABLE', 'TEXT')).toBe(false);
    expect(canHaveFormat('DEFINITION_LIST', 'MARKDOWN')).toBe(true);
    expect(canHaveFormat('DEFINITION_LIST', 'NEWLINES')).toBe(false);
    expect(canHaveFormat('CONTENT_GROUP', 'NEWLINES')).toBe(true);
    expect(canHaveFormat('CONTENT_GROUP', 'MARKDOWN')).toBe(false);
  });
});

describe('Platform node types (issue #150) — hasEditableText', () => {
  it('is true for every node whose text the user edits in the tree', () => {
    expect(hasEditableText(paragraph('p'))).toBe(true);
    expect(hasEditableText(tableNode() as unknown as DocumentNode)).toBe(true);
    expect(hasEditableText(definitionListNode() as unknown as DocumentNode)).toBe(true);
    expect(
      hasEditableText({
        id: 'h',
        number: null,
        type: 'HEADING',
        contents: {},
        format: 'TEXT',
        children: [],
      })
    ).toBe(true);
    expect(
      hasEditableText({ id: 'f', number: null, type: 'FOOTNOTE', contents: {}, format: 'TEXT' })
    ).toBe(true);
    expect(
      hasEditableText({ id: 'i', number: null, type: 'IMAGE', contents: {}, format: 'TEXT' })
    ).toBe(true);
  });

  it('is false for a content group (its contents exist only for the wire) and for containers', () => {
    expect(hasEditableText(contentGroupNode() as unknown as DocumentNode)).toBe(false);
    expect(hasEditableText({ id: 'l', number: null, type: 'LIST', children: [] })).toBe(false);
    expect(hasEditableText({ id: 'li', number: null, type: 'LIST_ITEM', children: [] })).toBe(
      false
    );
    expect(hasEditableText({ id: 'r', type: 'DOCUMENT', children: [] })).toBe(false);
  });
});

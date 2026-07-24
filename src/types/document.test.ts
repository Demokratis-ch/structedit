import { describe, expect, it } from 'vitest';
import {
  ALLOWED_FORMATS,
  ALLOWED_MODES,
  type BlockDocumentNode,
  type CheckboxDocumentNode,
  type ContentDocumentNode,
  type ContributionMode,
  canBeChildOf,
  canHaveFormat,
  canHaveMode,
  carryModeOrClamp,
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
  type ParentDocumentNode,
  PROPOSABLE_TYPES,
  type QuestionChildNode,
  type QuestionDocumentNode,
  type RadiobuttonDocumentNode,
  type TextareaDocumentNode,
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
  // `DocumentNode` is the union of all per-type interfaces (structural + questionnaire).
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
      | QuestionDocumentNode
      | RadiobuttonDocumentNode
      | CheckboxDocumentNode
      | TextareaDocumentNode
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
  Expect<Equal<ListItemDocumentNode['children'], BlockDocumentNode[]>>,
  // `BlockDocumentNode` is the block-level union; `ParentDocumentNode` is exactly the nodes that
  // carry `children` (every node type except the two leaves).
  Expect<
    Equal<
      BlockDocumentNode,
      | HeadingDocumentNode
      | ListDocumentNode
      | ContentDocumentNode
      | FootnoteDocumentNode
      | ImageDocumentNode
      | QuestionDocumentNode
    >
  >,
  // The leaves are exactly the nodes without a `children` array.
  Expect<
    Equal<
      Exclude<DocumentNode, ParentDocumentNode>,
      | FootnoteDocumentNode
      | ImageDocumentNode
      | RadiobuttonDocumentNode
      | CheckboxDocumentNode
      | TextareaDocumentNode
    >
  >,
  // A QUESTION's children are exactly the question child union.
  Expect<Equal<QuestionDocumentNode['children'], QuestionChildNode[]>>,
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

// Type-level: every node interface (incl. the root and containers) carries the optional
// `contributionMode` key. Erased at runtime; checked by tsc.
type _ContributionModeTypeAssertions = [
  Expect<Equal<HasKey<DocumentRootNode, 'contributionMode'>, true>>,
  Expect<Equal<HasKey<ListDocumentNode, 'contributionMode'>, true>>,
  Expect<Equal<HasKey<ListItemDocumentNode, 'contributionMode'>, true>>,
  Expect<Equal<HasKey<HeadingDocumentNode, 'contributionMode'>, true>>,
  Expect<Equal<HasKey<ContentDocumentNode, 'contributionMode'>, true>>,
  Expect<Equal<HasKey<FootnoteDocumentNode, 'contributionMode'>, true>>,
  Expect<Equal<HasKey<ImageDocumentNode, 'contributionMode'>, true>>,
  Expect<Equal<ContributionMode, 'NONE' | 'REMARK' | 'PROPOSAL'>>,
];

describe('ContributionMode — tables and helpers', () => {
  it('PROPOSABLE_TYPES are heading/content/footnote', () => {
    expect([...PROPOSABLE_TYPES]).toEqual(['HEADING', 'CONTENT', 'FOOTNOTE']);
  });

  it('ALLOWED_MODES lists NONE for every node type', () => {
    for (const type of Object.keys(ALLOWED_MODES) as (keyof typeof ALLOWED_MODES)[]) {
      expect(ALLOWED_MODES[type]).toContain('NONE');
    }
  });

  it('allows REMARK on every type except question options and the free-text field', () => {
    const noRemark = new Set<DocumentNode['type']>(['RADIOBUTTON', 'CHECKBOX', 'TEXTAREA']);
    for (const type of Object.keys(ALLOWED_MODES) as (keyof typeof ALLOWED_MODES)[]) {
      expect((ALLOWED_MODES[type] as readonly string[]).includes('REMARK')).toBe(
        !noRemark.has(type)
      );
    }
  });

  it('ALLOWED_MODES adds PROPOSAL only to proposable types', () => {
    expect(ALLOWED_MODES.HEADING).toContain('PROPOSAL');
    expect(ALLOWED_MODES.CONTENT).toContain('PROPOSAL');
    expect(ALLOWED_MODES.FOOTNOTE).toContain('PROPOSAL');
    expect(ALLOWED_MODES.DOCUMENT).not.toContain('PROPOSAL');
    expect(ALLOWED_MODES.LIST).not.toContain('PROPOSAL');
    expect(ALLOWED_MODES.LIST_ITEM).not.toContain('PROPOSAL');
    expect(ALLOWED_MODES.IMAGE).not.toContain('PROPOSAL');
  });

  it('has an ALLOWED_MODES row for every node type (drift guard)', () => {
    const types: DocumentNode['type'][] = [
      'DOCUMENT',
      'LIST',
      'LIST_ITEM',
      'HEADING',
      'CONTENT',
      'FOOTNOTE',
      'IMAGE',
      'QUESTION',
      'RADIOBUTTON',
      'CHECKBOX',
      'TEXTAREA',
    ];
    for (const t of types) {
      expect(ALLOWED_MODES[t]).toBeDefined();
    }
  });
});

describe('canHaveMode', () => {
  it('allows NONE and REMARK on every node type', () => {
    const types: DocumentNode['type'][] = [
      'DOCUMENT',
      'LIST',
      'LIST_ITEM',
      'HEADING',
      'CONTENT',
      'FOOTNOTE',
      'IMAGE',
    ];
    for (const t of types) {
      expect(canHaveMode(t, 'NONE')).toBe(true);
      expect(canHaveMode(t, 'REMARK')).toBe(true);
    }
  });

  it('allows PROPOSAL only on proposable types', () => {
    expect(canHaveMode('HEADING', 'PROPOSAL')).toBe(true);
    expect(canHaveMode('CONTENT', 'PROPOSAL')).toBe(true);
    expect(canHaveMode('FOOTNOTE', 'PROPOSAL')).toBe(true);
    expect(canHaveMode('DOCUMENT', 'PROPOSAL')).toBe(false);
    expect(canHaveMode('LIST', 'PROPOSAL')).toBe(false);
    expect(canHaveMode('LIST_ITEM', 'PROPOSAL')).toBe(false);
    expect(canHaveMode('IMAGE', 'PROPOSAL')).toBe(false);
  });
});

describe('carryModeOrClamp', () => {
  it('keeps a mode the target type may hold', () => {
    expect(carryModeOrClamp('REMARK', 'HEADING')).toBe('REMARK');
    expect(carryModeOrClamp('PROPOSAL', 'CONTENT')).toBe('PROPOSAL');
    expect(carryModeOrClamp('NONE', 'LIST')).toBe('NONE');
  });

  it('drops PROPOSAL to undefined when moving to a non-proposable type', () => {
    expect(carryModeOrClamp('PROPOSAL', 'IMAGE')).toBeUndefined();
    expect(carryModeOrClamp('PROPOSAL', 'LIST')).toBeUndefined();
  });

  it('leaves an absent mode absent', () => {
    expect(carryModeOrClamp(undefined, 'HEADING')).toBeUndefined();
  });
});

describe('isValidNode — contribution mode rules', () => {
  const contentWith = (mode: unknown) => ({
    id: '1',
    number: null,
    type: 'CONTENT',
    contents: { en: 'x' },
    children: [],
    format: 'TEXT',
    ...(mode === undefined ? {} : { contributionMode: mode }),
  });

  it('accepts a content node with no contributionMode (default)', () => {
    expect(isValidNode(contentWith(undefined))).toBe(true);
  });

  it('accepts NONE / REMARK / PROPOSAL on a content node', () => {
    for (const mode of ['NONE', 'REMARK', 'PROPOSAL'] as ContributionMode[]) {
      expect(isValidNode(contentWith(mode))).toBe(true);
    }
  });

  it('rejects a PROPOSAL mode on an IMAGE (non-proposable) node', () => {
    expect(
      isValidNode({
        id: '1',
        number: null,
        type: 'IMAGE',
        contents: { en: 'i.png' },
        format: 'TEXT',
        contributionMode: 'PROPOSAL',
      })
    ).toBe(false);
  });

  it('rejects an unknown contributionMode value', () => {
    expect(isValidNode(contentWith('WHATEVER'))).toBe(false);
    expect(isValidNode(contentWith('none'))).toBe(false); // lowercase is not the StructEdit form
  });

  it('accepts a contribution mode on the DOCUMENT root', () => {
    expect(
      isValidDocument({ id: '1', type: 'DOCUMENT', children: [], contributionMode: 'REMARK' })
    ).toBe(true);
  });

  it('rejects PROPOSAL on the DOCUMENT root (not proposable)', () => {
    expect(
      isValidDocument({ id: '1', type: 'DOCUMENT', children: [], contributionMode: 'PROPOSAL' })
    ).toBe(false);
  });

  it('accepts a contribution mode on container nodes (list / list_item)', () => {
    expect(
      isValidDocument({
        id: '1',
        type: 'DOCUMENT',
        children: [
          {
            id: '2',
            number: null,
            type: 'LIST',
            contributionMode: 'NONE',
            children: [
              {
                id: '3',
                number: '1.',
                type: 'LIST_ITEM',
                contributionMode: 'REMARK',
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

  it('rejects PROPOSAL on a LIST container', () => {
    expect(
      isValidDocument({
        id: '1',
        type: 'DOCUMENT',
        children: [
          { id: '2', number: null, type: 'LIST', contributionMode: 'PROPOSAL', children: [] },
        ],
      })
    ).toBe(false);
  });
});

describe('DocTreeEnvelope — contribution modes', () => {
  it('accepts an envelope whose document carries valid modes', () => {
    expect(
      isValidDocTreeEnvelope({
        DocTreeVersion: DOC_TREE_VERSION,
        metadata: { title: { de: 'Doc' } },
        document: {
          id: '1',
          type: 'DOCUMENT',
          children: [
            {
              id: '2',
              number: '1',
              type: 'HEADING',
              contents: { en: 'Title' },
              format: 'TEXT',
              contributionMode: 'PROPOSAL',
              children: [],
            },
          ],
        },
      })
    ).toBe(true);
  });

  it('rejects an envelope whose document carries an invalid mode (PROPOSAL on a LIST)', () => {
    expect(
      isValidDocTreeEnvelope({
        DocTreeVersion: DOC_TREE_VERSION,
        metadata: { title: { de: 'Doc' } },
        document: {
          id: '1',
          type: 'DOCUMENT',
          children: [
            { id: '2', number: null, type: 'LIST', contributionMode: 'PROPOSAL', children: [] },
          ],
        },
      })
    ).toBe(false);
  });
});

describe('Questionnaire question nodes', () => {
  const prompt = () => ({
    id: 'qc',
    number: null,
    type: 'CONTENT',
    contents: { en: 'Your question?' },
    format: 'TEXT',
    children: [],
  });
  const radio = (id: string) => ({
    id,
    number: null,
    type: 'RADIOBUTTON',
    contents: { en: 'Option' },
    format: 'TEXT',
  });
  const checkbox = (id: string) => ({
    id,
    number: null,
    type: 'CHECKBOX',
    contents: { en: 'Option' },
    format: 'TEXT',
  });
  const textarea = (id: string) => ({ id, number: null, type: 'TEXTAREA' });
  const question = (children: unknown[]) => ({ id: 'q', number: null, type: 'QUESTION', children });

  it('accepts a valid single-choice question', () => {
    expect(isValidNode(question([prompt(), radio('o1'), radio('o2')]))).toBe(true);
  });

  it('accepts a valid multiple-choice question', () => {
    expect(isValidNode(question([prompt(), checkbox('o1'), checkbox('o2')]))).toBe(true);
  });

  it('accepts a valid text question', () => {
    expect(isValidNode(question([prompt(), textarea('t1')]))).toBe(true);
  });

  it('rejects a question carrying contents or format', () => {
    expect(isValidNode({ ...question([prompt(), radio('o1')]), contents: { en: 'x' } })).toBe(
      false
    );
    expect(isValidNode({ ...question([prompt(), radio('o1')]), format: 'TEXT' })).toBe(false);
  });

  it('rejects a question mixing radiobutton and checkbox options', () => {
    expect(isValidNode(question([prompt(), radio('o1'), checkbox('o2')]))).toBe(false);
  });

  it('rejects a question with both options and a textarea', () => {
    expect(isValidNode(question([prompt(), radio('o1'), textarea('t1')]))).toBe(false);
  });

  it('rejects a question without exactly one CONTENT prompt', () => {
    expect(isValidNode(question([radio('o1'), radio('o2')]))).toBe(false); // zero prompts
    expect(isValidNode(question([prompt(), { ...prompt(), id: 'qc2' }, radio('o1')]))).toBe(false); // two
  });

  it('rejects a question with no answer section (prompt only)', () => {
    expect(isValidNode(question([prompt()]))).toBe(false);
  });

  it('rejects an option node with children', () => {
    expect(isValidNode(question([prompt(), { ...radio('o1'), children: [] }]))).toBe(false);
  });

  it('rejects a textarea carrying contents / format / children', () => {
    expect(isValidNode(question([prompt(), { ...textarea('t1'), contents: { en: 'x' } }]))).toBe(
      false
    );
    expect(isValidNode(question([prompt(), { ...textarea('t1'), format: 'TEXT' }]))).toBe(false);
    expect(isValidNode(question([prompt(), { ...textarea('t1'), children: [] }]))).toBe(false);
  });

  it('rejects an option with a disallowed format', () => {
    expect(isValidNode(question([prompt(), { ...radio('o1'), format: 'MARKDOWN' }]))).toBe(false);
  });

  it('accepts a question under a HEADING but rejects one under a LIST', () => {
    const heading = (child: unknown) => ({
      id: 'h',
      number: '1',
      type: 'HEADING',
      contents: { en: 'H' },
      format: 'TEXT',
      children: [child],
    });
    expect(isValidNode(heading(question([prompt(), radio('o1')])))).toBe(true);
    const list = {
      id: 'l',
      number: null,
      type: 'LIST',
      children: [question([prompt(), radio('o1')])],
    };
    expect(isValidNode(list)).toBe(false);
  });

  it('exposes the allowed parents/children via canBeChildOf', () => {
    for (const p of ['DOCUMENT', 'HEADING', 'LIST_ITEM'] as const) {
      expect(canBeChildOf('QUESTION', p)).toBe(true);
    }
    expect(canBeChildOf('QUESTION', 'LIST')).toBe(false);
    expect(canBeChildOf('QUESTION', 'CONTENT')).toBe(false);
    for (const c of ['CONTENT', 'RADIOBUTTON', 'CHECKBOX', 'TEXTAREA'] as const) {
      expect(canBeChildOf(c, 'QUESTION')).toBe(true);
    }
    expect(canBeChildOf('HEADING', 'QUESTION')).toBe(false);
  });

  it('exposes option formats and question contribution modes', () => {
    expect(canHaveFormat('RADIOBUTTON', 'MARKDOWN_MINIMAL')).toBe(true);
    expect(canHaveFormat('RADIOBUTTON', 'MARKDOWN')).toBe(false);
    expect(canHaveMode('QUESTION', 'REMARK')).toBe(true);
    expect(canHaveMode('QUESTION', 'PROPOSAL')).toBe(false);
    expect(canHaveMode('RADIOBUTTON', 'REMARK')).toBe(false);
    expect(canHaveMode('RADIOBUTTON', 'NONE')).toBe(true);
  });

  it('accepts an envelope whose document contains a question', () => {
    expect(
      isValidDocTreeEnvelope({
        DocTreeVersion: DOC_TREE_VERSION,
        metadata: { title: { de: 'Doc' } },
        document: { id: 'root', type: 'DOCUMENT', children: [question([prompt(), radio('o1')])] },
      })
    ).toBe(true);
  });
});

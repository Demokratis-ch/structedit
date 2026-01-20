import { describe, it, expect } from 'vitest';
import { isValidNode, isValidDocument, exampleDocument, canBeChildOf } from './document';

describe('Document validation', () => {
  it('validates the example document', () => {
    expect(isValidDocument(exampleDocument)).toBe(true);
  });

  it('validates individual nodes', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'content',
      contents: { en: 'Hello' }
    })).toBe(true);
  });

  it('rejects nodes with invalid type', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'invalid',
      contents: {}
    })).toBe(false);
  });

  it('rejects nodes with duplicate ids', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        { id: '2', number: null, type: 'content', contents: { en: 'A' } },
        { id: '2', number: null, type: 'content', contents: { en: 'B' } }
      ]
    })).toBe(false);
  });

  it('rejects list_item outside of list', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        {
          id: '2',
          number: null,
          type: 'list_item',
          children: [
            { id: '3', number: null, type: 'content', contents: { en: 'Item' } }
          ]
        }
      ]
    })).toBe(false);
  });

  it('accepts list_item inside list', () => {
    expect(isValidDocument({
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
                { id: '4', number: null, type: 'content', contents: { en: 'Item' } }
              ]
            }
          ]
        }
      ]
    })).toBe(true);
  });

  it('rejects list_item with contents property (old leaf structure)', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        {
          id: '2',
          number: null,
          type: 'list',
          children: [
            { id: '3', number: '1.', type: 'list_item', contents: { en: 'Item' } }
          ]
        }
      ]
    })).toBe(false);
  });

  it('rejects container nodes with contents', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'document',
      children: [],
      contents: { en: 'Should not have this' }
    })).toBe(false);
  });

  it('rejects leaf nodes with children', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'content',
      contents: { en: 'Text' },
      children: []
    })).toBe(false);
  });

  it('rejects invalid language keys in contents', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'content',
      contents: { xyz: 'Invalid language' }
    })).toBe(false);
  });

  it('accepts footnote as a leaf node with contents', () => {
    expect(isValidNode({
      id: '1',
      number: 'i.',
      type: 'footnote',
      contents: { en: 'This is a footnote.' }
    })).toBe(true);
  });

  it('rejects footnote with children (old container structure)', () => {
    expect(isValidNode({
      id: '1',
      number: 'i.',
      type: 'footnote',
      children: [
        { id: '2', number: null, type: 'content', contents: { en: 'Text' } }
      ]
    })).toBe(false);
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
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        {
          id: '2',
          number: null,
          type: 'list',
          children: [
            { id: '3', number: null, type: 'content', contents: { en: 'Invalid!' } }
          ]
        }
      ]
    })).toBe(false);
  });

  it('rejects heading directly inside list', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        {
          id: '2',
          number: null,
          type: 'list',
          children: [
            { id: '3', number: '1', type: 'heading', contents: { en: 'Invalid!' }, children: [] }
          ]
        }
      ]
    })).toBe(false);
  });

  it('rejects nested list directly inside list (must be inside list_item)', () => {
    expect(isValidDocument({
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
                    { id: '5', number: null, type: 'content', contents: { en: 'Item' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })).toBe(false);
  });

  it('rejects footnote directly inside list', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        {
          id: '2',
          number: null,
          type: 'list',
          children: [
            { id: '3', number: 'i.', type: 'footnote', contents: { en: 'Invalid' } }
          ]
        }
      ]
    })).toBe(false);
  });

  it('rejects image directly inside list', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        {
          id: '2',
          number: null,
          type: 'list',
          children: [
            { id: '3', number: null, type: 'image', contents: { en: 'image.png' } }
          ]
        }
      ]
    })).toBe(false);
  });

  it('accepts nested list inside list_item', () => {
    expect(isValidDocument({
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
                { id: '4', number: null, type: 'content', contents: { en: 'Item' } },
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
                        { id: '7', number: null, type: 'content', contents: { en: 'Nested' } }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })).toBe(true);
  });

  it('accepts footnote inside heading', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        {
          id: '2',
          number: '1',
          type: 'heading',
          contents: { en: 'Title' },
          children: [
            { id: '3', number: 'i.', type: 'footnote', contents: { en: 'Note' } }
          ]
        }
      ]
    })).toBe(true);
  });

  it('accepts image inside list_item', () => {
    expect(isValidDocument({
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
                { id: '4', number: null, type: 'image', contents: { en: 'image.png' } }
              ]
            }
          ]
        }
      ]
    })).toBe(true);
  });
});

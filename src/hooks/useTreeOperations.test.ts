import { describe, test, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTreeOperations } from './useTreeOperations';
import type { ContainerDocumentNode, HeadingDocumentNode, LeafDocumentNode } from '../types/document';
import type { NodePath } from '../types/editor';
import { getNodeAtPath, buildIndices } from '../utils/tree-utils';

// Helper to create a test document
const createTestDocument = (): ContainerDocumentNode => ({
  id: 'root',
  number: null,
  type: 'document',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'heading',
      contents: { de: 'First Heading' },
      children: [
        {
          id: 'p1',
          number: null,
          type: 'content',
          contents: { de: 'First paragraph' },
        },
        {
          id: 'h2',
          number: '1.1',
          type: 'heading',
          contents: { de: 'Nested Heading' },
          children: [
            {
              id: 'p2',
              number: null,
              type: 'content',
              contents: { de: 'Nested paragraph' },
            },
          ],
        },
      ],
    },
    {
      id: 'h1b',
      number: '2',
      type: 'heading',
      contents: { de: 'Second Heading' },
      children: [],
    },
  ],
});

const createDocumentWithList = (): ContainerDocumentNode => ({
  id: 'root',
  number: null,
  type: 'document',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'heading',
      contents: { de: 'Title' },
      children: [
        {
          id: 'list1',
          number: null,
          type: 'list',
          children: [
            {
              id: 'li1',
              number: '1.',
              type: 'list_item',
              contents: { de: 'First item' },
            },
            {
              id: 'li2',
              number: '2.',
              type: 'list_item',
              contents: { de: 'Second item' },
            },
            {
              id: 'li3',
              number: '3.',
              type: 'list_item',
              contents: { de: 'Third item' },
            },
          ],
        },
      ],
    },
  ],
});

describe('useTreeOperations', () => {
  let mockCommit: MockedFunction<(doc: ContainerDocumentNode, saveHistory?: boolean) => void>;
  let document: ContainerDocumentNode;
  let indices: { nodeIndex: Map<string, NodePath>; parentIndex: Map<string, string> };

  beforeEach(() => {
    mockCommit = vi.fn();
    document = createTestDocument();
    indices = buildIndices(document);
  });

  const renderTreeOperations = (doc: ContainerDocumentNode = document) => {
    const idx = buildIndices(doc);
    return renderHook(() => useTreeOperations({
      document: doc,
      commit: mockCommit,
      nodeIndex: idx.nodeIndex,
      parentIndex: idx.parentIndex,
      language: 'de',
    }));
  };

  describe('addNodeAfter', () => {
    test('inserts sibling after specified node', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeAfter('p1');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      // New node should be inserted after p1 (index 1)
      expect(h1.children.length).toBe(3);
      expect(h1.children[0].id).toBe('p1');
      expect(h1.children[2].id).toBe('h2');
      // New node is in the middle
      const newNode = h1.children[1] as LeafDocumentNode;
      expect(newNode.type).toBe('content');
      expect(newNode.contents.de).toBe('');
    });

    test('creates content node by default', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeAfter('p1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const newNode = h1.children[1] as LeafDocumentNode;
      expect(newNode.type).toBe('content');
    });

    test('creates list_item when parent is list', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.addNodeAfter('li1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ContainerDocumentNode;

      expect(list.children.length).toBe(4);
      const newItem = list.children[1] as LeafDocumentNode;
      expect(newItem.type).toBe('list_item');
    });
  });

  describe('removeNode', () => {
    test('removes leaf node', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.removeNode('p1');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('h2');
    });

    test('removes node with all descendants', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.removeNode('h2'); // Has p2 as child
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('p1');
      // p2 should be gone with h2
      expect(getNodeAtPath(newDoc, [0, 1])).toBeNull();
    });
  });

  describe('updateNodeContents', () => {
    test('updates content for current language', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.updateNodeContents('p1', 'Updated content');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const p1 = getNodeAtPath(newDoc, [0, 0]) as LeafDocumentNode;
      expect(p1.contents.de).toBe('Updated content');
    });

    test('preserves other languages', () => {
      // Create a document with multi-language content
      const multiLangDoc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            contents: { de: 'German', en: 'English' },
          },
        ],
      };

      const { result } = renderTreeOperations(multiLangDoc);

      act(() => {
        result.current.updateNodeContents('p1', 'Neuer Text');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const p1 = newDoc.children[0] as LeafDocumentNode;
      expect(p1.contents.de).toBe('Neuer Text');
      expect(p1.contents.en).toBe('English'); // Preserved
    });
  });

  describe('indentNode (Tab)', () => {
    test('moves content under previous sibling heading', () => {
      // Create doc with h1, then content at same level
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'h1',
            number: null,
            type: 'heading',
            contents: { de: 'Heading' },
            children: [],
          },
          {
            id: 'p1',
            number: null,
            type: 'content',
            contents: { de: 'Paragraph' },
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNode('p1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      // p1 should now be a child of h1
      expect(newDoc.children.length).toBe(1);
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('p1');
    });

    test('does nothing when no previous heading sibling', () => {
      // p1 is first child of h1, no previous heading sibling
      const { result } = renderTreeOperations();

      act(() => {
        result.current.indentNode('p1');
      });

      // Should not call commit if no-op
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('moves heading under previous sibling heading', () => {
      // Create two sibling headings at root level
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'h1',
            number: null,
            type: 'heading',
            contents: { de: 'First' },
            children: [],
          },
          {
            id: 'h2',
            number: null,
            type: 'heading',
            contents: { de: 'Second' },
            children: [],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNode('h2');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      expect(newDoc.children.length).toBe(1);
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('h2');
    });

    test.skip('moves list_item into nested list under previous item', () => {
      // Skipped: list_item nesting requires design decision about list_item structure
      // The current DocumentNode type has list_item as LeafDocumentNode (no children)
      // Supporting nested lists would require making list_item a hybrid type
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.indentNode('li2');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ContainerDocumentNode;

      expect(list.children.length).toBe(2);
      expect(list.children[0].id).toBe('li1');
      expect(list.children[1].id).toBe('li3');
    });
  });

  describe('outdentNode (Shift-Tab)', () => {
    test('moves content to be sibling of parent heading', () => {
      const { result } = renderTreeOperations();

      // p1 is child of h1, outdent should move it to root level after h1
      act(() => {
        result.current.outdentNode('p1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      // Should have 3 children now: h1, p1, h1b
      expect(newDoc.children.length).toBe(3);
      expect(newDoc.children[0].id).toBe('h1');
      expect(newDoc.children[1].id).toBe('p1');
      expect(newDoc.children[2].id).toBe('h1b');

      // h1 should only have h2 as child now
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('h2');
    });

    test('does nothing when at document level', () => {
      const { result } = renderTreeOperations();

      // h1 is already at document level
      act(() => {
        result.current.outdentNode('h1');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('moves heading to be sibling of parent heading', () => {
      const { result } = renderTreeOperations();

      // h2 is child of h1, outdent should move it to root level after h1
      act(() => {
        result.current.outdentNode('h2');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      // Should have 3 children: h1, h2, h1b
      expect(newDoc.children.length).toBe(3);
      expect(newDoc.children[0].id).toBe('h1');
      expect(newDoc.children[1].id).toBe('h2');
      expect(newDoc.children[2].id).toBe('h1b');
    });

    test('moves list_item out of nested list', () => {
      // Create a nested list scenario
      const nestedListDoc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'list',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'list_item',
                contents: { de: 'First' },
              },
              {
                id: 'nested-list',
                number: null,
                type: 'list',
                children: [
                  {
                    id: 'li2',
                    number: 'a.',
                    type: 'list_item',
                    contents: { de: 'Nested item' },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(nestedListDoc);

      act(() => {
        result.current.outdentNode('li2');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const list1 = newDoc.children[0] as ContainerDocumentNode;

      // li2 should now be in list1, after the nested-list
      expect(list1.children.some(c => c.id === 'li2')).toBe(true);
    });
  });

  describe('changeNodeType', () => {
    describe('content -> heading', () => {
      test('converts content to heading with empty children', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Some text' },
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'heading');
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as HeadingDocumentNode;

        expect(converted.type).toBe('heading');
        expect(converted.children).toEqual([]);
        expect(converted.contents.de).toBe('Some text');
      });

      test('preserves id, number, and contents', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: 'Art. 1',
              type: 'content',
              contents: { de: 'German text', en: 'English text' },
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'heading');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as HeadingDocumentNode;

        expect(converted.id).toBe('p1');
        expect(converted.number).toBe('Art. 1');
        expect(converted.contents.de).toBe('German text');
        expect(converted.contents.en).toBe('English text');
      });

      test('does nothing when already a heading', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'h1',
              number: null,
              type: 'heading',
              contents: { de: 'Already heading' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('h1', 'heading');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('heading -> content', () => {
      test('converts heading without children to content', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'heading',
              contents: { de: 'Heading text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('h1', 'content');
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as LeafDocumentNode;

        expect(converted.type).toBe('content');
        expect(converted.id).toBe('h1');
        expect(converted.number).toBe('1');
        expect(converted.contents.de).toBe('Heading text');
        expect('children' in converted).toBe(false);
      });

      test('lifts children as siblings after converted node', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'heading',
              contents: { de: 'Heading' },
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'content',
                  contents: { de: 'Child 1' },
                },
                {
                  id: 'p2',
                  number: null,
                  type: 'content',
                  contents: { de: 'Child 2' },
                },
              ],
            },
            {
              id: 'h2',
              number: '2',
              type: 'heading',
              contents: { de: 'Second heading' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('h1', 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have 4 children: converted h1, p1, p2, h2
        expect(newDoc.children.length).toBe(4);
        expect(newDoc.children[0].id).toBe('h1');
        expect(newDoc.children[0].type).toBe('content');
        expect(newDoc.children[1].id).toBe('p1');
        expect(newDoc.children[2].id).toBe('p2');
        expect(newDoc.children[3].id).toBe('h2');
      });

      test('does nothing when already content', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Already content' },
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'content');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('content -> list', () => {
      test('wraps content in list with single list_item', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Item text' },
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have a list at root level
        expect(newDoc.children.length).toBe(1);
        const list = newDoc.children[0] as ContainerDocumentNode;
        expect(list.type).toBe('list');

        // List should contain one list_item with same content
        expect(list.children.length).toBe(1);
        const item = list.children[0] as LeafDocumentNode;
        expect(item.type).toBe('list_item');
        expect(item.id).toBe('p1');
        expect(item.contents.de).toBe('Item text');
      });

      test('sets correct number for numbered list', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Item' },
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as LeafDocumentNode;
        expect(item.number).toBe('1.');
      });

      test('sets correct number for lettered list', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Item' },
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as LeafDocumentNode;
        expect(item.number).toBe('a.');
      });

      test('sets null number for unordered list', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Item' },
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as LeafDocumentNode;
        expect(item.number).toBeNull();
      });
    });

    describe('heading -> list', () => {
      test('wraps heading in list, lifts children after list', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'heading',
              contents: { de: 'Heading' },
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'content',
                  contents: { de: 'Child content' },
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('h1', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have 2 children: the new list and the lifted p1
        expect(newDoc.children.length).toBe(2);

        const list = newDoc.children[0] as ContainerDocumentNode;
        expect(list.type).toBe('list');
        expect(list.children.length).toBe(1);

        const item = list.children[0] as LeafDocumentNode;
        expect(item.id).toBe('h1');
        expect(item.type).toBe('list_item');

        // Lifted child
        expect(newDoc.children[1].id).toBe('p1');
      });
    });

    describe('list_item -> content', () => {
      test('replaces entire list when only item', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'list_item',
                  contents: { de: 'Only item' },
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li1', 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // List should be replaced with content node
        expect(newDoc.children.length).toBe(1);
        const converted = newDoc.children[0] as LeafDocumentNode;
        expect(converted.type).toBe('content');
        expect(converted.id).toBe('li1');
        expect(converted.contents.de).toBe('Only item');
      });

      test('extracts item and inserts after list when multiple items', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'list_item',
                  contents: { de: 'First' },
                },
                {
                  id: 'li2',
                  number: '2.',
                  type: 'list_item',
                  contents: { de: 'Second' },
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li2', 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have list and extracted content
        expect(newDoc.children.length).toBe(2);

        // List should still exist with one item
        const list = newDoc.children[0] as ContainerDocumentNode;
        expect(list.type).toBe('list');
        expect(list.children.length).toBe(1);
        expect(list.children[0].id).toBe('li1');

        // Converted item should be after the list
        const converted = newDoc.children[1] as LeafDocumentNode;
        expect(converted.type).toBe('content');
        expect(converted.id).toBe('li2');
      });
    });

    describe('list_item -> heading', () => {
      test('replaces entire list when only item', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'list_item',
                  contents: { de: 'Only item' },
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li1', 'heading');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        expect(newDoc.children.length).toBe(1);
        const converted = newDoc.children[0] as HeadingDocumentNode;
        expect(converted.type).toBe('heading');
        expect(converted.id).toBe('li1');
        expect(converted.children).toEqual([]);
      });

      test('extracts item and inserts after list when multiple items', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'list_item',
                  contents: { de: 'First' },
                },
                {
                  id: 'li2',
                  number: '2.',
                  type: 'list_item',
                  contents: { de: 'Second' },
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li1', 'heading');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        expect(newDoc.children.length).toBe(2);

        // Converted heading should be first (since li1 was first item)
        const converted = newDoc.children[0] as HeadingDocumentNode;
        expect(converted.type).toBe('heading');
        expect(converted.id).toBe('li1');

        // List with remaining item should follow
        const list = newDoc.children[1] as ContainerDocumentNode;
        expect(list.type).toBe('list');
        expect(list.children.length).toBe(1);
        expect(list.children[0].id).toBe('li2');
      });
    });

    describe('list style change', () => {
      test('ul -> ol updates all item numbers to 1., 2., 3.', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [
                { id: 'li1', number: null, type: 'list_item', contents: { de: 'A' } },
                { id: 'li2', number: null, type: 'list_item', contents: { de: 'B' } },
                { id: 'li3', number: null, type: 'list_item', contents: { de: 'C' } },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li2', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        expect((list.children[0] as LeafDocumentNode).number).toBe('1.');
        expect((list.children[1] as LeafDocumentNode).number).toBe('2.');
        expect((list.children[2] as LeafDocumentNode).number).toBe('3.');
      });

      test('ol -> abc updates all item numbers to a., b., c.', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [
                { id: 'li1', number: '1.', type: 'list_item', contents: { de: 'A' } },
                { id: 'li2', number: '2.', type: 'list_item', contents: { de: 'B' } },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li1', 'list', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        expect((list.children[0] as LeafDocumentNode).number).toBe('a.');
        expect((list.children[1] as LeafDocumentNode).number).toBe('b.');
      });

      test('ol -> ul sets all item numbers to null', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [
                { id: 'li1', number: '1.', type: 'list_item', contents: { de: 'A' } },
                { id: 'li2', number: '2.', type: 'list_item', contents: { de: 'B' } },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li1', 'list', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        expect((list.children[0] as LeafDocumentNode).number).toBeNull();
        expect((list.children[1] as LeafDocumentNode).number).toBeNull();
      });
    });

    describe('edge cases', () => {
      test('cannot convert document root', () => {
        const { result } = renderTreeOperations();

        act(() => {
          result.current.changeNodeType('root', 'content');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('cannot convert container nodes (list)', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [
                { id: 'li1', number: '1.', type: 'list_item', contents: { de: 'Item' } },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('list1', 'content');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });
  });
});

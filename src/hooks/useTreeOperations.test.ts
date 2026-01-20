import { describe, test, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTreeOperations } from './useTreeOperations';
import type {
  ContainerDocumentNode,
  HeadingDocumentNode,
  LeafDocumentNode,
  ContentDocumentNode,
} from '../types/document';
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
          children: [],
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
              children: [],
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

// Helper to create a list_item with child content node
const createListItem = (
  id: string,
  number: string | null,
  content: string
): ContainerDocumentNode => ({
  id,
  number,
  type: 'list_item',
  children: [
    {
      id: `${id}-content`,
      number: null,
      type: 'content',
      contents: { de: content },
      children: [],
    } as ContentDocumentNode,
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
            createListItem('li1', '1.', 'First item'),
            createListItem('li2', '2.', 'Second item'),
            createListItem('li3', '3.', 'Third item'),
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
    return renderHook(() =>
      useTreeOperations({
        document: doc,
        commit: mockCommit,
        nodeIndex: idx.nodeIndex,
        parentIndex: idx.parentIndex,
        language: 'de',
      })
    );
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
            children: [],
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
            children: [],
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
              createListItem('li1', '1.', 'First'),
              {
                id: 'nested-list',
                number: null,
                type: 'list',
                children: [createListItem('li2', 'a.', 'Nested item')],
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
      expect(list1.children.some((c) => c.id === 'li2')).toBe(true);
    });

    test('does nothing when outdenting list_item would place it outside any list', () => {
      // document -> list -> list_item
      // Outdenting list_item would make it a child of document, which is invalid
      const docWithTopLevelList: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'list',
            children: [
              createListItem('li1', '1.', 'Item 1'),
              createListItem('li2', '2.', 'Item 2'),
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(docWithTopLevelList);

      act(() => {
        result.current.outdentNode('li1');
      });

      // Should NOT have called commit because the operation is invalid
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing when outdenting list_item in list under heading would violate rules', () => {
      // document -> heading -> list -> list_item
      // Outdenting list_item would make it a child of heading, which is invalid
      const docWithListUnderHeading: ContainerDocumentNode = {
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
                children: [createListItem('li1', '1.', 'Item 1')],
              },
            ],
          } as HeadingDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(docWithListUnderHeading);

      act(() => {
        result.current.outdentNode('li1');
      });

      // Should NOT have called commit because list_item cannot be child of heading
      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('indentNode footnote into content', () => {
    test('moves footnote under previous sibling content', () => {
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            contents: { de: 'Paragraph' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'fn1',
            number: 'i.',
            type: 'footnote',
            contents: { de: 'Footnote text' },
          } as LeafDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNode('fn1');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      // Footnote should now be child of content
      expect(newDoc.children.length).toBe(1);
      const p1 = newDoc.children[0] as ContentDocumentNode;
      expect(p1.children.length).toBe(1);
      expect(p1.children[0].id).toBe('fn1');
    });

    test('does nothing when previous sibling is not content or heading', () => {
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'fn1',
            number: 'i.',
            type: 'footnote',
            contents: { de: 'First footnote' },
          } as LeafDocumentNode,
          {
            id: 'fn2',
            number: 'ii.',
            type: 'footnote',
            contents: { de: 'Second footnote' },
          } as LeafDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNode('fn2');
      });

      // Should not indent footnote into another footnote
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('moves footnote under previous sibling heading', () => {
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
            children: [],
          } as HeadingDocumentNode,
          {
            id: 'fn1',
            number: 'i.',
            type: 'footnote',
            contents: { de: 'Footnote text' },
          } as LeafDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNode('fn1');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      // Footnote should now be child of heading
      expect(newDoc.children.length).toBe(1);
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('fn1');
    });
  });

  describe('outdentNode footnote from content', () => {
    test('moves footnote to be sibling of parent content', () => {
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            contents: { de: 'Paragraph' },
            children: [
              {
                id: 'fn1',
                number: 'i.',
                type: 'footnote',
                contents: { de: 'Footnote text' },
              } as LeafDocumentNode,
            ],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNode('fn1');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      // Should have 2 children: p1, fn1
      expect(newDoc.children.length).toBe(2);
      expect(newDoc.children[0].id).toBe('p1');
      expect(newDoc.children[1].id).toBe('fn1');

      // p1 should now have empty children
      const p1 = newDoc.children[0] as ContentDocumentNode;
      expect(p1.children.length).toBe(0);
    });

    test('preserves other footnote siblings when outdenting', () => {
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            contents: { de: 'Paragraph' },
            children: [
              {
                id: 'fn1',
                number: 'i.',
                type: 'footnote',
                contents: { de: 'First footnote' },
              } as LeafDocumentNode,
              {
                id: 'fn2',
                number: 'ii.',
                type: 'footnote',
                contents: { de: 'Second footnote' },
              } as LeafDocumentNode,
            ],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNode('fn1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      // Should have 2 children: p1, fn1
      expect(newDoc.children.length).toBe(2);
      expect(newDoc.children[0].id).toBe('p1');
      expect(newDoc.children[1].id).toBe('fn1');

      // p1 should still have fn2
      const p1 = newDoc.children[0] as ContentDocumentNode;
      expect(p1.children.length).toBe(1);
      expect(p1.children[0].id).toBe('fn2');
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
              children: [],
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
              children: [],
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
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.type).toBe('content');
        expect(converted.id).toBe('h1');
        expect(converted.number).toBe('1');
        expect(converted.contents.de).toBe('Heading text');
        expect(converted.children).toEqual([]);
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
                  children: [],
                },
                {
                  id: 'p2',
                  number: null,
                  type: 'content',
                  contents: { de: 'Child 2' },
                  children: [],
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
              children: [],
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
              children: [],
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

        // List should contain one list_item with child content node
        expect(list.children.length).toBe(1);
        const item = list.children[0] as ContainerDocumentNode;
        expect(item.type).toBe('list_item');
        // The original content node becomes a child with its id preserved
        const itemContent = item.children[0] as LeafDocumentNode;
        expect(itemContent.type).toBe('content');
        expect(itemContent.id).toBe('p1');
        expect(itemContent.contents.de).toBe('Item text');
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
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as ContainerDocumentNode;
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
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as ContainerDocumentNode;
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
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as ContainerDocumentNode;
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
                  children: [],
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

        const item = list.children[0] as ContainerDocumentNode;
        expect(item.type).toBe('list_item');
        // The original heading content is now in the child content node
        const itemContent = item.children[0] as LeafDocumentNode;
        expect(itemContent.id).toBe('h1');

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
              children: [createListItem('li1', '1.', 'Only item')],
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
                createListItem('li1', '1.', 'First'),
                createListItem('li2', '2.', 'Second'),
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
              children: [createListItem('li1', '1.', 'Only item')],
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
                createListItem('li1', '1.', 'First'),
                createListItem('li2', '2.', 'Second'),
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
                createListItem('li1', null, 'A'),
                createListItem('li2', null, 'B'),
                createListItem('li3', null, 'C'),
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

        expect((list.children[0] as ContainerDocumentNode).number).toBe('1.');
        expect((list.children[1] as ContainerDocumentNode).number).toBe('2.');
        expect((list.children[2] as ContainerDocumentNode).number).toBe('3.');
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
              children: [createListItem('li1', '1.', 'A'), createListItem('li2', '2.', 'B')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li1', 'list', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        expect((list.children[0] as ContainerDocumentNode).number).toBe('a.');
        expect((list.children[1] as ContainerDocumentNode).number).toBe('b.');
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
              children: [createListItem('li1', '1.', 'A'), createListItem('li2', '2.', 'B')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li1', 'list', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        expect((list.children[0] as ContainerDocumentNode).number).toBeNull();
        expect((list.children[1] as ContainerDocumentNode).number).toBeNull();
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
              children: [createListItem('li1', '1.', 'Item')],
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

    describe('adjacent list merging', () => {
      test('merges with preceding list when converting to list', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Convert me' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have merged into one list
        expect(newDoc.children.length).toBe(1);
        expect(newDoc.children[0].type).toBe('list');
        const mergedList = newDoc.children[0] as ContainerDocumentNode;
        expect(mergedList.children.length).toBe(2);
        expect(mergedList.children[0].id).toBe('li1');
        // The converted content's id is now in the child content node
        const newItem = mergedList.children[1] as ContainerDocumentNode;
        expect((newItem.children[0] as LeafDocumentNode).id).toBe('p1');
      });

      test('merges with following list when converting to list', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Convert me' },
              children: [],
            },
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have merged into one list
        expect(newDoc.children.length).toBe(1);
        expect(newDoc.children[0].type).toBe('list');
        const mergedList = newDoc.children[0] as ContainerDocumentNode;
        expect(mergedList.children.length).toBe(2);
        // The converted content's id is now in the child content node
        const newItem = mergedList.children[0] as ContainerDocumentNode;
        expect((newItem.children[0] as LeafDocumentNode).id).toBe('p1');
        expect(mergedList.children[1].id).toBe('li1');
      });

      test('merges with both surrounding lists when converting to list', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Convert me' },
              children: [],
            },
            {
              id: 'list2',
              number: null,
              type: 'list',
              children: [createListItem('li2', '1.', 'Item 2')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have merged all three into one list
        expect(newDoc.children.length).toBe(1);
        expect(newDoc.children[0].type).toBe('list');
        const mergedList = newDoc.children[0] as ContainerDocumentNode;
        expect(mergedList.children.length).toBe(3);
        expect(mergedList.children[0].id).toBe('li1');
        // The converted content's id is now in the child content node
        const newItem = mergedList.children[1] as ContainerDocumentNode;
        expect((newItem.children[0] as LeafDocumentNode).id).toBe('p1');
        expect(mergedList.children[2].id).toBe('li2');
      });

      test('does not merge lists separated by other nodes', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'h1',
              number: '1',
              type: 'heading',
              contents: { de: 'Separator' },
              children: [],
            },
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Convert me' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have 3 children: list1, heading, and new list
        expect(newDoc.children.length).toBe(3);
        expect(newDoc.children[0].type).toBe('list');
        expect(newDoc.children[1].type).toBe('heading');
        expect(newDoc.children[2].type).toBe('list');
      });
    });

    describe('content -> footnote', () => {
      test('converts content to footnote (leaf node without children)', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Note text' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'footnote');
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as LeafDocumentNode;

        expect(converted.type).toBe('footnote');
        expect(converted.id).toBe('p1');
        expect(converted.contents.de).toBe('Note text');
        // Footnote is a leaf node - should not have children property
        expect('children' in converted).toBe(false);
      });

      test('preserves id, number, and contents', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: 'i.',
              type: 'content',
              contents: { de: 'German', en: 'English' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'footnote');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as LeafDocumentNode;

        expect(converted.id).toBe('p1');
        expect(converted.number).toBe('i.');
        expect(converted.contents.de).toBe('German');
        expect(converted.contents.en).toBe('English');
      });

      test('lifts footnote children when converting content with footnotes', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Main text' },
              children: [
                {
                  id: 'fn1',
                  number: 'i.',
                  type: 'footnote',
                  contents: { de: 'First footnote' },
                } as LeafDocumentNode,
                {
                  id: 'fn2',
                  number: 'ii.',
                  type: 'footnote',
                  contents: { de: 'Second footnote' },
                } as LeafDocumentNode,
              ],
            } as ContentDocumentNode,
            {
              id: 'p2',
              number: null,
              type: 'content',
              contents: { de: 'Next paragraph' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('p1', 'footnote');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have 4 children: converted p1, fn1, fn2, p2
        expect(newDoc.children.length).toBe(4);
        expect(newDoc.children[0].id).toBe('p1');
        expect(newDoc.children[0].type).toBe('footnote');
        expect(newDoc.children[1].id).toBe('fn1');
        expect(newDoc.children[2].id).toBe('fn2');
        expect(newDoc.children[3].id).toBe('p2');
      });

      test('does nothing when already footnote', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'fn1',
              number: 'i.',
              type: 'footnote',
              contents: { de: 'Already a footnote' },
            } as LeafDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('fn1', 'footnote');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('heading -> footnote', () => {
      test('converts heading to footnote and lifts children', () => {
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
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'content',
                  contents: { de: 'Child content' },
                  children: [],
                } as ContentDocumentNode,
                {
                  id: 'p2',
                  number: null,
                  type: 'content',
                  contents: { de: 'Another child' },
                  children: [],
                } as ContentDocumentNode,
              ],
            } as HeadingDocumentNode,
            {
              id: 'h2',
              number: '2',
              type: 'heading',
              contents: { de: 'Next heading' },
              children: [],
            } as HeadingDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('h1', 'footnote');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Should have 4 children: converted h1, p1, p2, h2
        expect(newDoc.children.length).toBe(4);
        expect(newDoc.children[0].id).toBe('h1');
        expect(newDoc.children[0].type).toBe('footnote');
        expect('children' in newDoc.children[0]).toBe(false);
        expect(newDoc.children[1].id).toBe('p1');
        expect(newDoc.children[2].id).toBe('p2');
        expect(newDoc.children[3].id).toBe('h2');
      });

      test('converts heading without children to footnote', () => {
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
            } as HeadingDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('h1', 'footnote');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as LeafDocumentNode;

        expect(converted.type).toBe('footnote');
        expect(converted.id).toBe('h1');
        expect(converted.number).toBe('1');
        expect(converted.contents.de).toBe('Heading text');
        expect('children' in converted).toBe(false);
      });
    });

    describe('footnote -> content', () => {
      test('converts footnote to content (adds empty children array)', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'fn1',
              number: 'i.',
              type: 'footnote',
              contents: { de: 'Footnote text' },
            } as LeafDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('fn1', 'content');
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.type).toBe('content');
        expect(converted.id).toBe('fn1');
        expect(converted.number).toBe('i.');
        expect(converted.contents.de).toBe('Footnote text');
        expect(converted.children).toEqual([]);
      });

      test('preserves multi-language contents', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'fn1',
              number: null,
              type: 'footnote',
              contents: { de: 'German', en: 'English', fr: 'French' },
            } as LeafDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('fn1', 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.contents.de).toBe('German');
        expect(converted.contents.en).toBe('English');
        expect(converted.contents.fr).toBe('French');
      });
    });

    describe('footnote conversion edge cases', () => {
      test('cannot convert list to footnote', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('list1', 'footnote');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('cannot convert list_item to footnote', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeType('li1', 'footnote');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });
  });

  describe('moveNodeById', () => {
    test('moves node to before target (position: top)', () => {
      const { result } = renderTreeOperations();

      // Move h1b to before h1 (drop position: top of h1)
      act(() => {
        result.current.moveNodeById('h1b', 'h1', 'top');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      // h1b should now be first, h1 second
      expect(newDoc.children.length).toBe(2);
      expect(newDoc.children[0].id).toBe('h1b');
      expect(newDoc.children[1].id).toBe('h1');
    });

    test('moves node to after target (position: bottom)', () => {
      const { result } = renderTreeOperations();

      // Move h1b to after p1 (drop position: bottom of p1)
      // p1 is at [0, 0], h1b is at [1]
      act(() => {
        result.current.moveNodeById('h1b', 'p1', 'bottom');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      // h1b should now be inside h1, after p1
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(3); // p1, h1b, h2
      expect(h1.children[0].id).toBe('p1');
      expect(h1.children[1].id).toBe('h1b');
      expect(h1.children[2].id).toBe('h2');
    });

    test('reorders within same parent', () => {
      const { result } = renderTreeOperations();

      // Move h2 to before p1 (both are children of h1)
      // p1 is at [0, 0], h2 is at [0, 1]
      act(() => {
        result.current.moveNodeById('h2', 'p1', 'top');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(2);
      expect(h1.children[0].id).toBe('h2');
      expect(h1.children[1].id).toBe('p1');
    });

    test('moves node to different parent', () => {
      const { result } = renderTreeOperations();

      // Move p2 (child of h2) to after h1b at root level
      // p2 is at [0, 1, 0], h1b is at [1]
      act(() => {
        result.current.moveNodeById('p2', 'h1b', 'bottom');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      // p2 should now be at root level after h1b
      expect(newDoc.children.length).toBe(3);
      expect(newDoc.children[0].id).toBe('h1');
      expect(newDoc.children[1].id).toBe('h1b');
      expect(newDoc.children[2].id).toBe('p2');

      // h2 should have no children now
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const h2 = h1.children[1] as HeadingDocumentNode;
      expect(h2.children.length).toBe(0);
    });

    test('does nothing when source equals target', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.moveNodeById('h1', 'h1', 'bottom');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing when source not found', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.moveNodeById('nonexistent', 'h1', 'bottom');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing when target not found', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.moveNodeById('h1', 'nonexistent', 'bottom');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    describe('parent-child validation', () => {
      test('rejects moving content directly into list', () => {
        const docWithList: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Para' },
              children: [],
            } as ContentDocumentNode,
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            } as ContainerDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(docWithList);

        act(() => {
          // Try to move p1 to after li1 (which would put it inside list1)
          const moveResult = result.current.moveNodeById('p1', 'li1', 'bottom');
          expect(moveResult.success).toBe(false);
        });

        // Commit should not have been called
        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('rejects moving heading directly into list', () => {
        const docWithList: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'heading',
              contents: { de: 'Title' },
              children: [],
            } as HeadingDocumentNode,
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            } as ContainerDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(docWithList);

        act(() => {
          const moveResult = result.current.moveNodeById('h1', 'li1', 'bottom');
          expect(moveResult.success).toBe(false);
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('rejects moving list_item out of list to document level', () => {
        const docWithList = createDocumentWithList();
        const { result } = renderTreeOperations(docWithList);

        act(() => {
          // Try to move li1 to after h1 (document level - li1 would become child of document)
          const moveResult = result.current.moveNodeById('li1', 'h1', 'bottom');
          expect(moveResult.success).toBe(false);
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('rejects moving list_item to heading children', () => {
        const docWithList = createDocumentWithList();
        const { result } = renderTreeOperations(docWithList);

        act(() => {
          // Try to move li1 to before list1 (which would place it as sibling of list1, i.e., child of h1/heading)
          const moveResult = result.current.moveNodeById('li1', 'list1', 'top');
          expect(moveResult.success).toBe(false);
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('allows moving list_item within same list', () => {
        const docWithList = createDocumentWithList();
        const { result } = renderTreeOperations(docWithList);

        act(() => {
          // Move li3 to before li1
          const moveResult = result.current.moveNodeById('li3', 'li1', 'top');
          expect(moveResult.success).toBe(true);
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const h1 = newDoc.children[0] as HeadingDocumentNode;
        const list = h1.children[0] as ContainerDocumentNode;
        expect(list.children[0].id).toBe('li3');
        expect(list.children[1].id).toBe('li1');
      });

      test('allows moving list_item to different list', () => {
        const docWithTwoLists: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            } as ContainerDocumentNode,
            {
              id: 'list2',
              number: null,
              type: 'list',
              children: [createListItem('li2', '1.', 'Item 2')],
            } as ContainerDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(docWithTwoLists);

        act(() => {
          // Move li1 to after li2 (in list2)
          const moveResult = result.current.moveNodeById('li1', 'li2', 'bottom');
          expect(moveResult.success).toBe(true);
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
      });

      test('allows moving content into list_item', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              contents: { de: 'Para' },
              children: [],
            } as ContentDocumentNode,
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            } as ContainerDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          // Move p1 to after li1-content (inside li1)
          const moveResult = result.current.moveNodeById('p1', 'li1-content', 'bottom');
          expect(moveResult.success).toBe(true);
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
      });

      test('allows moving nested list into list_item', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            } as ContainerDocumentNode,
            {
              id: 'list2',
              number: null,
              type: 'list',
              children: [createListItem('li2', '1.', 'Item 2')],
            } as ContainerDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          // Move list2 to after li1-content (making it a nested list inside li1)
          const moveResult = result.current.moveNodeById('list2', 'li1-content', 'bottom');
          expect(moveResult.success).toBe(true);
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
      });

      test('rejects moving footnote directly into list', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'fn1',
              number: 'i.',
              type: 'footnote',
              contents: { de: 'Note' },
            } as LeafDocumentNode,
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            } as ContainerDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          const moveResult = result.current.moveNodeById('fn1', 'li1', 'bottom');
          expect(moveResult.success).toBe(false);
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('rejects moving list directly into list (must be in list_item)', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', '1.', 'Item 1')],
            } as ContainerDocumentNode,
            {
              id: 'list2',
              number: null,
              type: 'list',
              children: [createListItem('li2', '1.', 'Item 2')],
            } as ContainerDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          // Try to move list2 to after li1 (which would put it directly inside list1)
          const moveResult = result.current.moveNodeById('list2', 'li1', 'bottom');
          expect(moveResult.success).toBe(false);
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });
  });
});

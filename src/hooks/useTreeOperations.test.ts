import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, type MockedFunction, test, vi } from 'vitest';
import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  HeadingDocumentNode,
  LeafDocumentNode,
} from '../types/document';
import type { NodePath } from '../types/editor';
import { buildIndices, getNodeAtPath } from '../utils/tree-utils';
import { useTreeOperations } from './useTreeOperations';

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
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [
        {
          id: 'p1',
          number: null,
          type: 'content',
          format: 'TEXT',
          contents: { de: 'First paragraph' },
          children: [],
        },
        {
          id: 'h2',
          number: '1.1',
          type: 'heading',
          format: 'TEXT',
          contents: { de: 'Nested Heading' },
          children: [
            {
              id: 'p2',
              number: null,
              type: 'content',
              format: 'TEXT',
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
      format: 'TEXT',
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
      format: 'TEXT',
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
      format: 'TEXT',
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
  let _indices: { nodeIndex: Map<string, NodePath>; parentIndex: Map<string, string> };

  beforeEach(() => {
    mockCommit = vi.fn();
    document = createTestDocument();
    _indices = buildIndices(document);
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

  describe('addNodeBefore', () => {
    test('inserts sibling before specified node', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeBefore('h2');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      // New node should be inserted before h2 (was at index 1, now at index 2)
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
        result.current.addNodeBefore('p1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const newNode = h1.children[0] as LeafDocumentNode;
      expect(newNode.type).toBe('content');
      expect(newNode.contents.de).toBe('');
    });

    test('creates list_item when parent is list', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.addNodeBefore('li2');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ContainerDocumentNode;

      expect(list.children.length).toBe(4);
      // New item should be at index 1 (before li2 which shifts to index 2)
      const newItem = list.children[1] as ContainerDocumentNode;
      expect(newItem.type).toBe('list_item');
      expect(list.children[2].id).toBe('li2');
    });

    test('returns the new node ID', () => {
      const { result } = renderTreeOperations();
      let newId: string | undefined;

      act(() => {
        newId = result.current.addNodeBefore('p1');
      });

      expect(newId).toBeDefined();
      expect(typeof newId).toBe('string');

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children[0].id).toBe(newId);
    });

    test('does nothing for root node', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeBefore('root');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('removeNodes', () => {
    test('removes leaf node', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.removeNodes(['p1']);
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
        result.current.removeNodes(['h2']); // Has p2 as child
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('p1');
      // p2 should be gone with h2
      expect(getNodeAtPath(newDoc, [0, 1])).toBeNull();
    });

    test('removes multiple nodes in a single commit', () => {
      const { result } = renderTreeOperations();

      // Remove both p1 and h2 (siblings under h1)
      act(() => {
        result.current.removeNodes(['p1', 'h2']);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      // h1 should have no children left
      expect(h1.children.length).toBe(0);
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
            format: 'TEXT',
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

  describe('indentNodes (Tab)', () => {
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
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          },
          {
            id: 'p1',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['p1']);
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
        result.current.indentNodes(['p1']);
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
            format: 'TEXT',
            contents: { de: 'First' },
            children: [],
          },
          {
            id: 'h2',
            number: null,
            type: 'heading',
            format: 'TEXT',
            contents: { de: 'Second' },
            children: [],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['h2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      expect(newDoc.children.length).toBe(1);
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('h2');
    });

    test('moves list_item into nested list under previous item', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.indentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ContainerDocumentNode;

      // li2 has been pulled out of the outer list, so only li1 and li3 remain.
      expect(list.children.length).toBe(2);
      expect(list.children[0].id).toBe('li1');
      expect(list.children[1].id).toBe('li3');

      // li1 now ends with a nested list whose only child is li2.
      const li1 = list.children[0] as ContainerDocumentNode;
      const li1Last = li1.children[li1.children.length - 1];
      expect(li1Last.type).toBe('list');
      const nested = li1Last as ContainerDocumentNode;
      expect(nested.children.length).toBe(1);
      expect(nested.children[0].id).toBe('li2');
    });

    test('nests two consecutive list_items into one nested list when indented together', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.indentNodes(['li2', 'li3']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ContainerDocumentNode;

      // Only li1 remains at the outer level; li2 and li3 are nested under it.
      expect(list.children.length).toBe(1);
      expect(list.children[0].id).toBe('li1');

      const li1 = list.children[0] as ContainerDocumentNode;
      const li1Last = li1.children[li1.children.length - 1];
      expect(li1Last.type).toBe('list');
      const nested = li1Last as ContainerDocumentNode;
      expect(nested.children.length).toBe(2);
      expect(nested.children[0].id).toBe('li2');
      expect(nested.children[1].id).toBe('li3');
    });

    test('appends list_item to existing nested list under preceding sibling', () => {
      // li1 already has a nested list with liA inside. Indenting li2 should
      // append it to that existing list, not create a new sibling list.
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
                children: [
                  {
                    id: 'li1-content',
                    number: null,
                    type: 'content',
                    format: 'TEXT',
                    contents: { de: 'First' },
                    children: [],
                  },
                  {
                    id: 'oldNested',
                    number: null,
                    type: 'list',
                    children: [createListItem('liA', 'a.', 'Existing nested')],
                  },
                ],
              } as ContainerDocumentNode,
              createListItem('li2', '2.', 'Second'),
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const list1 = newDoc.children[0] as ContainerDocumentNode;
      expect(list1.children.length).toBe(1);

      const li1 = list1.children[0] as ContainerDocumentNode;
      const nested = li1.children.find((c) => c.type === 'list') as ContainerDocumentNode;
      // Same nested list (same id), now with both items inside.
      expect(nested.id).toBe('oldNested');
      expect(nested.children.length).toBe(2);
      expect(nested.children[0].id).toBe('liA');
      expect(nested.children[1].id).toBe('li2');
    });

    test('batch-indenting [li1, li2] in a flat list skips li1 and nests li2', () => {
      // li1 can't be indented (no preceding sibling) so the batch should still
      // succeed for li2, nesting it under li1.
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.indentNodes(['li1', 'li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ContainerDocumentNode;

      // li1 stays at outer level, li2 is now nested under it, li3 still at outer level.
      expect(list.children.map((c) => c.id)).toEqual(['li1', 'li3']);
      const li1 = list.children[0] as ContainerDocumentNode;
      const nested = li1.children[li1.children.length - 1] as ContainerDocumentNode;
      expect(nested.type).toBe('list');
      expect(nested.children.map((c) => c.id)).toEqual(['li2']);
    });

    test('does nothing when list_item has no preceding sibling', () => {
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
        result.current.indentNodes(['li1']);
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test("preserves the list_item's own nested children when indenting", () => {
      // li2 carries its own nested list (with liA). After indenting li2, the
      // new sublist under li1 should contain li2 unchanged — including liA.
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
              {
                id: 'li2',
                number: '2.',
                type: 'list_item',
                children: [
                  {
                    id: 'li2-content',
                    number: null,
                    type: 'content',
                    format: 'TEXT',
                    contents: { de: 'Second' },
                    children: [],
                  },
                  {
                    id: 'li2-nested',
                    number: null,
                    type: 'list',
                    children: [createListItem('liA', 'a.', 'Nested child of li2')],
                  },
                ],
              } as ContainerDocumentNode,
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const list1 = newDoc.children[0] as ContainerDocumentNode;
      const li1 = list1.children[0] as ContainerDocumentNode;
      const newSublist = li1.children[li1.children.length - 1] as ContainerDocumentNode;
      expect(newSublist.type).toBe('list');

      const movedLi2 = newSublist.children[0] as ContainerDocumentNode;
      expect(movedLi2.id).toBe('li2');
      // li2 still has its content + its own nested list
      const movedNested = movedLi2.children.find((c) => c.id === 'li2-nested');
      expect(movedNested).toBeDefined();
      expect((movedNested as ContainerDocumentNode).children[0].id).toBe('liA');
    });

    test('indents multiple sibling nodes under previous heading', () => {
      // doc: h1, p1, p2 at root level → both p1 and p2 should move under h1
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'h1',
            number: null,
            type: 'heading',
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          },
          {
            id: 'p1',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'First' },
            children: [],
          },
          {
            id: 'p2',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'Second' },
            children: [],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['p1', 'p2']);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      // Only h1 remains at root
      expect(newDoc.children.length).toBe(1);
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      // Both p1 and p2 are now children of h1
      expect(h1.children.length).toBe(2);
      expect(h1.children[0].id).toBe('p1');
      expect(h1.children[1].id).toBe('p2');
    });

    test('skips nodes that cannot be indented in a batch', () => {
      // doc: p1, h1 → p1 has no previous heading, h1 has no previous heading
      // Neither can be indented
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'First' },
            children: [],
          },
          {
            id: 'h1',
            number: null,
            type: 'heading',
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['p1', 'h1']);
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('outdentNodes (Shift-Tab)', () => {
    test('moves content to be sibling of parent heading', () => {
      const { result } = renderTreeOperations();

      // p1 is child of h1, outdent should move it to root level after h1
      act(() => {
        result.current.outdentNodes(['p1']);
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
        result.current.outdentNodes(['h1']);
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('moves heading to be sibling of parent heading', () => {
      const { result } = renderTreeOperations();

      // h2 is child of h1, outdent should move it to root level after h1
      act(() => {
        result.current.outdentNodes(['h2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      // Should have 3 children: h1, h2, h1b
      expect(newDoc.children.length).toBe(3);
      expect(newDoc.children[0].id).toBe('h1');
      expect(newDoc.children[1].id).toBe('h2');
      expect(newDoc.children[2].id).toBe('h1b');
    });

    test('moves list_item out of nested list', () => {
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
        result.current.outdentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const list1 = newDoc.children[0] as ContainerDocumentNode;

      // li2 is hoisted into list1 and the (now-empty) malformed inner list is dropped.
      expect(list1.children.map((c) => c.id)).toEqual(['li1', 'li2']);
    });

    test('does nothing when outdenting list_item would place it outside any list', () => {
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
        result.current.outdentNodes(['li1']);
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing when outdenting list_item in list under heading would violate rules', () => {
      const docWithListUnderHeading: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'h1',
            number: '1',
            type: 'heading',
            format: 'TEXT',
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
        result.current.outdentNodes(['li1']);
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('outdents list_item out of a properly nested list under preceding sibling', () => {
      // list1[li1{content, nested[li2]}, li3] → shift-tab on li2 →
      // list1[li1{content}, li2, li3]  (empty nested list is dropped)
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
                children: [
                  {
                    id: 'li1-content',
                    number: null,
                    type: 'content',
                    format: 'TEXT',
                    contents: { de: 'First' },
                    children: [],
                  },
                  {
                    id: 'nested',
                    number: null,
                    type: 'list',
                    children: [createListItem('li2', 'a.', 'Nested item')],
                  },
                ],
              } as ContainerDocumentNode,
              createListItem('li3', '2.', 'Third'),
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const list1 = newDoc.children[0] as ContainerDocumentNode;

      // list1 now has [li1, li2, li3] in order
      expect(list1.children.map((c) => c.id)).toEqual(['li1', 'li2', 'li3']);

      // li1's nested list is gone (it became empty after li2 left)
      const li1 = list1.children[0] as ContainerDocumentNode;
      expect(li1.children.some((c) => c.type === 'list')).toBe(false);
    });

    test('keeps nested list when other items remain after outdent', () => {
      // list1[li1{nested[li2, li3]}] → shift-tab on li2 →
      // list1[li1{nested[li3]}, li2]
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
                children: [
                  {
                    id: 'nested',
                    number: null,
                    type: 'list',
                    children: [createListItem('li2', 'a.', 'A'), createListItem('li3', 'b.', 'B')],
                  },
                ],
              } as ContainerDocumentNode,
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const list1 = newDoc.children[0] as ContainerDocumentNode;
      expect(list1.children.map((c) => c.id)).toEqual(['li1', 'li2']);

      const li1 = list1.children[0] as ContainerDocumentNode;
      const nested = li1.children.find((c) => c.type === 'list') as ContainerDocumentNode;
      expect(nested).toBeDefined();
      expect(nested.children.map((c) => c.id)).toEqual(['li3']);
    });

    test('outdents from a doubly-nested list one level at a time', () => {
      // list1[li1{nested1[li2{nested2[li3]}]}] → shift-tab on li3 →
      // list1[li1{nested1[li2, li3]}]   (li3 moves up one level, into nested1)
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
                children: [
                  {
                    id: 'nested1',
                    number: null,
                    type: 'list',
                    children: [
                      {
                        id: 'li2',
                        number: 'a.',
                        type: 'list_item',
                        children: [
                          {
                            id: 'nested2',
                            number: null,
                            type: 'list',
                            children: [createListItem('li3', 'i.', 'Deepest')],
                          },
                        ],
                      } as ContainerDocumentNode,
                    ],
                  },
                ],
              } as ContainerDocumentNode,
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li3']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const list1 = newDoc.children[0] as ContainerDocumentNode;
      const li1 = list1.children[0] as ContainerDocumentNode;
      const nested1 = li1.children[0] as ContainerDocumentNode;

      // li3 sits next to li2 in nested1; nested2 is gone (it became empty).
      expect(nested1.children.map((c) => c.id)).toEqual(['li2', 'li3']);
      const li2 = nested1.children[0] as ContainerDocumentNode;
      expect(li2.children.some((c) => c.type === 'list')).toBe(false);
    });

    test('outdents two list_items from nested list, dropping empty list', () => {
      // list1[li1{nested[li2, li3]}] → shift-tab on [li2, li3] →
      // list1[li1, li2, li3]  (no nested list left)
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
                children: [
                  {
                    id: 'nested',
                    number: null,
                    type: 'list',
                    children: [createListItem('li2', 'a.', 'A'), createListItem('li3', 'b.', 'B')],
                  },
                ],
              } as ContainerDocumentNode,
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li2', 'li3']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const list1 = newDoc.children[0] as ContainerDocumentNode;
      expect(list1.children.map((c) => c.id)).toEqual(['li1', 'li2', 'li3']);

      const li1 = list1.children[0] as ContainerDocumentNode;
      expect(li1.children.some((c) => c.type === 'list')).toBe(false);
    });

    test('outdents multiple nested nodes', () => {
      // h1 has children p1 and h2. Outdent both → both become root-level siblings after h1
      const { result } = renderTreeOperations();

      act(() => {
        result.current.outdentNodes(['p1', 'h2']);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      // Should have: h1, p1, h2 (with p2 child), h1b
      expect(newDoc.children.length).toBe(4);
      expect(newDoc.children[0].id).toBe('h1');
      expect(newDoc.children[1].id).toBe('p1');
      expect(newDoc.children[2].id).toBe('h2');
      expect(newDoc.children[3].id).toBe('h1b');

      // h1 should have no children left
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(0);
    });
  });

  describe('indentNodes footnote into content', () => {
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
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'fn1',
            number: 'i.',
            type: 'footnote',
            format: 'TEXT',
            contents: { de: 'Footnote text' },
          } as LeafDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['fn1']);
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
            format: 'TEXT',
            contents: { de: 'First footnote' },
          } as LeafDocumentNode,
          {
            id: 'fn2',
            number: 'ii.',
            type: 'footnote',
            format: 'TEXT',
            contents: { de: 'Second footnote' },
          } as LeafDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['fn2']);
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
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          } as HeadingDocumentNode,
          {
            id: 'fn1',
            number: 'i.',
            type: 'footnote',
            format: 'TEXT',
            contents: { de: 'Footnote text' },
          } as LeafDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['fn1']);
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

  describe('outdentNodes footnote from content', () => {
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
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [
              {
                id: 'fn1',
                number: 'i.',
                type: 'footnote',
                format: 'TEXT',
                contents: { de: 'Footnote text' },
              } as LeafDocumentNode,
            ],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['fn1']);
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
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [
              {
                id: 'fn1',
                number: 'i.',
                type: 'footnote',
                format: 'TEXT',
                contents: { de: 'First footnote' },
              } as LeafDocumentNode,
              {
                id: 'fn2',
                number: 'ii.',
                type: 'footnote',
                format: 'TEXT',
                contents: { de: 'Second footnote' },
              } as LeafDocumentNode,
            ],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['fn1']);
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

  describe('changeNodeTypes', () => {
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
              format: 'TEXT',
              contents: { de: 'Some text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'heading');
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
              format: 'TEXT',
              contents: { de: 'German text', en: 'English text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'heading');
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
              format: 'TEXT',
              contents: { de: 'Already heading' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'heading');
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
              format: 'TEXT',
              contents: { de: 'Heading text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'content');
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
              format: 'TEXT',
              contents: { de: 'Heading' },
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'content',
                  format: 'TEXT',
                  contents: { de: 'Child 1' },
                  children: [],
                },
                {
                  id: 'p2',
                  number: null,
                  type: 'content',
                  format: 'TEXT',
                  contents: { de: 'Child 2' },
                  children: [],
                },
              ],
            },
            {
              id: 'h2',
              number: '2',
              type: 'heading',
              format: 'TEXT',
              contents: { de: 'Second heading' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'content');
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
              format: 'TEXT',
              contents: { de: 'Already content' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'content');
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
              format: 'TEXT',
              contents: { de: 'Item text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'numbered');
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
              format: 'TEXT',
              contents: { de: 'Item' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'numbered');
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
              format: 'TEXT',
              contents: { de: 'Item' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'lettered');
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
              format: 'TEXT',
              contents: { de: 'Item' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'unordered');
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
              format: 'TEXT',
              contents: { de: 'Heading' },
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'content',
                  format: 'TEXT',
                  contents: { de: 'Child content' },
                  children: [],
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'list', 'numbered');
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
          result.current.changeNodeTypes(['li1'], 'content');
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
          result.current.changeNodeTypes(['li2'], 'content');
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
          result.current.changeNodeTypes(['li1'], 'heading');
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
          result.current.changeNodeTypes(['li1'], 'heading');
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

    describe('list_item style change (single item only)', () => {
      test('changes only selected item to numbered, leaves siblings unchanged', () => {
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
          result.current.changeNodeTypes(['li2'], 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        // Only li2 (index 1) should change
        expect((list.children[0] as ContainerDocumentNode).number).toBeNull();
        expect((list.children[1] as ContainerDocumentNode).number).toBe('2.');
        expect((list.children[2] as ContainerDocumentNode).number).toBeNull();
      });

      test('changes only selected item to lettered', () => {
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
          result.current.changeNodeTypes(['li1'], 'list', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        // Only li1 (index 0) should change
        expect((list.children[0] as ContainerDocumentNode).number).toBe('a.');
        expect((list.children[1] as ContainerDocumentNode).number).toBe('2.');
      });

      test('changes only selected item to unordered', () => {
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
          result.current.changeNodeTypes(['li1'], 'list', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        // Only li1 (index 0) should change
        expect((list.children[0] as ContainerDocumentNode).number).toBeNull();
        expect((list.children[1] as ContainerDocumentNode).number).toBe('2.');
      });
    });

    describe('list node style change', () => {
      test('list node + numbered: changes all children to 1., 2., 3.', () => {
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
          result.current.changeNodeTypes(['list1'], 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        expect((list.children[0] as ContainerDocumentNode).number).toBe('1.');
        expect((list.children[1] as ContainerDocumentNode).number).toBe('2.');
        expect((list.children[2] as ContainerDocumentNode).number).toBe('3.');
      });

      test('list node + unordered: sets all children numbers to null', () => {
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
          result.current.changeNodeTypes(['list1'], 'list', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        expect((list.children[0] as ContainerDocumentNode).number).toBeNull();
        expect((list.children[1] as ContainerDocumentNode).number).toBeNull();
      });

      test('list node + lettered: changes all children to a., b., c.', () => {
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
                createListItem('li1', '1.', 'A'),
                createListItem('li2', '2.', 'B'),
                createListItem('li3', '3.', 'C'),
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'list', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;

        expect((list.children[0] as ContainerDocumentNode).number).toBe('a.');
        expect((list.children[1] as ContainerDocumentNode).number).toBe('b.');
        expect((list.children[2] as ContainerDocumentNode).number).toBe('c.');
      });

      test('list node + non-list target: does nothing', () => {
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
          result.current.changeNodeTypes(['list1'], 'heading');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      test('cannot convert document root', () => {
        const { result } = renderTreeOperations();

        act(() => {
          result.current.changeNodeTypes(['root'], 'content');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('cannot convert list to footnote', () => {
        // list -> content is valid (issue #80: flattens with number preservation),
        // and list -> heading is a no-op (covered elsewhere). list -> footnote
        // remains unsupported because there's no meaningful semantics for it.
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
          result.current.changeNodeTypes(['list1'], 'footnote');
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
              format: 'TEXT',
              contents: { de: 'Convert me' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'numbered');
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
              format: 'TEXT',
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
          result.current.changeNodeTypes(['p1'], 'list', 'numbered');
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
              format: 'TEXT',
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
          result.current.changeNodeTypes(['p1'], 'list', 'numbered');
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
              format: 'TEXT',
              contents: { de: 'Separator' },
              children: [],
            },
            {
              id: 'p1',
              number: null,
              type: 'content',
              format: 'TEXT',
              contents: { de: 'Convert me' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'numbered');
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
              format: 'TEXT',
              contents: { de: 'Note text' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'footnote');
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
              format: 'TEXT',
              contents: { de: 'German', en: 'English' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'footnote');
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
              format: 'TEXT',
              contents: { de: 'Main text' },
              children: [
                {
                  id: 'fn1',
                  number: 'i.',
                  type: 'footnote',
                  format: 'TEXT',
                  contents: { de: 'First footnote' },
                } as LeafDocumentNode,
                {
                  id: 'fn2',
                  number: 'ii.',
                  type: 'footnote',
                  format: 'TEXT',
                  contents: { de: 'Second footnote' },
                } as LeafDocumentNode,
              ],
            } as ContentDocumentNode,
            {
              id: 'p2',
              number: null,
              type: 'content',
              format: 'TEXT',
              contents: { de: 'Next paragraph' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'footnote');
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
              format: 'TEXT',
              contents: { de: 'Already a footnote' },
            } as LeafDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['fn1'], 'footnote');
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
              format: 'TEXT',
              contents: { de: 'Heading text' },
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'content',
                  format: 'TEXT',
                  contents: { de: 'Child content' },
                  children: [],
                } as ContentDocumentNode,
                {
                  id: 'p2',
                  number: null,
                  type: 'content',
                  format: 'TEXT',
                  contents: { de: 'Another child' },
                  children: [],
                } as ContentDocumentNode,
              ],
            } as HeadingDocumentNode,
            {
              id: 'h2',
              number: '2',
              type: 'heading',
              format: 'TEXT',
              contents: { de: 'Next heading' },
              children: [],
            } as HeadingDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'footnote');
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
              format: 'TEXT',
              contents: { de: 'Heading text' },
              children: [],
            } as HeadingDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'footnote');
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
              format: 'TEXT',
              contents: { de: 'Footnote text' },
            } as LeafDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['fn1'], 'content');
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
              format: 'TEXT',
              contents: { de: 'German', en: 'English', fr: 'French' },
            } as LeafDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['fn1'], 'content');
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
          result.current.changeNodeTypes(['list1'], 'footnote');
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
          result.current.changeNodeTypes(['li1'], 'footnote');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    // Issue #80: lossless number preservation between lists and content nodes.
    describe('list_item -> content (number preservation, issue #80)', () => {
      test('preserves list_item.number on the converted content node when it is the only item', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', 'Art. 5', 'Article body')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.type).toBe('content');
        expect(converted.number).toBe('Art. 5');
        expect(converted.contents.de).toBe('Article body');
      });

      test('handles a list_item with no content child (empty contents, default format)', () => {
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
                  children: [],
                } as ContainerDocumentNode,
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.type).toBe('content');
        expect(converted.id).toBe('li1');
        expect(converted.number).toBe('1.');
        expect(converted.contents).toEqual({});
        expect(converted.format).toBe('TEXT');
      });

      test('preserves the list_item content format when converting to content', () => {
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
                  children: [
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'content',
                      format: 'MARKDOWN',
                      contents: { de: '**bold**' },
                      children: [],
                    } as ContentDocumentNode,
                  ],
                } as ContainerDocumentNode,
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.format).toBe('MARKDOWN');
        expect(converted.contents.de).toBe('**bold**');
      });

      test('preserves list_item.number when extracted from a multi-item list', () => {
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
          result.current.changeNodeTypes(['li2'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        // Remaining list_item is untouched
        const list = newDoc.children[0] as ContainerDocumentNode;
        expect((list.children[0] as ContainerDocumentNode).number).toBe('1.');

        // Extracted content carries its old list_item number
        const converted = newDoc.children[1] as ContentDocumentNode;
        expect(converted.type).toBe('content');
        expect(converted.number).toBe('2.');
      });
    });

    describe('list_item -> heading (number preservation, issue #80)', () => {
      test('preserves list_item.number on the converted heading node', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', 'Art. 7', 'Heading body')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'heading');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as HeadingDocumentNode;

        expect(converted.type).toBe('heading');
        expect(converted.number).toBe('Art. 7');
      });
    });

    describe('list -> content (issue #80)', () => {
      test('flattens all list_items into content nodes, preserving each number', () => {
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
                createListItem('li1', '1.', 'A'),
                createListItem('li2', '2.', 'B'),
                createListItem('li3', '3.', 'C'),
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        expect(newDoc.children.length).toBe(3);

        const c0 = newDoc.children[0] as ContentDocumentNode;
        const c1 = newDoc.children[1] as ContentDocumentNode;
        const c2 = newDoc.children[2] as ContentDocumentNode;

        expect(c0.type).toBe('content');
        expect(c0.number).toBe('1.');
        expect(c0.contents.de).toBe('A');
        expect(c1.type).toBe('content');
        expect(c1.number).toBe('2.');
        expect(c1.contents.de).toBe('B');
        expect(c2.type).toBe('content');
        expect(c2.number).toBe('3.');
        expect(c2.contents.de).toBe('C');
      });

      test('preserves null number for unnumbered items', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'list',
              children: [createListItem('li1', null, 'A'), createListItem('li2', null, 'B')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        expect(newDoc.children.length).toBe(2);
        expect((newDoc.children[0] as ContentDocumentNode).number).toBeNull();
        expect((newDoc.children[1] as ContentDocumentNode).number).toBeNull();
      });

      test('flattens nested list recursively, preserving inner numbers', () => {
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
                  children: [
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'content',
                      format: 'TEXT',
                      contents: { de: 'Outer 1' },
                      children: [],
                    } as ContentDocumentNode,
                    {
                      id: 'sublist',
                      number: null,
                      type: 'list',
                      children: [
                        createListItem('lia', 'a.', 'Inner a'),
                        createListItem('lib', 'b.', 'Inner b'),
                      ],
                    },
                  ],
                } as ContainerDocumentNode,
                createListItem('li2', '2.', 'Outer 2'),
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        expect(newDoc.children.length).toBe(4);

        const c0 = newDoc.children[0] as ContentDocumentNode;
        const c1 = newDoc.children[1] as ContentDocumentNode;
        const c2 = newDoc.children[2] as ContentDocumentNode;
        const c3 = newDoc.children[3] as ContentDocumentNode;

        expect(c0.number).toBe('1.');
        expect(c0.contents.de).toBe('Outer 1');
        expect(c1.number).toBe('a.');
        expect(c1.contents.de).toBe('Inner a');
        expect(c2.number).toBe('b.');
        expect(c2.contents.de).toBe('Inner b');
        expect(c3.number).toBe('2.');
        expect(c3.contents.de).toBe('Outer 2');
      });

      test('preserves source order when nested list precedes the content child', () => {
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
                  children: [
                    {
                      id: 'sublist',
                      number: null,
                      type: 'list',
                      children: [createListItem('lia', 'a.', 'Inner a')],
                    },
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'content',
                      format: 'TEXT',
                      contents: { de: 'Outer text' },
                      children: [],
                    } as ContentDocumentNode,
                  ],
                } as ContainerDocumentNode,
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        expect(newDoc.children.length).toBe(2);

        // Source order: nested 'a.' first (it appeared before the content child),
        // then the outer text content carrying li1's number.
        const c0 = newDoc.children[0] as ContentDocumentNode;
        const c1 = newDoc.children[1] as ContentDocumentNode;
        expect(c0.number).toBe('a.');
        expect(c0.contents.de).toBe('Inner a');
        expect(c1.number).toBe('1.');
        expect(c1.contents.de).toBe('Outer text');
      });

      test('preserves the source content format on the flattened content node', () => {
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
                  children: [
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'content',
                      format: 'MARKDOWN',
                      contents: { de: '**bold**' },
                      children: [],
                    } as ContentDocumentNode,
                  ],
                } as ContainerDocumentNode,
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.format).toBe('MARKDOWN');
        expect(converted.contents.de).toBe('**bold**');
      });

      test('lifts a list_item with multiple content children, attaching the number to the first', () => {
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
                  children: [
                    {
                      id: 'p1',
                      number: null,
                      type: 'content',
                      format: 'TEXT',
                      contents: { de: 'First paragraph' },
                      children: [],
                    } as ContentDocumentNode,
                    {
                      id: 'p2',
                      number: null,
                      type: 'content',
                      format: 'TEXT',
                      contents: { de: 'Second paragraph' },
                      children: [],
                    } as ContentDocumentNode,
                  ],
                } as ContainerDocumentNode,
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        expect(newDoc.children.length).toBe(2);

        // First content carries li1's id and number
        const c0 = newDoc.children[0] as ContentDocumentNode;
        expect(c0.id).toBe('li1');
        expect(c0.number).toBe('1.');
        expect(c0.contents.de).toBe('First paragraph');

        // Subsequent content is lifted as-is, keeping its own id and number
        const c1 = newDoc.children[1] as ContentDocumentNode;
        expect(c1.id).toBe('p2');
        expect(c1.number).toBeNull();
        expect(c1.contents.de).toBe('Second paragraph');
      });

      test('synthesizes a placeholder content node for a list_item with no content child', () => {
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
                  children: [],
                } as ContainerDocumentNode,
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

        expect(newDoc.children.length).toBe(1);
        const placeholder = newDoc.children[0] as ContentDocumentNode;
        expect(placeholder.type).toBe('content');
        expect(placeholder.id).toBe('li1');
        expect(placeholder.number).toBe('1.');
        expect(placeholder.contents).toEqual({});
        expect(placeholder.format).toBe('TEXT');
      });

      test('preserves footnote children of the list_item content', () => {
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
                  children: [
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'content',
                      format: 'TEXT',
                      contents: { de: 'Item with note' },
                      children: [
                        {
                          id: 'fn1',
                          number: 'i.',
                          type: 'footnote',
                          format: 'TEXT',
                          contents: { de: 'Note text' },
                        } as LeafDocumentNode,
                      ],
                    } as ContentDocumentNode,
                  ],
                } as ContainerDocumentNode,
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'content');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.children.length).toBe(1);
        expect(converted.children[0].id).toBe('fn1');
        expect(converted.children[0].type).toBe('footnote');
      });

      test('list -> heading is still a no-op', () => {
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
          result.current.changeNodeTypes(['list1'], 'heading');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('content -> list (number preservation, issue #80)', () => {
      test('unordered preserves the content original number on the new list_item', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: 'Art. 5',
              type: 'content',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as ContainerDocumentNode;

        expect(item.number).toBe('Art. 5');
      });

      test('numbered overwrites the content number with the generated sequence', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: 'Art. 5',
              type: 'content',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as ContainerDocumentNode;

        expect(item.number).toBe('1.');
      });

      test('lettered overwrites the content number with the generated sequence', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: 'Art. 5',
              type: 'content',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as ContainerDocumentNode;

        expect(item.number).toBe('a.');
      });

      test('unordered with null content number stays null', () => {
        const doc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'content',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = newDoc.children[0] as ContainerDocumentNode;
        const item = list.children[0] as ContainerDocumentNode;

        expect(item.number).toBeNull();
      });
    });

    describe('roundtrip content <-> unordered list (issue #80)', () => {
      test('content -> unordered list -> content preserves number', () => {
        const startDoc: ContainerDocumentNode = {
          id: 'root',
          number: null,
          type: 'document',
          children: [
            {
              id: 'p1',
              number: 'Art. 5',
              type: 'content',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        // Step 1: content -> unordered list
        const { result } = renderTreeOperations(startDoc);
        act(() => {
          result.current.changeNodeTypes(['p1'], 'list', 'unordered');
        });
        const afterToList = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const list = afterToList.children[0] as ContainerDocumentNode;
        const listItem = list.children[0] as ContainerDocumentNode;
        expect(listItem.number).toBe('Art. 5');

        // Step 2: list_item -> content (rebuild hook over the new doc)
        mockCommit.mockClear();
        const { result: result2 } = renderTreeOperations(afterToList);
        act(() => {
          result2.current.changeNodeTypes([listItem.id], 'content');
        });
        const afterRoundtrip = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
        const finalContent = afterRoundtrip.children[0] as ContentDocumentNode;

        expect(finalContent.type).toBe('content');
        expect(finalContent.number).toBe('Art. 5');
      });
    });
  });

  describe('changeNodeTypes (batch)', () => {
    test('changes type for multiple content nodes to heading', () => {
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'First' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p2',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'Second' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p3',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'Third' },
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.changeNodeTypes(['p1', 'p2', 'p3'], 'heading');
      });

      // Single commit for all three changes
      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      expect(newDoc.children[0].type).toBe('heading');
      expect(newDoc.children[1].type).toBe('heading');
      expect(newDoc.children[2].type).toBe('heading');
    });

    test('handles mixed node types (content + heading -> footnote)', () => {
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'h1',
            number: '1',
            type: 'heading',
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          } as HeadingDocumentNode,
          {
            id: 'p1',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.changeNodeTypes(['h1', 'p1'], 'footnote');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      expect(newDoc.children[0].type).toBe('footnote');
      expect(newDoc.children[1].type).toBe('footnote');
    });

    test('commits nothing when no nodes can be changed', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.changeNodeTypes(['root'], 'content');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('numbers a numbered-list batch sequentially (1., 2., 3.)', () => {
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'A' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p2',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'B' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p3',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'C' },
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.changeNodeTypes(['p1', 'p2', 'p3'], 'list', 'numbered');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      expect(newDoc.children.length).toBe(1);
      const list = newDoc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      expect(list.children.length).toBe(3);
      expect((list.children[0] as ContainerDocumentNode).number).toBe('1.');
      expect((list.children[1] as ContainerDocumentNode).number).toBe('2.');
      expect((list.children[2] as ContainerDocumentNode).number).toBe('3.');
    });

    test('letters a lettered-list batch sequentially (a., b., c.)', () => {
      const doc: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'A' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p2',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'B' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p3',
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: { de: 'C' },
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.changeNodeTypes(['p1', 'p2', 'p3'], 'list', 'lettered');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;

      const list = newDoc.children[0] as ContainerDocumentNode;
      expect(list.children.length).toBe(3);
      expect((list.children[0] as ContainerDocumentNode).number).toBe('a.');
      expect((list.children[1] as ContainerDocumentNode).number).toBe('b.');
      expect((list.children[2] as ContainerDocumentNode).number).toBe('c.');
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
              format: 'TEXT',
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
              format: 'TEXT',
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
              format: 'TEXT',
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
              format: 'TEXT',
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

  describe('getReceivingParentId', () => {
    test('returns parent id when move would be valid (content to heading)', () => {
      // h1 contains p1 and h2. Moving p2 (inside h2) to after p1 would make h1 the parent.
      const { result } = renderTreeOperations();

      // p2 is at [0, 1, 0], p1 is at [0, 0]
      // Moving p2 to p1's position means p2 becomes sibling of p1, child of h1
      const parentId = result.current.getReceivingParentId('p2', 'p1');
      expect(parentId).toBe('h1');
    });

    test('returns document id for valid moves to document level', () => {
      // Moving h2 (nested in h1) to after h1b would make document the parent
      const { result } = renderTreeOperations();

      // h2 is at [0, 1], h1b is at [1]
      // Moving h2 next to h1b means parent is document (root)
      const parentId = result.current.getReceivingParentId('h2', 'h1b');
      expect(parentId).toBe('root');
    });

    test('returns null when move would be invalid (list_item to document)', () => {
      const docWithList = createDocumentWithList();
      const { result } = renderTreeOperations(docWithList);

      // li1 is in list1, trying to move to document level (next to h1)
      // list_item cannot be child of document
      const parentId = result.current.getReceivingParentId('li1', 'h1');
      expect(parentId).toBeNull();
    });

    test('returns null when move would be invalid (content to list)', () => {
      const docWithList: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'content',
            format: 'TEXT',
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

      // content cannot be direct child of list (only list_item can)
      const parentId = result.current.getReceivingParentId('p1', 'li1');
      expect(parentId).toBeNull();
    });

    test('returns null when source equals target', () => {
      const { result } = renderTreeOperations();

      const parentId = result.current.getReceivingParentId('h1', 'h1');
      expect(parentId).toBeNull();
    });

    test('returns null when source not found', () => {
      const { result } = renderTreeOperations();

      const parentId = result.current.getReceivingParentId('nonexistent', 'h1');
      expect(parentId).toBeNull();
    });

    test('returns null when target not found', () => {
      const { result } = renderTreeOperations();

      const parentId = result.current.getReceivingParentId('h1', 'nonexistent');
      expect(parentId).toBeNull();
    });

    test('returns list id for valid list_item moves within list', () => {
      const docWithList = createDocumentWithList();
      const { result } = renderTreeOperations(docWithList);

      // Moving li3 to before li1, both in same list
      const parentId = result.current.getReceivingParentId('li3', 'li1');
      expect(parentId).toBe('list1');
    });

    test('returns list id for valid list_item moves between lists', () => {
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

      // Moving li1 to list2 (next to li2)
      const parentId = result.current.getReceivingParentId('li1', 'li2');
      expect(parentId).toBe('list2');
    });
  });

  describe('changeNodeFormat', () => {
    test('updates a content node format and commits one history entry', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.changeNodeFormat('p1', 'MARKDOWN');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const p1 = h1.children[0] as ContentDocumentNode;
      expect(p1.format).toBe('MARKDOWN');
      expect(p1.contents).toEqual({ de: 'First paragraph' });
    });

    test('does nothing when format is not allowed for the node type', () => {
      const { result } = renderTreeOperations();

      act(() => {
        // heading does not allow MARKDOWN
        result.current.changeNodeFormat('h1', 'MARKDOWN');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing for an unknown id', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.changeNodeFormat('does-not-exist', 'MARKDOWN');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('addNodeAfter — default format', () => {
    test('creates a content node with default format TEXT', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeAfter('p1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const newNode = h1.children[1] as ContentDocumentNode;
      expect(newNode.type).toBe('content');
      expect(newNode.format).toBe('TEXT');
    });

    test('addNodeBefore creates a content node with default format TEXT', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeBefore('h2');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const newNode = h1.children[1] as ContentDocumentNode;
      expect(newNode.format).toBe('TEXT');
    });

    test('list_item created via addNodeAfter has its inner content node with format TEXT', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.addNodeAfter('li1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ContainerDocumentNode;
      const newItem = list.children[1] as ContainerDocumentNode;
      const inner = newItem.children[0] as ContentDocumentNode;
      expect(inner.format).toBe('TEXT');
    });
  });

  describe('changeNodeTypes — format preservation/reset', () => {
    test('preserves an allowed format when converting content → footnote (NEWLINES is allowed on both)', () => {
      const docWithMarkdown: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p',
            number: null,
            type: 'content',
            format: 'NEWLINES',
            contents: { de: 'preserved' },
            children: [],
          } as ContentDocumentNode,
        ],
      };
      const { result } = renderTreeOperations(docWithMarkdown);

      act(() => {
        result.current.changeNodeTypes(['p'], 'footnote');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const f = newDoc.children[0] as LeafDocumentNode;
      expect(f.type).toBe('footnote');
      expect(f.format).toBe('NEWLINES');
    });

    test('resets to TEXT when converting content (MARKDOWN) → heading (MARKDOWN not allowed)', () => {
      const docWithMarkdown: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'p',
            number: null,
            type: 'content',
            format: 'MARKDOWN',
            contents: { de: '**bold**' },
            children: [],
          } as ContentDocumentNode,
        ],
      };
      const { result } = renderTreeOperations(docWithMarkdown);

      act(() => {
        result.current.changeNodeTypes(['p'], 'heading');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const h = newDoc.children[0] as HeadingDocumentNode;
      expect(h.type).toBe('heading');
      expect(h.format).toBe('TEXT');
      // contents preserved
      expect(h.contents.de).toBe('**bold**');
    });

    test('preserves NEWLINES when converting heading → content (still allowed)', () => {
      const docWithNewlines: ContainerDocumentNode = {
        id: 'root',
        number: null,
        type: 'document',
        children: [
          {
            id: 'h',
            number: '1',
            type: 'heading',
            format: 'NEWLINES',
            contents: { de: 'a\nb' },
            children: [],
          } as HeadingDocumentNode,
        ],
      };
      const { result } = renderTreeOperations(docWithNewlines);

      act(() => {
        result.current.changeNodeTypes(['h'], 'content');
      });

      const newDoc = mockCommit.mock.calls[0][0] as ContainerDocumentNode;
      const c = newDoc.children[0] as ContentDocumentNode;
      expect(c.type).toBe('content');
      expect(c.format).toBe('NEWLINES');
    });
  });
});

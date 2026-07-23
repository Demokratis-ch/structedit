import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, type MockedFunction, test, vi } from 'vitest';
import type {
  BlockDocumentNode,
  ContentDocumentNode,
  DocumentRootNode,
  FootnoteDocumentNode,
  HeadingDocumentNode,
  ListDocumentNode,
  ListItemDocumentNode,
  NumberedDocumentNode,
} from '../types/document';
import { isValidDocument } from '../types/document';
import type { NodePath } from '../types/editor';
import { buildIndices, getNodeAtPath } from '../utils/tree-utils';
import { useTreeOperations } from './useTreeOperations';

// Helper to create a test document
const createTestDocument = (): DocumentRootNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [
        {
          id: 'p1',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'First paragraph' },
          children: [],
        },
        {
          id: 'h2',
          number: '1.1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Nested Heading' },
          children: [
            {
              id: 'p2',
              number: null,
              type: 'CONTENT',
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
      type: 'HEADING',
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
): ListItemDocumentNode => ({
  id,
  number,
  type: 'LIST_ITEM',
  children: [
    {
      id: `${id}-content`,
      number: null,
      type: 'CONTENT',
      format: 'TEXT',
      contents: { de: content },
      children: [],
    } as ContentDocumentNode,
  ],
});

const createDocumentWithList = (): DocumentRootNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Title' },
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
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
  let mockCommit: MockedFunction<(doc: DocumentRootNode, saveHistory?: boolean) => void>;
  let document: DocumentRootNode;
  let _indices: { nodeIndex: Map<string, NodePath>; parentIndex: Map<string, string> };

  beforeEach(() => {
    mockCommit = vi.fn();
    document = createTestDocument();
    _indices = buildIndices(document);
  });

  const renderTreeOperations = (doc: DocumentRootNode = document) => {
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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      // New node should be inserted after p1 (index 1)
      expect(h1.children.length).toBe(3);
      expect(h1.children[0].id).toBe('p1');
      expect(h1.children[2].id).toBe('h2');
      // New node is in the middle
      const newNode = h1.children[1] as ContentDocumentNode;
      expect(newNode.type).toBe('CONTENT');
      expect(newNode.contents.de).toBe('');
    });

    test('creates content node by default', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeAfter('p1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const newNode = h1.children[1] as ContentDocumentNode;
      expect(newNode.type).toBe('CONTENT');
    });

    test('creates list_item when parent is list', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.addNodeAfter('li1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ListDocumentNode;

      expect(list.children.length).toBe(4);
      const newItem = list.children[1] as ListItemDocumentNode;
      expect(newItem.type).toBe('LIST_ITEM');
    });
  });

  describe('addNodeBefore', () => {
    test('inserts sibling before specified node', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeBefore('h2');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      // New node should be inserted before h2 (was at index 1, now at index 2)
      expect(h1.children.length).toBe(3);
      expect(h1.children[0].id).toBe('p1');
      expect(h1.children[2].id).toBe('h2');
      // New node is in the middle
      const newNode = h1.children[1] as ContentDocumentNode;
      expect(newNode.type).toBe('CONTENT');
      expect(newNode.contents.de).toBe('');
    });

    test('creates content node by default', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeBefore('p1');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const newNode = h1.children[0] as ContentDocumentNode;
      expect(newNode.type).toBe('CONTENT');
      expect(newNode.contents.de).toBe('');
    });

    test('creates list_item when parent is list', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.addNodeBefore('li2');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ListDocumentNode;

      expect(list.children.length).toBe(4);
      // New item should be at index 1 (before li2 which shifts to index 2)
      const newItem = list.children[1] as ListItemDocumentNode;
      expect(newItem.type).toBe('LIST_ITEM');
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;

      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('h2');
    });

    test('removes node with all descendants', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.removeNodes(['h2']); // Has p2 as child
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const p1 = getNodeAtPath(newDoc, [0, 0]) as ContentDocumentNode;
      expect(p1.contents.de).toBe('Updated content');
    });

    test('preserves other languages', () => {
      // Create a document with multi-language content
      const multiLangDoc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const p1 = newDoc.children[0] as ContentDocumentNode;
      expect(p1.contents.de).toBe('Neuer Text');
      expect(p1.contents.en).toBe('English'); // Preserved
    });
  });

  describe('indentNodes (Tab)', () => {
    test('moves content under previous sibling heading', () => {
      // Create doc with h1, then content at same level
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'h1',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          },
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'h1',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'First' },
            children: [],
          },
          {
            id: 'h2',
            number: null,
            type: 'HEADING',
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ListDocumentNode;

      // li2 has been pulled out of the outer list, so only li1 and li3 remain.
      expect(list.children.length).toBe(2);
      expect(list.children[0].id).toBe('li1');
      expect(list.children[1].id).toBe('li3');

      // li1 now ends with a nested list whose only child is li2.
      const li1 = list.children[0] as ListItemDocumentNode;
      const li1Last = li1.children[li1.children.length - 1];
      expect(li1Last.type).toBe('LIST');
      const nested = li1Last as ListDocumentNode;
      expect(nested.children.length).toBe(1);
      expect(nested.children[0].id).toBe('li2');
    });

    test('nests two consecutive list_items into one nested list when indented together', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.indentNodes(['li2', 'li3']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ListDocumentNode;

      // Only li1 remains at the outer level; li2 and li3 are nested under it.
      expect(list.children.length).toBe(1);
      expect(list.children[0].id).toBe('li1');

      const li1 = list.children[0] as ListItemDocumentNode;
      const li1Last = li1.children[li1.children.length - 1];
      expect(li1Last.type).toBe('LIST');
      const nested = li1Last as ListDocumentNode;
      expect(nested.children.length).toBe(2);
      expect(nested.children[0].id).toBe('li2');
      expect(nested.children[1].id).toBe('li3');
    });

    test('appends list_item to existing nested list under preceding sibling', () => {
      // li1 already has a nested list with liA inside. Indenting li2 should
      // append it to that existing list, not create a new sibling list.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: 'li1-content',
                    number: null,
                    type: 'CONTENT',
                    format: 'TEXT',
                    contents: { de: 'First' },
                    children: [],
                  },
                  {
                    id: 'oldNested',
                    number: null,
                    type: 'LIST',
                    children: [createListItem('liA', 'a.', 'Existing nested')],
                  },
                ],
              },
              createListItem('li2', '2.', 'Second'),
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list1 = newDoc.children[0] as ListDocumentNode;
      expect(list1.children.length).toBe(1);

      const li1 = list1.children[0] as ListItemDocumentNode;
      const nested = li1.children.find((c) => c.type === 'LIST') as ListDocumentNode;
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ListDocumentNode;

      // li1 stays at outer level, li2 is now nested under it, li3 still at outer level.
      expect(list.children.map((c) => c.id)).toEqual(['li1', 'li3']);
      const li1 = list.children[0] as ListItemDocumentNode;
      const nested = li1.children[li1.children.length - 1] as ListDocumentNode;
      expect(nested.type).toBe('LIST');
      expect(nested.children.map((c) => c.id)).toEqual(['li2']);
    });

    test('does nothing when list_item has no preceding sibling', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
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
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              createListItem('li1', '1.', 'First'),
              {
                id: 'li2',
                number: '2.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: 'li2-content',
                    number: null,
                    type: 'CONTENT',
                    format: 'TEXT',
                    contents: { de: 'Second' },
                    children: [],
                  },
                  {
                    id: 'li2-nested',
                    number: null,
                    type: 'LIST',
                    children: [createListItem('liA', 'a.', 'Nested child of li2')],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list1 = newDoc.children[0] as ListDocumentNode;
      const li1 = list1.children[0] as ListItemDocumentNode;
      const newSublist = li1.children[li1.children.length - 1] as ListDocumentNode;
      expect(newSublist.type).toBe('LIST');

      const movedLi2 = newSublist.children[0] as ListItemDocumentNode;
      expect(movedLi2.id).toBe('li2');
      // li2 still has its content + its own nested list
      const movedNested = movedLi2.children.find((c) => c.id === 'li2-nested');
      expect(movedNested).toBeDefined();
      expect((movedNested as ListDocumentNode).children[0].id).toBe('liA');
    });

    test('indents multiple sibling nodes under previous heading', () => {
      // doc: h1, p1, p2 at root level → both p1 and p2 should move under h1
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'h1',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          },
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'First' },
            children: [],
          },
          {
            id: 'p2',
            number: null,
            type: 'CONTENT',
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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'First' },
            children: [],
          },
          {
            id: 'h1',
            number: null,
            type: 'HEADING',
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

    test('does not re-nest selected descendants when an ancestor is selected too (issue #108)', () => {
      // doc: HeadingA, HeadingB(HeadingC, HeadingD). Selecting B together with
      // its children C and D and indenting must nest B under A while leaving C
      // and D as direct siblings under B — not re-nesting D under C.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'A',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'HeadingA' },
            children: [],
          },
          {
            id: 'B',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'HeadingB' },
            children: [
              {
                id: 'C',
                number: null,
                type: 'HEADING',
                format: 'TEXT',
                contents: { de: 'HeadingC' },
                children: [],
              },
              {
                id: 'D',
                number: null,
                type: 'HEADING',
                format: 'TEXT',
                contents: { de: 'HeadingD' },
                children: [],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['B', 'C', 'D']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(isValidDocument(newDoc)).toBe(true);

      // A is the only root child; B nested under it.
      expect(newDoc.children.map((c) => c.id)).toEqual(['A']);
      const a = newDoc.children[0] as HeadingDocumentNode;
      expect(a.children.map((c) => c.id)).toEqual(['B']);

      // C and D remain direct children of B, in order.
      const b = a.children[0] as HeadingDocumentNode;
      expect(b.children.map((c) => c.id)).toEqual(['C', 'D']);
    });

    test('indents two disjoint subtrees, carrying nested descendants untouched (issue #108)', () => {
      // Two independent subtrees, each with a selected ancestor and selected
      // descendants. Both ancestors should indent under their previous sibling,
      // each carrying its descendants along without re-nesting them.
      const heading = (id: string, children: HeadingDocumentNode[] = []): HeadingDocumentNode => ({
        id,
        number: null,
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: id },
        children,
      });
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          heading('A'),
          heading('B', [heading('C', [heading('E')])]),
          heading('X'),
          heading('Y', [heading('Z')]),
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        // Selection spans two disjoint subtrees: ancestors B/Y plus their
        // descendants C/E/Z. (X is left out — it is the sibling Y indents under.)
        result.current.indentNodes(['B', 'C', 'E', 'Y', 'Z']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(isValidDocument(newDoc)).toBe(true);

      // A and X remain at root; B nested under A, Y nested under X.
      expect(newDoc.children.map((c) => c.id)).toEqual(['A', 'X']);
      const a = newDoc.children[0] as HeadingDocumentNode;
      const x = newDoc.children[1] as HeadingDocumentNode;
      expect(a.children.map((c) => c.id)).toEqual(['B']);
      expect(x.children.map((c) => c.id)).toEqual(['Y']);

      // Nested descendants keep their original relative nesting.
      const b = a.children[0] as HeadingDocumentNode;
      const c = b.children[0] as HeadingDocumentNode;
      expect(b.children.map((n) => n.id)).toEqual(['C']);
      expect(c.children.map((n) => n.id)).toEqual(['E']);
      const y = x.children[0] as HeadingDocumentNode;
      expect(y.children.map((n) => n.id)).toEqual(['Z']);
    });
  });

  describe('outdentNodes (Shift-Tab)', () => {
    test('moves content to be sibling of parent heading', () => {
      const { result } = renderTreeOperations();

      // p1 is child of h1, outdent should move it to root level after h1
      act(() => {
        result.current.outdentNodes(['p1']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      // Should have 3 children: h1, h2, h1b
      expect(newDoc.children.length).toBe(3);
      expect(newDoc.children[0].id).toBe('h1');
      expect(newDoc.children[1].id).toBe('h2');
      expect(newDoc.children[2].id).toBe('h1b');
    });

    test('moves list_item out of nested list', () => {
      const nestedListDoc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              createListItem('li1', '1.', 'First'),
              // Intentionally malformed: a LIST nested directly inside a LIST (the schema forbids
              // it, but Mammoth occasionally produces it). The cast feeds invalid data past the
              // now-tightened child types to exercise the outdent repair path.
              {
                id: 'nested-list',
                number: null,
                type: 'LIST',
                children: [createListItem('li2', 'a.', 'Nested item')],
              } as unknown as ListItemDocumentNode,
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(nestedListDoc);

      act(() => {
        result.current.outdentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list1 = newDoc.children[0] as ListDocumentNode;

      // li2 is hoisted into list1 and the (now-empty) malformed inner list is dropped.
      expect(list1.children.map((c) => c.id)).toEqual(['li1', 'li2']);
    });

    test('does nothing when outdenting list_item would place it outside any list', () => {
      const docWithTopLevelList: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
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
      const docWithListUnderHeading: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'h1',
            number: '1',
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'Title' },
            children: [
              {
                id: 'list1',
                number: null,
                type: 'LIST',
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
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: 'li1-content',
                    number: null,
                    type: 'CONTENT',
                    format: 'TEXT',
                    contents: { de: 'First' },
                    children: [],
                  },
                  {
                    id: 'nested',
                    number: null,
                    type: 'LIST',
                    children: [createListItem('li2', 'a.', 'Nested item')],
                  },
                ],
              },
              createListItem('li3', '2.', 'Third'),
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list1 = newDoc.children[0] as ListDocumentNode;

      // list1 now has [li1, li2, li3] in order
      expect(list1.children.map((c) => c.id)).toEqual(['li1', 'li2', 'li3']);

      // li1's nested list is gone (it became empty after li2 left)
      const li1 = list1.children[0] as ListItemDocumentNode;
      expect(li1.children.some((c) => c.type === 'LIST')).toBe(false);
    });

    test('keeps nested list when other items remain after outdent', () => {
      // list1[li1{nested[li2, li3]}] → shift-tab on li2 →
      // list1[li1{nested[li3]}, li2]
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: 'nested',
                    number: null,
                    type: 'LIST',
                    children: [createListItem('li2', 'a.', 'A'), createListItem('li3', 'b.', 'B')],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list1 = newDoc.children[0] as ListDocumentNode;
      expect(list1.children.map((c) => c.id)).toEqual(['li1', 'li2']);

      const li1 = list1.children[0] as ListItemDocumentNode;
      const nested = li1.children.find((c) => c.type === 'LIST') as ListDocumentNode;
      expect(nested).toBeDefined();
      expect(nested.children.map((c) => c.id)).toEqual(['li3']);
    });

    test('outdents from a doubly-nested list one level at a time', () => {
      // list1[li1{nested1[li2{nested2[li3]}]}] → shift-tab on li3 →
      // list1[li1{nested1[li2, li3]}]   (li3 moves up one level, into nested1)
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: 'nested1',
                    number: null,
                    type: 'LIST',
                    children: [
                      {
                        id: 'li2',
                        number: 'a.',
                        type: 'LIST_ITEM',
                        children: [
                          {
                            id: 'nested2',
                            number: null,
                            type: 'LIST',
                            children: [createListItem('li3', 'i.', 'Deepest')],
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
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li3']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list1 = newDoc.children[0] as ListDocumentNode;
      const li1 = list1.children[0] as ListItemDocumentNode;
      const nested1 = li1.children[0] as ListDocumentNode;

      // li3 sits next to li2 in nested1; nested2 is gone (it became empty).
      expect(nested1.children.map((c) => c.id)).toEqual(['li2', 'li3']);
      const li2 = nested1.children[0] as ListItemDocumentNode;
      expect(li2.children.some((c) => c.type === 'LIST')).toBe(false);
    });

    test('outdents two list_items from nested list, dropping empty list', () => {
      // list1[li1{nested[li2, li3]}] → shift-tab on [li2, li3] →
      // list1[li1, li2, li3]  (no nested list left)
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: 'nested',
                    number: null,
                    type: 'LIST',
                    children: [createListItem('li2', 'a.', 'A'), createListItem('li3', 'b.', 'B')],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li2', 'li3']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list1 = newDoc.children[0] as ListDocumentNode;
      expect(list1.children.map((c) => c.id)).toEqual(['li1', 'li2', 'li3']);

      const li1 = list1.children[0] as ListItemDocumentNode;
      expect(li1.children.some((c) => c.type === 'LIST')).toBe(false);
    });

    test('outdents multiple nested nodes', () => {
      // h1 has children p1 and h2. Outdent both → both become root-level siblings after h1
      const { result } = renderTreeOperations();

      act(() => {
        result.current.outdentNodes(['p1', 'h2']);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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

    test('does not scatter selected descendants when an ancestor is selected too (issue #108)', () => {
      // doc: HeadingA(HeadingB(HeadingC, HeadingD)). Selecting B together with
      // its children C and D and outdenting must lift B to be a sibling of A,
      // carrying C and D along unchanged — not scatter them or reverse order.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'A',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'HeadingA' },
            children: [
              {
                id: 'B',
                number: null,
                type: 'HEADING',
                format: 'TEXT',
                contents: { de: 'HeadingB' },
                children: [
                  {
                    id: 'C',
                    number: null,
                    type: 'HEADING',
                    format: 'TEXT',
                    contents: { de: 'HeadingC' },
                    children: [],
                  },
                  {
                    id: 'D',
                    number: null,
                    type: 'HEADING',
                    format: 'TEXT',
                    contents: { de: 'HeadingD' },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['B', 'C', 'D']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(isValidDocument(newDoc)).toBe(true);

      // B lifted to be a sibling of A, after it.
      expect(newDoc.children.map((c) => c.id)).toEqual(['A', 'B']);
      const a = newDoc.children[0] as HeadingDocumentNode;
      expect(a.children.length).toBe(0);

      // C and D remain direct children of B, in order.
      const b = newDoc.children[1] as HeadingDocumentNode;
      expect(b.children.map((c) => c.id)).toEqual(['C', 'D']);
    });

    test('skips a nested list_item when its enclosing list_item is selected too (issue #108)', () => {
      // outerLi > nested list > li1 > nested2 list > liA. Selecting li1 together
      // with its nested descendant liA and outdenting must lift li1 to be a
      // sibling of outerLi, carrying nested2/liA along — liA must not be
      // processed separately.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'outerLi',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  {
                    id: 'outerLi-content',
                    number: null,
                    type: 'CONTENT',
                    format: 'TEXT',
                    contents: { de: 'Outer' },
                    children: [],
                  } as ContentDocumentNode,
                  {
                    id: 'nested',
                    number: null,
                    type: 'LIST',
                    children: [
                      {
                        id: 'li1',
                        number: 'a.',
                        type: 'LIST_ITEM',
                        children: [
                          {
                            id: 'li1-content',
                            number: null,
                            type: 'CONTENT',
                            format: 'TEXT',
                            contents: { de: 'Inner' },
                            children: [],
                          } as ContentDocumentNode,
                          {
                            id: 'nested2',
                            number: null,
                            type: 'LIST',
                            children: [createListItem('liA', 'i.', 'Deepest')],
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
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['li1', 'liA']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(isValidDocument(newDoc)).toBe(true);

      // li1 popped out to be a sibling of outerLi in the outer list.
      const list1 = newDoc.children[0] as ListDocumentNode;
      expect(list1.children.map((c) => c.id)).toEqual(['outerLi', 'li1']);

      // li1 still carries its own nested2 list with liA unchanged.
      const li1 = list1.children[1] as ListItemDocumentNode;
      const nested2 = li1.children.find((c) => c.id === 'nested2') as ListDocumentNode;
      expect(nested2).toBeDefined();
      expect(nested2.children.map((c) => c.id)).toEqual(['liA']);
    });
  });

  describe('outdentNodes: lift node out of list_item (issue #101 #4)', () => {
    // Helper: a content child node literal.
    const content = (id: string, text: string): ContentDocumentNode => ({
      id,
      number: null,
      type: 'CONTENT',
      format: 'TEXT',
      contents: { de: text },
      children: [],
    });
    // Helper: a heading child node literal.
    const heading = (id: string, text: string): HeadingDocumentNode => ({
      id,
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: text },
      children: [],
    });

    test('lifts a heading out of the last list_item, placing it after the list (no split)', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              createListItem('li1', '1.', 'a'),
              {
                id: 'li2',
                number: '2.',
                type: 'LIST_ITEM',
                children: [content('li2-content', 'b'), heading('H', 'Stuck')],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      // No content follows the heading, so no trailing list is created.
      expect(newDoc.children.map((c) => c.id)).toEqual(['list1', 'H']);
      const list = newDoc.children[0] as ListDocumentNode;
      expect(list.children.map((c) => c.id)).toEqual(['li1', 'li2']);
      const li2 = list.children[1] as ListItemDocumentNode;
      // The surviving list_item keeps its id and number.
      expect((li2 as NumberedDocumentNode).number).toBe('2.');
      expect(li2.children.map((c) => c.id)).toEqual(['li2-content']);
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('lifts a heading out of a middle list_item, splitting the list around it', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [content('li1-content', 'a'), heading('H', 'Stuck')],
              },
              createListItem('li2', '2.', 'b'),
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.type)).toEqual(['LIST', 'HEADING', 'LIST']);
      expect(newDoc.children[1].id).toBe('H');
      const before = newDoc.children[0] as ListDocumentNode;
      expect(before.id).toBe('list1');
      expect(before.children.map((c) => c.id)).toEqual(['li1']);
      const li1 = before.children[0] as ListItemDocumentNode;
      expect(li1.children.map((c) => c.id)).toEqual(['li1-content']);
      const after = newDoc.children[2] as ListDocumentNode;
      expect(after.id).not.toBe('list1');
      expect(after.children.map((c) => c.id)).toEqual(['li2']);
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('drops an emptied middle list_item when its only child is lifted out', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              createListItem('li1', '1.', 'a'),
              {
                id: 'liH',
                number: null,
                type: 'LIST_ITEM',
                children: [heading('H', 'Stuck')],
              },
              createListItem('li2', '2.', 'b'),
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.type)).toEqual(['LIST', 'HEADING', 'LIST']);
      const before = newDoc.children[0] as ListDocumentNode;
      expect(before.children.map((c) => c.id)).toEqual(['li1']);
      const after = newDoc.children[2] as ListDocumentNode;
      expect(after.children.map((c) => c.id)).toEqual(['li2']);
      // The emptied list_item is gone entirely.
      expect(JSON.stringify(newDoc)).not.toContain('liH');
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('splits the list_item itself when the lifted node sits between content', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [content('c-a', 'a'), heading('H', 'Stuck'), content('c-c', 'c')],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.type)).toEqual(['LIST', 'HEADING', 'LIST']);

      const beforeItem = (newDoc.children[0] as ListDocumentNode)
        .children[0] as ListItemDocumentNode;
      expect(beforeItem.id).toBe('li1');
      expect((beforeItem as NumberedDocumentNode).number).toBe('1.');
      expect(beforeItem.children.map((c) => c.id)).toEqual(['c-a']);

      const afterItem = (newDoc.children[2] as ListDocumentNode)
        .children[0] as ListItemDocumentNode;
      // Tail fragment gets a fresh id and no number to avoid a duplicate label.
      expect(afterItem.id).not.toBe('li1');
      expect((afterItem as NumberedDocumentNode).number).toBeNull();
      expect(afterItem.children.map((c) => c.id)).toEqual(['c-c']);

      // No duplicate ids despite the split.
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('lifts a heading out of the first list_item, placing it before the list', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'liH',
                number: null,
                type: 'LIST_ITEM',
                children: [heading('H', 'Stuck')],
              },
              createListItem('li2', '2.', 'b'),
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['H', 'list1']);
      const after = newDoc.children[1] as ListDocumentNode;
      // No "before" list, so the surviving list reuses the original id.
      expect(after.id).toBe('list1');
      expect(after.children.map((c) => c.id)).toEqual(['li2']);
      // The surviving list_item keeps its original number.
      expect((after.children[0] as NumberedDocumentNode).number).toBe('2.');
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('replaces a single-item single-child list with just the lifted node', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'liH',
                number: null,
                type: 'LIST_ITEM',
                children: [heading('H', 'Stuck')],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['H']);
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('keeps document order when lifting from a list nested under a heading', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'T',
            number: '1',
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'Title' },
            children: [
              content('pre', 'pre'),
              {
                id: 'list1',
                number: null,
                type: 'LIST',
                children: [
                  createListItem('li1', '1.', 'x'),
                  {
                    id: 'liH',
                    number: null,
                    type: 'LIST_ITEM',
                    children: [heading('H', 'Stuck')],
                  },
                  createListItem('li2', '2.', 'y'),
                ],
              },
              content('post', 'post'),
            ],
          } as HeadingDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const t = newDoc.children[0] as HeadingDocumentNode;
      expect(t.children.map((c) => c.type)).toEqual([
        'CONTENT',
        'LIST',
        'HEADING',
        'LIST',
        'CONTENT',
      ]);
      expect(t.children[0].id).toBe('pre');
      expect((t.children[1] as ListDocumentNode).children.map((c) => c.id)).toEqual(['li1']);
      expect(t.children[2].id).toBe('H');
      expect((t.children[3] as ListDocumentNode).children.map((c) => c.id)).toEqual(['li2']);
      expect(t.children[4].id).toBe('post');
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('lifts a normal list item content out of the list', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [createListItem('li1', '1.', 'a'), createListItem('li2', '2.', 'b')],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['li1-content']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.type)).toEqual(['CONTENT', 'LIST']);
      expect(newDoc.children[0].id).toBe('li1-content');
      const after = newDoc.children[1] as ListDocumentNode;
      expect(after.id).toBe('list1');
      expect(after.children.map((c) => c.id)).toEqual(['li2']);
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('lifts a footnote trapped directly in a list_item out of the list', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  content('c1', 'a'),
                  {
                    id: 'fn',
                    number: 'i.',
                    type: 'FOOTNOTE',
                    format: 'TEXT',
                    contents: { de: 'note' },
                  } as FootnoteDocumentNode,
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['fn']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.type)).toEqual(['LIST', 'FOOTNOTE']);
      expect(newDoc.children[1].id).toBe('fn');
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('lifts multiple sibling nodes out of the same list_item, preserving order', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  content('c-a', 'a'),
                  heading('H1', 'H1'),
                  heading('H2', 'H2'),
                  content('c-b', 'b'),
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H1', 'H2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.type)).toEqual(['LIST', 'HEADING', 'HEADING', 'LIST']);
      expect(newDoc.children[1].id).toBe('H1');
      expect(newDoc.children[2].id).toBe('H2');
      const before = newDoc.children[0] as ListDocumentNode;
      expect((before.children[0] as ListItemDocumentNode).children.map((c) => c.id)).toEqual([
        'c-a',
      ]);
      const after = newDoc.children[3] as ListDocumentNode;
      expect((after.children[0] as ListItemDocumentNode).children.map((c) => c.id)).toEqual([
        'c-b',
      ]);
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('preserves the lifted node subtree (a heading with body content)', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'liH',
                number: null,
                type: 'LIST_ITEM',
                children: [
                  {
                    id: 'H',
                    number: '2',
                    type: 'HEADING',
                    format: 'TEXT',
                    contents: { de: 'Stuck' },
                    children: [content('body', 'body text')],
                  } as HeadingDocumentNode,
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['H']);
      const h = newDoc.children[0] as HeadingDocumentNode;
      // The lifted node keeps its number and its whole subtree.
      expect(h.number).toBe('2');
      expect(h.children.map((c) => c.id)).toEqual(['body']);
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('lifts two non-adjacent nodes out of the same list_item, preserving order', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [heading('H1', 'H1'), content('c-mid', 'mid'), heading('H2', 'H2')],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H1', 'H2']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      // Order H1, (list holding the middle content), H2 is preserved.
      expect(newDoc.children.map((c) => c.type)).toEqual(['HEADING', 'LIST', 'HEADING']);
      expect(newDoc.children[0].id).toBe('H1');
      expect(newDoc.children[2].id).toBe('H2');
      const midList = newDoc.children[1] as ListDocumentNode;
      expect((midList.children[0] as ListItemDocumentNode).children.map((c) => c.id)).toEqual([
        'c-mid',
      ]);
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('lifts a nested list out of a list_item as a sibling of the outer list', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'outer',
            number: null,
            type: 'LIST',
            children: [
              {
                id: 'li1',
                number: '1.',
                type: 'LIST_ITEM',
                children: [
                  content('c-x', 'x'),
                  {
                    id: 'inner',
                    number: null,
                    type: 'LIST',
                    children: [createListItem('lia', 'a.', 'nested')],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['inner']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      // The two lists are left adjacent and unmerged; order (x, then nested) holds.
      expect(newDoc.children.map((c) => c.id)).toEqual(['outer', 'inner']);
      const outer = newDoc.children[0] as ListDocumentNode;
      expect((outer.children[0] as ListItemDocumentNode).children.map((c) => c.id)).toEqual([
        'c-x',
      ]);
      const inner = newDoc.children[1] as ListDocumentNode;
      expect(inner.children.map((c) => c.id)).toEqual(['lia']);
      expect(isValidDocument(newDoc)).toBe(true);
    });

    test('does not lift when the list_item is not inside a list (malformed)', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          // Intentionally malformed: a LIST_ITEM directly under DOCUMENT (not inside a LIST). The
          // cast feeds invalid data past the tightened child types to assert outdent is a no-op.
          {
            id: 'orphan',
            number: null,
            type: 'LIST_ITEM',
            children: [heading('H', 'Stuck')],
          } as unknown as BlockDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.outdentNodes(['H']);
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('indentNodes footnote into content', () => {
    test('moves footnote under previous sibling content', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'fn1',
            number: 'i.',
            type: 'FOOTNOTE',
            format: 'TEXT',
            contents: { de: 'Footnote text' },
          } as FootnoteDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['fn1']);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

      // Footnote should now be child of content
      expect(newDoc.children.length).toBe(1);
      const p1 = newDoc.children[0] as ContentDocumentNode;
      expect(p1.children.length).toBe(1);
      expect(p1.children[0].id).toBe('fn1');
    });

    test('does nothing when previous sibling is not content or heading', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'fn1',
            number: 'i.',
            type: 'FOOTNOTE',
            format: 'TEXT',
            contents: { de: 'First footnote' },
          } as FootnoteDocumentNode,
          {
            id: 'fn2',
            number: 'ii.',
            type: 'FOOTNOTE',
            format: 'TEXT',
            contents: { de: 'Second footnote' },
          } as FootnoteDocumentNode,
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
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'h1',
            number: '1',
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          } as HeadingDocumentNode,
          {
            id: 'fn1',
            number: 'i.',
            type: 'FOOTNOTE',
            format: 'TEXT',
            contents: { de: 'Footnote text' },
          } as FootnoteDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.indentNodes(['fn1']);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

      // Footnote should now be child of heading
      expect(newDoc.children.length).toBe(1);
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(1);
      expect(h1.children[0].id).toBe('fn1');
    });
  });

  describe('outdentNodes footnote from content', () => {
    test('moves footnote to be sibling of parent content', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [
              {
                id: 'fn1',
                number: 'i.',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'Footnote text' },
              } as FootnoteDocumentNode,
            ],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['fn1']);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

      // Should have 2 children: p1, fn1
      expect(newDoc.children.length).toBe(2);
      expect(newDoc.children[0].id).toBe('p1');
      expect(newDoc.children[1].id).toBe('fn1');

      // p1 should now have empty children
      const p1 = newDoc.children[0] as ContentDocumentNode;
      expect(p1.children.length).toBe(0);
    });

    test('preserves other footnote siblings when outdenting', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [
              {
                id: 'fn1',
                number: 'i.',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'First footnote' },
              } as FootnoteDocumentNode,
              {
                id: 'fn2',
                number: 'ii.',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'Second footnote' },
              } as FootnoteDocumentNode,
            ],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.outdentNodes(['fn1']);
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

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
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Some text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'HEADING');
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as HeadingDocumentNode;

        expect(converted.type).toBe('HEADING');
        expect(converted.children).toEqual([]);
        expect(converted.contents.de).toBe('Some text');
      });

      test('preserves id, number, and contents', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: 'Art. 1',
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'German text', en: 'English text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'HEADING');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as HeadingDocumentNode;

        expect(converted.id).toBe('p1');
        expect(converted.number).toBe('Art. 1');
        expect(converted.contents.de).toBe('German text');
        expect(converted.contents.en).toBe('English text');
      });

      test('does nothing when already a heading', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'h1',
              number: null,
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Already heading' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'HEADING');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('heading -> content', () => {
      test('converts heading without children to content', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Heading text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'CONTENT');
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.type).toBe('CONTENT');
        expect(converted.id).toBe('h1');
        expect(converted.number).toBe('1');
        expect(converted.contents.de).toBe('Heading text');
        expect(converted.children).toEqual([]);
      });

      test('lifts children as siblings after converted node', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Heading' },
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'CONTENT',
                  format: 'TEXT',
                  contents: { de: 'Child 1' },
                  children: [],
                },
                {
                  id: 'p2',
                  number: null,
                  type: 'CONTENT',
                  format: 'TEXT',
                  contents: { de: 'Child 2' },
                  children: [],
                },
              ],
            },
            {
              id: 'h2',
              number: '2',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Second heading' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have 4 children: converted h1, p1, p2, h2
        expect(newDoc.children.length).toBe(4);
        expect(newDoc.children[0].id).toBe('h1');
        expect(newDoc.children[0].type).toBe('CONTENT');
        expect(newDoc.children[1].id).toBe('p1');
        expect(newDoc.children[2].id).toBe('p2');
        expect(newDoc.children[3].id).toBe('h2');
      });

      test('does nothing when already content', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Already content' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'CONTENT');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('content -> list', () => {
      test('wraps content in list with single list_item', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Item text' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have a list at root level
        expect(newDoc.children.length).toBe(1);
        const list = newDoc.children[0] as ListDocumentNode;
        expect(list.type).toBe('LIST');

        // List should contain one list_item with child content node
        expect(list.children.length).toBe(1);
        const item = list.children[0] as ListItemDocumentNode;
        expect(item.type).toBe('LIST_ITEM');
        // The original content node becomes a child with its id preserved
        const itemContent = item.children[0] as ContentDocumentNode;
        expect(itemContent.type).toBe('CONTENT');
        expect(itemContent.id).toBe('p1');
        expect(itemContent.contents.de).toBe('Item text');
      });

      test('sets correct number for numbered list', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Item' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;
        const item = list.children[0] as ListItemDocumentNode;
        expect((item as NumberedDocumentNode).number).toBe('1.');
      });

      test('sets correct number for lettered list', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Item' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;
        const item = list.children[0] as ListItemDocumentNode;
        expect((item as NumberedDocumentNode).number).toBe('a.');
      });

      test('sets null number for unordered list', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Item' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;
        const item = list.children[0] as ListItemDocumentNode;
        expect((item as NumberedDocumentNode).number).toBeNull();
      });
    });

    describe('heading -> list', () => {
      test('wraps heading in list, lifts children after list', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Heading' },
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'CONTENT',
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
          result.current.changeNodeTypes(['h1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have 2 children: the new list and the lifted p1
        expect(newDoc.children.length).toBe(2);

        const list = newDoc.children[0] as ListDocumentNode;
        expect(list.type).toBe('LIST');
        expect(list.children.length).toBe(1);

        const item = list.children[0] as ListItemDocumentNode;
        expect(item.type).toBe('LIST_ITEM');
        // The original heading content is now in the child content node
        const itemContent = item.children[0] as ContentDocumentNode;
        expect(itemContent.id).toBe('h1');

        // Lifted child
        expect(newDoc.children[1].id).toBe('p1');
      });
    });

    describe('list_item -> content', () => {
      test('replaces entire list when only item', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Only item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // List should be replaced with content node
        expect(newDoc.children.length).toBe(1);
        const converted = newDoc.children[0] as ContentDocumentNode;
        expect(converted.type).toBe('CONTENT');
        expect(converted.id).toBe('li1');
        expect(converted.contents.de).toBe('Only item');
      });

      test('extracts item and inserts after list when multiple items', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                createListItem('li1', '1.', 'First'),
                createListItem('li2', '2.', 'Second'),
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li2'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have list and extracted content
        expect(newDoc.children.length).toBe(2);

        // List should still exist with one item
        const list = newDoc.children[0] as ListDocumentNode;
        expect(list.type).toBe('LIST');
        expect(list.children.length).toBe(1);
        expect(list.children[0].id).toBe('li1');

        // Converted item should be after the list
        const converted = newDoc.children[1] as ContentDocumentNode;
        expect(converted.type).toBe('CONTENT');
        expect(converted.id).toBe('li2');
      });
    });

    describe('list_item -> heading', () => {
      test('replaces entire list when only item', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Only item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'HEADING');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        expect(newDoc.children.length).toBe(1);
        const converted = newDoc.children[0] as HeadingDocumentNode;
        expect(converted.type).toBe('HEADING');
        expect(converted.id).toBe('li1');
        expect(converted.children).toEqual([]);
      });

      test('extracts item and inserts after list when multiple items', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                createListItem('li1', '1.', 'First'),
                createListItem('li2', '2.', 'Second'),
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'HEADING');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        expect(newDoc.children.length).toBe(2);

        // Converted heading should be first (since li1 was first item)
        const converted = newDoc.children[0] as HeadingDocumentNode;
        expect(converted.type).toBe('HEADING');
        expect(converted.id).toBe('li1');

        // List with remaining item should follow
        const list = newDoc.children[1] as ListDocumentNode;
        expect(list.type).toBe('LIST');
        expect(list.children.length).toBe(1);
        expect(list.children[0].id).toBe('li2');
      });
    });

    describe('list_item style change (single item only)', () => {
      test('changes only selected item to numbered, leaves siblings unchanged', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
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
          result.current.changeNodeTypes(['li2'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;

        // Only li2 (index 1) should change
        expect((list.children[0] as NumberedDocumentNode).number).toBeNull();
        expect((list.children[1] as NumberedDocumentNode).number).toBe('2.');
        expect((list.children[2] as NumberedDocumentNode).number).toBeNull();
      });

      test('changes only selected item to lettered', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'A'), createListItem('li2', '2.', 'B')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'LIST', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;

        // Only li1 (index 0) should change
        expect((list.children[0] as NumberedDocumentNode).number).toBe('a.');
        expect((list.children[1] as NumberedDocumentNode).number).toBe('2.');
      });

      test('changes only selected item to unordered', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'A'), createListItem('li2', '2.', 'B')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'LIST', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;

        // Only li1 (index 0) should change
        expect((list.children[0] as NumberedDocumentNode).number).toBeNull();
        expect((list.children[1] as NumberedDocumentNode).number).toBe('2.');
      });
    });

    describe('list node style change', () => {
      test('list node + numbered: changes all children to 1., 2., 3.', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
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
          result.current.changeNodeTypes(['list1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;

        expect((list.children[0] as NumberedDocumentNode).number).toBe('1.');
        expect((list.children[1] as NumberedDocumentNode).number).toBe('2.');
        expect((list.children[2] as NumberedDocumentNode).number).toBe('3.');
      });

      test('list node + unordered: sets all children numbers to null', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'A'), createListItem('li2', '2.', 'B')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'LIST', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;

        expect((list.children[0] as NumberedDocumentNode).number).toBeNull();
        expect((list.children[1] as NumberedDocumentNode).number).toBeNull();
      });

      test('list node + lettered: changes all children to a., b., c.', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
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
          result.current.changeNodeTypes(['list1'], 'LIST', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;

        expect((list.children[0] as NumberedDocumentNode).number).toBe('a.');
        expect((list.children[1] as NumberedDocumentNode).number).toBe('b.');
        expect((list.children[2] as NumberedDocumentNode).number).toBe('c.');
      });

      test('list node + non-list target: does nothing', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'HEADING');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      test('cannot convert document root', () => {
        const { result } = renderTreeOperations();

        act(() => {
          result.current.changeNodeTypes(['root'], 'CONTENT');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('cannot convert list to footnote', () => {
        // list -> content is valid (issue #80: flattens with number preservation),
        // and list -> heading is a no-op (covered elsewhere). list -> footnote
        // remains unsupported because there's no meaningful semantics for it.
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'FOOTNOTE');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('adjacent list merging', () => {
      test('merges with preceding list when converting to list', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Convert me' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have merged into one list
        expect(newDoc.children.length).toBe(1);
        expect(newDoc.children[0].type).toBe('LIST');
        const mergedList = newDoc.children[0] as ListDocumentNode;
        expect(mergedList.children.length).toBe(2);
        expect(mergedList.children[0].id).toBe('li1');
        // The converted content's id is now in the child content node
        const newItem = mergedList.children[1] as ListItemDocumentNode;
        expect((newItem.children[0] as ContentDocumentNode).id).toBe('p1');
      });

      test('merges with following list when converting to list', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Convert me' },
              children: [],
            },
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have merged into one list
        expect(newDoc.children.length).toBe(1);
        expect(newDoc.children[0].type).toBe('LIST');
        const mergedList = newDoc.children[0] as ListDocumentNode;
        expect(mergedList.children.length).toBe(2);
        // The converted content's id is now in the child content node
        const newItem = mergedList.children[0] as ListItemDocumentNode;
        expect((newItem.children[0] as ContentDocumentNode).id).toBe('p1');
        expect(mergedList.children[1].id).toBe('li1');
      });

      test('merges with both surrounding lists when converting to list', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Convert me' },
              children: [],
            },
            {
              id: 'list2',
              number: null,
              type: 'LIST',
              children: [createListItem('li2', '1.', 'Item 2')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have merged all three into one list
        expect(newDoc.children.length).toBe(1);
        expect(newDoc.children[0].type).toBe('LIST');
        const mergedList = newDoc.children[0] as ListDocumentNode;
        expect(mergedList.children.length).toBe(3);
        expect(mergedList.children[0].id).toBe('li1');
        // The converted content's id is now in the child content node
        const newItem = mergedList.children[1] as ListItemDocumentNode;
        expect((newItem.children[0] as ContentDocumentNode).id).toBe('p1');
        expect(mergedList.children[2].id).toBe('li2');
      });

      test('does not merge lists separated by other nodes', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'h1',
              number: '1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Separator' },
              children: [],
            },
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Convert me' },
              children: [],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have 3 children: list1, heading, and new list
        expect(newDoc.children.length).toBe(3);
        expect(newDoc.children[0].type).toBe('LIST');
        expect(newDoc.children[1].type).toBe('HEADING');
        expect(newDoc.children[2].type).toBe('LIST');
      });
    });

    describe('content -> footnote', () => {
      test('converts content to footnote (leaf node without children)', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Note text' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'FOOTNOTE');
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as FootnoteDocumentNode;

        expect(converted.type).toBe('FOOTNOTE');
        expect(converted.id).toBe('p1');
        expect(converted.contents.de).toBe('Note text');
        // Footnote is a leaf node - should not have children property
        expect('children' in converted).toBe(false);
      });

      test('preserves id, number, and contents', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: 'i.',
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'German', en: 'English' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'FOOTNOTE');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as FootnoteDocumentNode;

        expect(converted.id).toBe('p1');
        expect(converted.number).toBe('i.');
        expect(converted.contents.de).toBe('German');
        expect(converted.contents.en).toBe('English');
      });

      test('lifts footnote children when converting content with footnotes', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Main text' },
              children: [
                {
                  id: 'fn1',
                  number: 'i.',
                  type: 'FOOTNOTE',
                  format: 'TEXT',
                  contents: { de: 'First footnote' },
                } as FootnoteDocumentNode,
                {
                  id: 'fn2',
                  number: 'ii.',
                  type: 'FOOTNOTE',
                  format: 'TEXT',
                  contents: { de: 'Second footnote' },
                } as FootnoteDocumentNode,
              ],
            } as ContentDocumentNode,
            {
              id: 'p2',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Next paragraph' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'FOOTNOTE');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have 4 children: converted p1, fn1, fn2, p2
        expect(newDoc.children.length).toBe(4);
        expect(newDoc.children[0].id).toBe('p1');
        expect(newDoc.children[0].type).toBe('FOOTNOTE');
        expect(newDoc.children[1].id).toBe('fn1');
        expect(newDoc.children[2].id).toBe('fn2');
        expect(newDoc.children[3].id).toBe('p2');
      });

      test('does nothing when already footnote', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'fn1',
              number: 'i.',
              type: 'FOOTNOTE',
              format: 'TEXT',
              contents: { de: 'Already a footnote' },
            } as FootnoteDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['fn1'], 'FOOTNOTE');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('heading -> footnote', () => {
      test('converts heading to footnote and lifts children', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Heading text' },
              children: [
                {
                  id: 'p1',
                  number: null,
                  type: 'CONTENT',
                  format: 'TEXT',
                  contents: { de: 'Child content' },
                  children: [],
                } as ContentDocumentNode,
                {
                  id: 'p2',
                  number: null,
                  type: 'CONTENT',
                  format: 'TEXT',
                  contents: { de: 'Another child' },
                  children: [],
                } as ContentDocumentNode,
              ],
            } as HeadingDocumentNode,
            {
              id: 'h2',
              number: '2',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Next heading' },
              children: [],
            } as HeadingDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'FOOTNOTE');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Should have 4 children: converted h1, p1, p2, h2
        expect(newDoc.children.length).toBe(4);
        expect(newDoc.children[0].id).toBe('h1');
        expect(newDoc.children[0].type).toBe('FOOTNOTE');
        expect('children' in newDoc.children[0]).toBe(false);
        expect(newDoc.children[1].id).toBe('p1');
        expect(newDoc.children[2].id).toBe('p2');
        expect(newDoc.children[3].id).toBe('h2');
      });

      test('converts heading without children to footnote', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Heading text' },
              children: [],
            } as HeadingDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['h1'], 'FOOTNOTE');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as FootnoteDocumentNode;

        expect(converted.type).toBe('FOOTNOTE');
        expect(converted.id).toBe('h1');
        expect(converted.number).toBe('1');
        expect(converted.contents.de).toBe('Heading text');
        expect('children' in converted).toBe(false);
      });
    });

    describe('footnote -> content', () => {
      test('converts footnote to content (adds empty children array)', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'fn1',
              number: 'i.',
              type: 'FOOTNOTE',
              format: 'TEXT',
              contents: { de: 'Footnote text' },
            } as FootnoteDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['fn1'], 'CONTENT');
        });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.type).toBe('CONTENT');
        expect(converted.id).toBe('fn1');
        expect(converted.number).toBe('i.');
        expect(converted.contents.de).toBe('Footnote text');
        expect(converted.children).toEqual([]);
      });

      test('preserves multi-language contents', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'fn1',
              number: null,
              type: 'FOOTNOTE',
              format: 'TEXT',
              contents: { de: 'German', en: 'English', fr: 'French' },
            } as FootnoteDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['fn1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.contents.de).toBe('German');
        expect(converted.contents.en).toBe('English');
        expect(converted.contents.fr).toBe('French');
      });
    });

    describe('footnote conversion edge cases', () => {
      test('cannot convert list to footnote', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'FOOTNOTE');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });

      test('cannot convert list_item to footnote', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'FOOTNOTE');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    // Issue #80: lossless number preservation between lists and content nodes.
    describe('list_item -> content (number preservation, issue #80)', () => {
      test('preserves list_item.number on the converted content node when it is the only item', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', 'Art. 5', 'Article body')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.type).toBe('CONTENT');
        expect(converted.number).toBe('Art. 5');
        expect(converted.contents.de).toBe('Article body');
      });

      test('handles a list_item with no content child (empty contents, default format)', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [],
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.type).toBe('CONTENT');
        expect(converted.id).toBe('li1');
        expect(converted.number).toBe('1.');
        expect(converted.contents).toEqual({});
        expect(converted.format).toBe('TEXT');
      });

      test('preserves the list_item content format when converting to content', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'CONTENT',
                      format: 'MARKDOWN',
                      contents: { de: '**bold**' },
                      children: [],
                    } as ContentDocumentNode,
                  ],
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.format).toBe('MARKDOWN');
        expect(converted.contents.de).toBe('**bold**');
      });

      test('preserves list_item.number when extracted from a multi-item list', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                createListItem('li1', '1.', 'First'),
                createListItem('li2', '2.', 'Second'),
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li2'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        // Remaining list_item is untouched
        const list = newDoc.children[0] as ListDocumentNode;
        expect((list.children[0] as NumberedDocumentNode).number).toBe('1.');

        // Extracted content carries its old list_item number
        const converted = newDoc.children[1] as ContentDocumentNode;
        expect(converted.type).toBe('CONTENT');
        expect(converted.number).toBe('2.');
      });
    });

    describe('list_item -> heading (number preservation, issue #80)', () => {
      test('preserves list_item.number on the converted heading node', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', 'Art. 7', 'Heading body')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['li1'], 'HEADING');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as HeadingDocumentNode;

        expect(converted.type).toBe('HEADING');
        expect(converted.number).toBe('Art. 7');
      });
    });

    describe('list -> content (issue #80)', () => {
      test('flattens all list_items into content nodes, preserving each number', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
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
          result.current.changeNodeTypes(['list1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        expect(newDoc.children.length).toBe(3);

        const c0 = newDoc.children[0] as ContentDocumentNode;
        const c1 = newDoc.children[1] as ContentDocumentNode;
        const c2 = newDoc.children[2] as ContentDocumentNode;

        expect(c0.type).toBe('CONTENT');
        expect(c0.number).toBe('1.');
        expect(c0.contents.de).toBe('A');
        expect(c1.type).toBe('CONTENT');
        expect(c1.number).toBe('2.');
        expect(c1.contents.de).toBe('B');
        expect(c2.type).toBe('CONTENT');
        expect(c2.number).toBe('3.');
        expect(c2.contents.de).toBe('C');
      });

      test('preserves null number for unnumbered items', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', null, 'A'), createListItem('li2', null, 'B')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        expect(newDoc.children.length).toBe(2);
        expect((newDoc.children[0] as ContentDocumentNode).number).toBeNull();
        expect((newDoc.children[1] as ContentDocumentNode).number).toBeNull();
      });

      test('flattens nested list recursively, preserving inner numbers', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'CONTENT',
                      format: 'TEXT',
                      contents: { de: 'Outer 1' },
                      children: [],
                    } as ContentDocumentNode,
                    {
                      id: 'sublist',
                      number: null,
                      type: 'LIST',
                      children: [
                        createListItem('lia', 'a.', 'Inner a'),
                        createListItem('lib', 'b.', 'Inner b'),
                      ],
                    },
                  ],
                },
                createListItem('li2', '2.', 'Outer 2'),
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

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
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: 'sublist',
                      number: null,
                      type: 'LIST',
                      children: [createListItem('lia', 'a.', 'Inner a')],
                    },
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'CONTENT',
                      format: 'TEXT',
                      contents: { de: 'Outer text' },
                      children: [],
                    } as ContentDocumentNode,
                  ],
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

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
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'CONTENT',
                      format: 'MARKDOWN',
                      contents: { de: '**bold**' },
                      children: [],
                    } as ContentDocumentNode,
                  ],
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.format).toBe('MARKDOWN');
        expect(converted.contents.de).toBe('**bold**');
      });

      test('lifts a list_item with multiple content children, attaching the number to the first', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: 'p1',
                      number: null,
                      type: 'CONTENT',
                      format: 'TEXT',
                      contents: { de: 'First paragraph' },
                      children: [],
                    } as ContentDocumentNode,
                    {
                      id: 'p2',
                      number: null,
                      type: 'CONTENT',
                      format: 'TEXT',
                      contents: { de: 'Second paragraph' },
                      children: [],
                    } as ContentDocumentNode,
                  ],
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

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
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [],
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

        expect(newDoc.children.length).toBe(1);
        const placeholder = newDoc.children[0] as ContentDocumentNode;
        expect(placeholder.type).toBe('CONTENT');
        expect(placeholder.id).toBe('li1');
        expect(placeholder.number).toBe('1.');
        expect(placeholder.contents).toEqual({});
        expect(placeholder.format).toBe('TEXT');
      });

      test('preserves footnote children of the list_item content', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: 'li1',
                  number: '1.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: 'li1-content',
                      number: null,
                      type: 'CONTENT',
                      format: 'TEXT',
                      contents: { de: 'Item with note' },
                      children: [
                        {
                          id: 'fn1',
                          number: 'i.',
                          type: 'FOOTNOTE',
                          format: 'TEXT',
                          contents: { de: 'Note text' },
                        } as FootnoteDocumentNode,
                      ],
                    } as ContentDocumentNode,
                  ],
                },
              ],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'CONTENT');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const converted = newDoc.children[0] as ContentDocumentNode;

        expect(converted.children.length).toBe(1);
        expect(converted.children[0].id).toBe('fn1');
        expect(converted.children[0].type).toBe('FOOTNOTE');
      });

      test('list -> heading is still a no-op', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item')],
            },
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['list1'], 'HEADING');
        });

        expect(mockCommit).not.toHaveBeenCalled();
      });
    });

    describe('content -> list (number preservation, issue #80)', () => {
      test('unordered preserves the content original number on the new list_item', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: 'Art. 5',
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;
        const item = list.children[0] as ListItemDocumentNode;

        expect((item as NumberedDocumentNode).number).toBe('Art. 5');
      });

      test('numbered overwrites the content number with the generated sequence', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: 'Art. 5',
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'numbered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;
        const item = list.children[0] as ListItemDocumentNode;

        expect((item as NumberedDocumentNode).number).toBe('1.');
      });

      test('lettered overwrites the content number with the generated sequence', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: 'Art. 5',
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'lettered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;
        const item = list.children[0] as ListItemDocumentNode;

        expect((item as NumberedDocumentNode).number).toBe('a.');
      });

      test('unordered with null content number stays null', () => {
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        const { result } = renderTreeOperations(doc);

        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'unordered');
        });

        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = newDoc.children[0] as ListDocumentNode;
        const item = list.children[0] as ListItemDocumentNode;

        expect((item as NumberedDocumentNode).number).toBeNull();
      });
    });

    describe('roundtrip content <-> unordered list (issue #80)', () => {
      test('content -> unordered list -> content preserves number', () => {
        const startDoc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: 'Art. 5',
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Body' },
              children: [],
            } as ContentDocumentNode,
          ],
        };

        // Step 1: content -> unordered list
        const { result } = renderTreeOperations(startDoc);
        act(() => {
          result.current.changeNodeTypes(['p1'], 'LIST', 'unordered');
        });
        const afterToList = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const list = afterToList.children[0] as ListDocumentNode;
        const listItem = list.children[0] as ListItemDocumentNode;
        expect((listItem as NumberedDocumentNode).number).toBe('Art. 5');

        // Step 2: list_item -> content (rebuild hook over the new doc)
        mockCommit.mockClear();
        const { result: result2 } = renderTreeOperations(afterToList);
        act(() => {
          result2.current.changeNodeTypes([listItem.id], 'CONTENT');
        });
        const afterRoundtrip = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const finalContent = afterRoundtrip.children[0] as ContentDocumentNode;

        expect(finalContent.type).toBe('CONTENT');
        expect(finalContent.number).toBe('Art. 5');
      });
    });
  });

  describe('changeNodeTypes (batch)', () => {
    test('changes type for multiple content nodes to heading', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'First' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p2',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'Second' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p3',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'Third' },
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.changeNodeTypes(['p1', 'p2', 'p3'], 'HEADING');
      });

      // Single commit for all three changes
      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children[0].type).toBe('HEADING');
      expect(newDoc.children[1].type).toBe('HEADING');
      expect(newDoc.children[2].type).toBe('HEADING');
    });

    test('handles mixed node types (content + heading -> footnote)', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'h1',
            number: '1',
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'Heading' },
            children: [],
          } as HeadingDocumentNode,
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'Paragraph' },
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.changeNodeTypes(['h1', 'p1'], 'FOOTNOTE');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children[0].type).toBe('FOOTNOTE');
      expect(newDoc.children[1].type).toBe('FOOTNOTE');
    });

    test('commits nothing when no nodes can be changed', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.changeNodeTypes(['root'], 'CONTENT');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('numbers a numbered-list batch sequentially (1., 2., 3.)', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'A' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p2',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'B' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p3',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'C' },
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.changeNodeTypes(['p1', 'p2', 'p3'], 'LIST', 'numbered');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

      expect(newDoc.children.length).toBe(1);
      const list = newDoc.children[0] as ListDocumentNode;
      expect(list.type).toBe('LIST');
      expect(list.children.length).toBe(3);
      expect((list.children[0] as NumberedDocumentNode).number).toBe('1.');
      expect((list.children[1] as NumberedDocumentNode).number).toBe('2.');
      expect((list.children[2] as NumberedDocumentNode).number).toBe('3.');
    });

    test('letters a lettered-list batch sequentially (a., b., c.)', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'A' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p2',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'B' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'p3',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'C' },
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.changeNodeTypes(['p1', 'p2', 'p3'], 'LIST', 'lettered');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

      const list = newDoc.children[0] as ListDocumentNode;
      expect(list.children.length).toBe(3);
      expect((list.children[0] as NumberedDocumentNode).number).toBe('a.');
      expect((list.children[1] as NumberedDocumentNode).number).toBe('b.');
      expect((list.children[2] as NumberedDocumentNode).number).toBe('c.');
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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

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
        const docWithList: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Para' },
              children: [],
            } as ContentDocumentNode,
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
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
        const docWithList: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'h1',
              number: '1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Title' },
              children: [],
            } as HeadingDocumentNode,
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
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
        const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
        const h1 = newDoc.children[0] as HeadingDocumentNode;
        const list = h1.children[0] as ListDocumentNode;
        expect(list.children[0].id).toBe('li3');
        expect(list.children[1].id).toBe('li1');
      });

      test('allows moving list_item to different list', () => {
        const docWithTwoLists: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'list2',
              number: null,
              type: 'LIST',
              children: [createListItem('li2', '1.', 'Item 2')],
            },
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
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'p1',
              number: null,
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Para' },
              children: [],
            } as ContentDocumentNode,
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
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
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'list2',
              number: null,
              type: 'LIST',
              children: [createListItem('li2', '1.', 'Item 2')],
            },
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
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'fn1',
              number: 'i.',
              type: 'FOOTNOTE',
              format: 'TEXT',
              contents: { de: 'Note' },
            } as FootnoteDocumentNode,
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
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
        const doc: DocumentRootNode = {
          id: 'root',
          type: 'DOCUMENT',
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('li1', '1.', 'Item 1')],
            },
            {
              id: 'list2',
              number: null,
              type: 'LIST',
              children: [createListItem('li2', '1.', 'Item 2')],
            },
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
      const docWithList: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'Para' },
            children: [],
          } as ContentDocumentNode,
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [createListItem('li1', '1.', 'Item 1')],
          },
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
      const docWithTwoLists: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [createListItem('li1', '1.', 'Item 1')],
          },
          {
            id: 'list2',
            number: null,
            type: 'LIST',
            children: [createListItem('li2', '1.', 'Item 2')],
          },
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
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const newNode = h1.children[1] as ContentDocumentNode;
      expect(newNode.type).toBe('CONTENT');
      expect(newNode.format).toBe('TEXT');
    });

    test('addNodeBefore creates a content node with default format TEXT', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.addNodeBefore('h2');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
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

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ListDocumentNode;
      const newItem = list.children[1] as ListItemDocumentNode;
      const inner = newItem.children[0] as ContentDocumentNode;
      expect(inner.format).toBe('TEXT');
    });
  });

  describe('changeNodeTypes — format preservation/reset', () => {
    test('preserves an allowed format when converting content → footnote (NEWLINES is allowed on both)', () => {
      const docWithMarkdown: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p',
            number: null,
            type: 'CONTENT',
            format: 'NEWLINES',
            contents: { de: 'preserved' },
            children: [],
          } as ContentDocumentNode,
        ],
      };
      const { result } = renderTreeOperations(docWithMarkdown);

      act(() => {
        result.current.changeNodeTypes(['p'], 'FOOTNOTE');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const f = newDoc.children[0] as FootnoteDocumentNode;
      expect(f.type).toBe('FOOTNOTE');
      expect(f.format).toBe('NEWLINES');
    });

    test('resets to TEXT when converting content (MARKDOWN) → heading (MARKDOWN not allowed)', () => {
      const docWithMarkdown: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'p',
            number: null,
            type: 'CONTENT',
            format: 'MARKDOWN',
            contents: { de: '**bold**' },
            children: [],
          } as ContentDocumentNode,
        ],
      };
      const { result } = renderTreeOperations(docWithMarkdown);

      act(() => {
        result.current.changeNodeTypes(['p'], 'HEADING');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h = newDoc.children[0] as HeadingDocumentNode;
      expect(h.type).toBe('HEADING');
      expect(h.format).toBe('TEXT');
      // contents preserved
      expect(h.contents.de).toBe('**bold**');
    });

    test('preserves NEWLINES when converting heading → content (still allowed)', () => {
      const docWithNewlines: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'h',
            number: '1',
            type: 'HEADING',
            format: 'NEWLINES',
            contents: { de: 'a\nb' },
            children: [],
          } as HeadingDocumentNode,
        ],
      };
      const { result } = renderTreeOperations(docWithNewlines);

      act(() => {
        result.current.changeNodeTypes(['h'], 'CONTENT');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const c = newDoc.children[0] as ContentDocumentNode;
      expect(c.type).toBe('CONTENT');
      expect(c.format).toBe('NEWLINES');
    });
  });

  describe('moveNodesToBoundary', () => {
    // Flat root with four siblings, used by reordering tests.
    const createFlatDocument = (): DocumentRootNode => ({
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'A',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'A' },
          children: [],
        } as ContentDocumentNode,
        {
          id: 'B',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'B' },
          children: [],
        } as ContentDocumentNode,
        {
          id: 'C',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'C' },
          children: [],
        } as ContentDocumentNode,
        {
          id: 'D',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'D' },
          children: [],
        } as ContentDocumentNode,
      ],
    });

    test('moves a single node to the top of its parent', () => {
      const doc = createFlatDocument();
      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.moveNodesToBoundary(['C'], 'top');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['C', 'A', 'B', 'D']);
    });

    test('moves a single node to the bottom of its parent', () => {
      const doc = createFlatDocument();
      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.moveNodesToBoundary(['A'], 'bottom');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['B', 'C', 'D', 'A']);
    });

    test('preserves relative order when moving multiple siblings to top', () => {
      const doc = createFlatDocument();
      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.moveNodesToBoundary(['B', 'C'], 'top');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['B', 'C', 'A', 'D']);
    });

    test('preserves relative order when moving multiple siblings to bottom', () => {
      const doc = createFlatDocument();
      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.moveNodesToBoundary(['B', 'C'], 'bottom');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['A', 'D', 'B', 'C']);
    });

    test('handles nodes in different parents independently with a single commit', () => {
      // Default test document: root > [h1 > [p1, h2 > [p2]], h1b]
      // Select p1 (child of h1) and h1b (child of root).
      // 'top': p1 should move to top of h1 (already there → no change for p1),
      //        h1b should move to top of root (before h1).
      const { result } = renderTreeOperations();

      act(() => {
        result.current.moveNodesToBoundary(['p1', 'h1b'], 'top');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['h1b', 'h1']);
      const h1 = newDoc.children[1] as HeadingDocumentNode;
      // p1 was already first inside h1; relative order untouched.
      expect(h1.children.map((c) => c.id)).toEqual(['p1', 'h2']);
    });

    test('does not commit when the selected node is already at the top', () => {
      const doc = createFlatDocument();
      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.moveNodesToBoundary(['A'], 'top');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does not commit when the selected node is already at the bottom', () => {
      const doc = createFlatDocument();
      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.moveNodesToBoundary(['D'], 'bottom');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does not commit for an empty id list', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.moveNodesToBoundary([], 'top');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('silently ignores ids not present in the index', () => {
      const doc = createFlatDocument();
      const { result } = renderTreeOperations(doc);

      act(() => {
        result.current.moveNodesToBoundary(['nonexistent', 'C'], 'top');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['C', 'A', 'B', 'D']);
    });

    test('reorders list_items within their list', () => {
      const doc = createDocumentWithList();
      const { result } = renderTreeOperations(doc);

      // List is [li1, li2, li3]; move li3 to top.
      act(() => {
        result.current.moveNodesToBoundary(['li3'], 'top');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const list = h1.children[0] as ListDocumentNode;
      expect(list.children.map((c) => c.id)).toEqual(['li3', 'li1', 'li2']);
    });

    test('handles a selection containing both an ancestor and its descendant', () => {
      // Default doc: root > [h1 > [p1, h2 > [p2]], h1b].
      // Select h1 (path [0]) and p2 (path [0, 1, 0]). Move both to top.
      // p2 should land at the top of h2 (already there → no actual change for p2),
      // and h1 should land at the top of root (already there → no actual change for h1).
      // So this is effectively a no-op when both are already at top — pick 'bottom' instead
      // to make the cross-depth move observable.
      const { result } = renderTreeOperations();

      act(() => {
        result.current.moveNodesToBoundary(['h1', 'p2'], 'bottom');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      // h1 moved to bottom of root.
      expect(newDoc.children.map((c) => c.id)).toEqual(['h1b', 'h1']);
      // p2 is the only child of h2, so it stays put — h1's subtree is unchanged.
      const h1 = newDoc.children[1] as HeadingDocumentNode;
      const h2 = h1.children[1] as HeadingDocumentNode;
      expect(h2.children.map((c) => c.id)).toEqual(['p2']);
    });

    test('mixed parents: commits once when only some parents need to change', () => {
      // Default doc: root > [h1 > [p1, h2], h1b].
      // Select p1 (already at top of h1) and h1b (at root, position 1 → moves to top).
      // Only the root-level reorder should produce a change, but a single commit fires.
      const { result } = renderTreeOperations();

      act(() => {
        result.current.moveNodesToBoundary(['p1', 'h1b'], 'top');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['h1b', 'h1']);
      // p1 is still the first child of h1 — no actual change inside h1.
      const h1 = newDoc.children[1] as HeadingDocumentNode;
      expect(h1.children[0].id).toBe('p1');
    });
  });

  describe('mergeNodes', () => {
    // Doc with two adjacent content nodes (p1, p1b) sharing parent h1, plus a heading sibling.
    const createMergeDoc = (): DocumentRootNode => ({
      id: 'root',
      type: 'DOCUMENT',
      children: [
        {
          id: 'h1',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Heading' },
          children: [
            {
              id: 'p1',
              number: 'a',
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'Hello' },
              children: [],
            },
            {
              id: 'p1b',
              number: 'b',
              type: 'CONTENT',
              format: 'TEXT',
              contents: { de: 'world' },
              children: [],
            },
            {
              id: 'h2',
              number: '1.1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Sub' },
              children: [],
            },
          ],
        },
      ],
    });

    test('does nothing when fewer than two ids are passed', () => {
      const { result } = renderTreeOperations(createMergeDoc());
      act(() => {
        result.current.mergeNodes(['p1']);
      });
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing when ids span different parents', () => {
      const { result } = renderTreeOperations();
      // p1 is under h1, h1b is at root level.
      act(() => {
        result.current.mergeNodes(['p1', 'h1b']);
      });
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing when selected siblings are non-contiguous', () => {
      // Build doc with three content siblings under h1 (p1, pmid, p1b) so we can pick non-adjacent ones.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'h1',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'H' },
            children: [
              {
                id: 'p1',
                number: null,
                type: 'CONTENT',
                format: 'TEXT',
                contents: { de: 'a' },
                children: [],
              },
              {
                id: 'pmid',
                number: null,
                type: 'CONTENT',
                format: 'TEXT',
                contents: { de: 'b' },
                children: [],
              },
              {
                id: 'p1b',
                number: null,
                type: 'CONTENT',
                format: 'TEXT',
                contents: { de: 'c' },
                children: [],
              },
            ],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['p1', 'p1b']);
      });
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing when ids have different node types', () => {
      const { result } = renderTreeOperations(createMergeDoc());
      // p1b (content) and h2 (heading) are adjacent siblings of different types.
      act(() => {
        result.current.mergeNodes(['p1b', 'h2']);
      });
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('does nothing for image nodes', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'img1',
            number: null,
            type: 'IMAGE',
            format: 'TEXT',
            contents: { de: 'a' },
          },
          {
            id: 'img2',
            number: null,
            type: 'IMAGE',
            format: 'TEXT',
            contents: { de: 'b' },
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['img1', 'img2']);
      });
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('merging two content nodes joins contents with newlines, keeps first id/number', () => {
      const { result } = renderTreeOperations(createMergeDoc());
      act(() => {
        result.current.mergeNodes(['p1', 'p1b']);
      });
      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      // p1b should be removed; p1 should now hold the joined content.
      expect(h1.children.map((c) => c.id)).toEqual(['p1', 'h2']);
      const merged = h1.children[0] as ContentDocumentNode;
      expect(merged.number).toBe('a');
      expect(merged.contents.de).toBe('Hello\nworld');
    });

    test('merging content nodes preserves per-language text — empty languages are skipped', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'pA',
            number: null,
            type: 'CONTENT',
            format: 'NEWLINES',
            contents: { de: 'D-A', en: 'E-A' },
            children: [],
          },
          {
            id: 'pB',
            number: null,
            type: 'CONTENT',
            format: 'NEWLINES',
            contents: { de: '', en: 'E-B', fr: 'F-B' },
            children: [],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['pA', 'pB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const merged = newDoc.children[0] as ContentDocumentNode;
      // de: pB is empty so result is just 'D-A' (no leading/trailing newline).
      expect(merged.contents.de).toBe('D-A');
      expect(merged.contents.en).toBe('E-A\nE-B');
      // fr only exists on pB.
      expect(merged.contents.fr).toBe('F-B');
    });

    test('merging TEXT+TEXT content nodes floors the result format to NEWLINES', () => {
      const { result } = renderTreeOperations(createMergeDoc());
      act(() => {
        result.current.mergeNodes(['p1', 'p1b']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const h1 = newDoc.children[0] as HeadingDocumentNode;
      const merged = h1.children[0] as ContentDocumentNode;
      expect(merged.format).toBe('NEWLINES');
    });

    test('merging NEWLINES+MARKDOWN content nodes uses MARKDOWN and joins with a blank line', () => {
      // A single `\n` renders as a space in markdown, so paragraph breaks need
      // `\n\n` — otherwise the merge would visually concatenate the prose.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'pA',
            number: null,
            type: 'CONTENT',
            format: 'NEWLINES',
            contents: { de: 'a' },
            children: [],
          },
          {
            id: 'pB',
            number: null,
            type: 'CONTENT',
            format: 'MARKDOWN',
            contents: { de: 'b' },
            children: [],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['pA', 'pB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const merged = newDoc.children[0] as ContentDocumentNode;
      expect(merged.format).toBe('MARKDOWN');
      expect(merged.contents.de).toBe('a\n\nb');
    });

    test('merging content nodes concatenates footnote children in source order', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'pA',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'A' },
            children: [
              {
                id: 'fnA1',
                number: 'i',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'fnA1' },
              },
            ],
          },
          {
            id: 'pB',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'B' },
            children: [
              {
                id: 'fnB1',
                number: 'ii',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'fnB1' },
              },
              {
                id: 'fnB2',
                number: 'iii',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'fnB2' },
              },
            ],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['pA', 'pB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const merged = newDoc.children[0] as ContentDocumentNode;
      expect(merged.children.map((c) => c.id)).toEqual(['fnA1', 'fnB1', 'fnB2']);
    });

    test('merging two heading nodes joins contents with a single space', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'hA',
            number: '1',
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'Foo' },
            children: [],
          },
          {
            id: 'hB',
            number: '2',
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'Bar' },
            children: [],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['hA', 'hB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const merged = newDoc.children[0] as HeadingDocumentNode;
      expect(merged.id).toBe('hA');
      expect(merged.number).toBe('1');
      expect(merged.contents.de).toBe('Foo Bar');
    });

    test('merging heading nodes does not promote format above its allowed set (TEXT stays TEXT)', () => {
      // Headings join with whitespace, so there's no need to floor to NEWLINES — TEXT must remain valid.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'hA',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'A' },
            children: [],
          },
          {
            id: 'hB',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'B' },
            children: [],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['hA', 'hB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const merged = newDoc.children[0] as HeadingDocumentNode;
      expect(merged.format).toBe('TEXT');
    });

    test('merging heading nodes appends children in source order', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'hA',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'A' },
            children: [
              {
                id: 'pA1',
                number: null,
                type: 'CONTENT',
                format: 'TEXT',
                contents: { de: 'aa' },
                children: [],
              },
            ],
          },
          {
            id: 'hB',
            number: null,
            type: 'HEADING',
            format: 'TEXT',
            contents: { de: 'B' },
            children: [
              {
                id: 'pB1',
                number: null,
                type: 'CONTENT',
                format: 'TEXT',
                contents: { de: 'bb' },
                children: [],
              },
            ],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['hA', 'hB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const merged = newDoc.children[0] as HeadingDocumentNode;
      expect(merged.children.map((c) => c.id)).toEqual(['pA1', 'pB1']);
    });

    test('merging two footnote nodes joins contents with newlines and floors format to NEWLINES', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'pHolder',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: '' },
            children: [
              {
                id: 'fnA',
                number: 'i',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'first' },
              },
              {
                id: 'fnB',
                number: 'ii',
                type: 'FOOTNOTE',
                format: 'TEXT',
                contents: { de: 'second' },
              },
            ],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['fnA', 'fnB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const holder = newDoc.children[0] as ContentDocumentNode;
      expect(holder.children.map((c) => c.id)).toEqual(['fnA']);
      const merged = holder.children[0] as FootnoteDocumentNode;
      expect(merged.contents.de).toBe('first\nsecond');
      expect(merged.format).toBe('NEWLINES');
    });

    test('merging two list_items concatenates their children', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              createListItem('liA', '1.', 'A'),
              createListItem('liB', '2.', 'B'),
              createListItem('liC', '3.', 'C'),
            ],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['liA', 'liB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list = newDoc.children[0] as ListDocumentNode;
      // liB removed; liA absorbed liB's child content.
      expect(list.children.map((c) => c.id)).toEqual(['liA', 'liC']);
      const merged = list.children[0] as ListItemDocumentNode;
      expect(merged.children.map((c) => c.id)).toEqual(['liA-content', 'liB-content']);
    });

    test('merging two lists concatenates list_item children', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'listA',
            number: null,
            type: 'LIST',
            children: [createListItem('liA1', '1.', 'A1')],
          },
          {
            id: 'listB',
            number: null,
            type: 'LIST',
            children: [createListItem('liB1', '1.', 'B1'), createListItem('liB2', '2.', 'B2')],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['listA', 'listB']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['listA']);
      const merged = newDoc.children[0] as ListDocumentNode;
      expect(merged.children.map((c) => c.id)).toEqual(['liA1', 'liB1', 'liB2']);
    });

    test('commits exactly once on success', () => {
      const { result } = renderTreeOperations(createMergeDoc());
      act(() => {
        result.current.mergeNodes(['p1', 'p1b']);
      });
      expect(mockCommit).toHaveBeenCalledTimes(1);
    });

    test('merges three contiguous content nodes in flat order', () => {
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'pA',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'A' },
            children: [],
          },
          {
            id: 'pB',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'B' },
            children: [],
          },
          {
            id: 'pC',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'C' },
            children: [],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      act(() => {
        result.current.mergeNodes(['pA', 'pB', 'pC']);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(newDoc.children.map((c) => c.id)).toEqual(['pA']);
      const merged = newDoc.children[0] as ContentDocumentNode;
      expect(merged.contents.de).toBe('A\nB\nC');
    });

    test('returns canMergeIds(true) for a valid 2-node selection and false otherwise', () => {
      const { result } = renderTreeOperations(createMergeDoc());
      expect(result.current.canMergeIds(['p1', 'p1b'])).toBe(true);
      // h2 is the sibling after p1b — same parent, but different type.
      expect(result.current.canMergeIds(['p1b', 'h2'])).toBe(false);
      // Single id — too few.
      expect(result.current.canMergeIds(['p1'])).toBe(false);
    });

    test('tolerates descendants in the selection: merges list_items even when their content children are also selected', () => {
      // Shift-click over list_items typically picks up nested content children too.
      // Those children shouldn't block the merge — they come along inside the merged container.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [
              createListItem('liA', '1.', 'A'),
              createListItem('liB', '2.', 'B'),
              createListItem('liC', '3.', 'C'),
            ],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      // Mirror a shift-click range over three list_items: rows are
      // [liA, liA-content, liB, liB-content, liC, liC-content].
      const selection = ['liA', 'liA-content', 'liB', 'liB-content', 'liC', 'liC-content'];
      expect(result.current.canMergeIds(selection)).toBe(true);
      act(() => {
        result.current.mergeNodes(selection);
      });
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const list = newDoc.children[0] as ListDocumentNode;
      // liB and liC are gone; liA absorbed their content children in order.
      expect(list.children.map((c) => c.id)).toEqual(['liA']);
      const merged = list.children[0] as ListItemDocumentNode;
      expect(merged.children.map((c) => c.id)).toEqual([
        'liA-content',
        'liB-content',
        'liC-content',
      ]);
    });

    test('rejects when the selection has no qualifying ancestors (only descendants of different parents)', () => {
      // Selecting only content children of two different list_items should still fail —
      // those children have different parents and aren't siblings to each other.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [createListItem('liA', '1.', 'A'), createListItem('liB', '2.', 'B')],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      expect(result.current.canMergeIds(['liA-content', 'liB-content'])).toBe(false);
    });

    test('rejects when ancestor and lone descendant collapse to a single id', () => {
      // {li, li-content} → filter drops li-content → only li remains → too few to merge.
      const doc: DocumentRootNode = {
        id: 'root',
        type: 'DOCUMENT',
        children: [
          {
            id: 'list1',
            number: null,
            type: 'LIST',
            children: [createListItem('li1', '1.', 'A')],
          },
        ],
      };
      const { result } = renderTreeOperations(doc);
      expect(result.current.canMergeIds(['li1', 'li1-content'])).toBe(false);
    });
  });

  describe('changeNodeContributionMode', () => {
    test('sets a mode across a multi-node selection in a single commit', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.changeNodeContributionMode(['p1', 'h1b'], 'REMARK');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const nIdx = buildIndices(newDoc).nodeIndex;
      expect(getNodeAtPath(newDoc, nIdx.get('p1')!)?.contributionMode).toBe('REMARK');
      expect(getNodeAtPath(newDoc, nIdx.get('h1b')!)?.contributionMode).toBe('REMARK');
    });

    test('skips nodes whose type cannot hold the mode', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      // PROPOSAL is valid on the heading but not on the list container.
      act(() => {
        result.current.changeNodeContributionMode(['h1', 'list1'], 'PROPOSAL');
      });

      const newDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      const nIdx = buildIndices(newDoc).nodeIndex;
      expect(getNodeAtPath(newDoc, nIdx.get('h1')!)?.contributionMode).toBe('PROPOSAL');
      expect(getNodeAtPath(newDoc, nIdx.get('list1')!)?.contributionMode).toBeUndefined();
    });

    test('clears the mode when passed undefined', () => {
      const { result } = renderTreeOperations();
      act(() => {
        result.current.changeNodeContributionMode(['p1'], 'NONE');
      });
      const setDoc = mockCommit.mock.calls[0][0] as DocumentRootNode;

      // Re-render the hook over the updated document, then clear.
      const idx2 = buildIndices(setDoc);
      const { result: result2 } = renderHook(() =>
        useTreeOperations({
          document: setDoc,
          commit: mockCommit,
          nodeIndex: idx2.nodeIndex,
          parentIndex: idx2.parentIndex,
          language: 'de',
        })
      );
      act(() => {
        result2.current.changeNodeContributionMode(['p1'], undefined);
      });

      const clearedDoc = mockCommit.mock.calls[1][0] as DocumentRootNode;
      const node = getNodeAtPath(clearedDoc, buildIndices(clearedDoc).nodeIndex.get('p1')!)!;
      expect(node.contributionMode).toBeUndefined();
    });

    test('does not commit when nothing changes (mode rejected by every node)', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        // PROPOSAL on a list container only → no valid change.
        result.current.changeNodeContributionMode(['list1'], 'PROPOSAL');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('changeSubtreeContributionMode', () => {
    const modeOf = (doc: DocumentRootNode, id: string) => {
      const idx = buildIndices(doc).nodeIndex;
      return getNodeAtPath(doc, idx.get(id)!)?.contributionMode;
    };

    test('applies recursively to a node and all its descendants in one commit', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.changeSubtreeContributionMode(['h1'], 'REMARK');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const doc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      for (const id of ['h1', 'p1', 'h2', 'p2']) {
        expect(modeOf(doc, id)).toBe('REMARK');
      }
    });

    test('dedupes ancestor+descendant selections (keepOutermostIds) into a single subtree apply', () => {
      const { result } = renderTreeOperations();

      act(() => {
        // p1 is inside h1; the h1 subtree already covers it.
        result.current.changeSubtreeContributionMode(['h1', 'p1'], 'NONE');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const doc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(modeOf(doc, 'h1')).toBe('NONE');
      expect(modeOf(doc, 'p1')).toBe('NONE');
      expect(modeOf(doc, 'p2')).toBe('NONE');
    });

    test('restricts to the given node type', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.changeSubtreeContributionMode(['h1'], 'REMARK', 'CONTENT');
      });

      const doc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(modeOf(doc, 'p1')).toBe('REMARK'); // content
      expect(modeOf(doc, 'p2')).toBe('REMARK'); // content
      expect(modeOf(doc, 'h1')).toBeUndefined(); // heading — filtered out
      expect(modeOf(doc, 'h2')).toBeUndefined();
    });
  });

  describe('changeDocumentContributionMode', () => {
    const modeOf = (doc: DocumentRootNode, id: string) => {
      const idx = buildIndices(doc).nodeIndex;
      return getNodeAtPath(doc, idx.get(id)!)?.contributionMode;
    };

    test('applies across the whole document (root included) in one commit', () => {
      const { result } = renderTreeOperations();

      act(() => {
        result.current.changeDocumentContributionMode('REMARK');
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      const doc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(doc.contributionMode).toBe('REMARK'); // root
      for (const id of ['h1', 'p1', 'h2', 'p2', 'h1b']) {
        expect(modeOf(doc, id)).toBe('REMARK');
      }
    });

    test('clamps per node — PROPOSAL skips lists and the document root', () => {
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.changeDocumentContributionMode('PROPOSAL');
      });

      const doc = mockCommit.mock.calls[0][0] as DocumentRootNode;
      expect(doc.contributionMode).toBeUndefined(); // DOCUMENT root
      expect(modeOf(doc, 'h1')).toBe('PROPOSAL'); // heading
      expect(modeOf(doc, 'li1-content')).toBe('PROPOSAL'); // content
      expect(modeOf(doc, 'list1')).toBeUndefined(); // list
      expect(modeOf(doc, 'li1')).toBeUndefined(); // list_item
    });

    test('does not commit when the mode applies to nothing', () => {
      // A document whose only nodes are a list + list_items + content; PROPOSAL filtered to LIST
      // matches the list but a list can't hold PROPOSAL → no change.
      const listDoc = createDocumentWithList();
      const { result } = renderTreeOperations(listDoc);

      act(() => {
        result.current.changeDocumentContributionMode('PROPOSAL', 'LIST');
      });

      expect(mockCommit).not.toHaveBeenCalled();
    });
  });
});

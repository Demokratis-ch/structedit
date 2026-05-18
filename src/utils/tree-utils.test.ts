import { describe, expect, test } from 'vitest';
import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  HeadingDocumentNode,
  LeafDocumentNode,
} from '../types/document';
import {
  buildIndices,
  changeNodeFormat,
  flattenForRendering,
  getNodeAtPath,
  insertNodeAtPath,
  mergeAdjacentLists,
  moveNode,
  removeNodeAtPath,
  updateNodeAtPath,
} from './tree-utils';

// Helper to create a list_item with child content node
const createListItem = (
  id: string,
  number: string | null,
  content: string
): ContainerDocumentNode => ({
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

// Helper to create test documents
const createTestDocument = (): ContainerDocumentNode => ({
  id: 'root',
  number: null,
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

describe('getNodeAtPath', () => {
  test('returns root for empty path', () => {
    const doc = createTestDocument();
    const result = getNodeAtPath(doc, []);
    expect(result).toBe(doc);
  });

  test('returns child at single index', () => {
    const doc = createTestDocument();
    const result = getNodeAtPath(doc, [0]);
    expect(result?.id).toBe('h1');
  });

  test('returns deeply nested node', () => {
    const doc = createTestDocument();
    const result = getNodeAtPath(doc, [0, 1, 0]);
    expect(result?.id).toBe('p2');
  });

  test('returns null for invalid path (index out of bounds)', () => {
    const doc = createTestDocument();
    const result = getNodeAtPath(doc, [5]);
    expect(result).toBeNull();
  });

  test('returns null for invalid path (accessing children of leaf)', () => {
    const doc = createTestDocument();
    const result = getNodeAtPath(doc, [0, 0, 0]); // p1 is a leaf
    expect(result).toBeNull();
  });
});

describe('updateNodeAtPath', () => {
  test('modifies node contents immutably', () => {
    const doc = createTestDocument();
    const newDoc = updateNodeAtPath(
      doc,
      [0, 0],
      (node) =>
        ({
          ...node,
          contents: { de: 'Updated paragraph' },
        }) as LeafDocumentNode
    );

    // Original unchanged
    const originalP1 = getNodeAtPath(doc, [0, 0]) as LeafDocumentNode;
    expect(originalP1.contents.de).toBe('First paragraph');

    // New document has update
    const updatedP1 = getNodeAtPath(newDoc, [0, 0]) as LeafDocumentNode;
    expect(updatedP1.contents.de).toBe('Updated paragraph');
  });

  test('preserves unmodified siblings', () => {
    const doc = createTestDocument();
    const newDoc = updateNodeAtPath(
      doc,
      [0, 0],
      (node) =>
        ({
          ...node,
          contents: { de: 'Updated' },
        }) as LeafDocumentNode
    );

    // Sibling h2 should be preserved
    const h2 = getNodeAtPath(newDoc, [0, 1]) as HeadingDocumentNode;
    expect(h2.id).toBe('h2');
    expect(h2.contents.de).toBe('Nested Heading');
  });

  test('works on deeply nested nodes', () => {
    const doc = createTestDocument();
    const newDoc = updateNodeAtPath(
      doc,
      [0, 1, 0],
      (node) =>
        ({
          ...node,
          contents: { de: 'Deep update' },
        }) as LeafDocumentNode
    );

    const updated = getNodeAtPath(newDoc, [0, 1, 0]) as LeafDocumentNode;
    expect(updated.contents.de).toBe('Deep update');
  });

  test('updates root when path is empty', () => {
    const doc = createTestDocument();
    const newDoc = updateNodeAtPath(doc, [], (node) => ({
      ...node,
      id: 'new-root',
    }));
    expect(newDoc.id).toBe('new-root');
  });
});

describe('insertNodeAtPath', () => {
  const newNode: ContentDocumentNode = {
    id: 'new',
    number: null,
    type: 'CONTENT',
    format: 'TEXT',
    contents: { de: 'New content' },
    children: [],
  };

  test('adds child at beginning', () => {
    const doc = createTestDocument();
    const newDoc = insertNodeAtPath(doc, [0], 0, newNode);

    const h1 = getNodeAtPath(newDoc, [0]) as HeadingDocumentNode;
    expect(h1.children[0].id).toBe('new');
    expect(h1.children[1].id).toBe('p1');
    expect(h1.children.length).toBe(3);
  });

  test('adds child in middle', () => {
    const doc = createTestDocument();
    const newDoc = insertNodeAtPath(doc, [0], 1, newNode);

    const h1 = getNodeAtPath(newDoc, [0]) as HeadingDocumentNode;
    expect(h1.children[0].id).toBe('p1');
    expect(h1.children[1].id).toBe('new');
    expect(h1.children[2].id).toBe('h2');
  });

  test('adds child at end', () => {
    const doc = createTestDocument();
    const newDoc = insertNodeAtPath(doc, [0], 2, newNode);

    const h1 = getNodeAtPath(newDoc, [0]) as HeadingDocumentNode;
    expect(h1.children[2].id).toBe('new');
    expect(h1.children.length).toBe(3);
  });

  test('inserts at root level', () => {
    const doc = createTestDocument();
    const newHeading: HeadingDocumentNode = {
      id: 'h1c',
      number: '3',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Third Heading' },
      children: [],
    };
    const newDoc = insertNodeAtPath(doc, [], 2, newHeading);

    expect(newDoc.children.length).toBe(3);
    expect(newDoc.children[2].id).toBe('h1c');
  });
});

describe('removeNodeAtPath', () => {
  test('removes leaf node', () => {
    const doc = createTestDocument();
    const newDoc = removeNodeAtPath(doc, [0, 0]); // Remove p1

    const h1 = getNodeAtPath(newDoc, [0]) as HeadingDocumentNode;
    expect(h1.children.length).toBe(1);
    expect(h1.children[0].id).toBe('h2');
  });

  test('removes node with children', () => {
    const doc = createTestDocument();
    const newDoc = removeNodeAtPath(doc, [0, 1]); // Remove h2 (has child p2)

    const h1 = getNodeAtPath(newDoc, [0]) as HeadingDocumentNode;
    expect(h1.children.length).toBe(1);
    expect(h1.children[0].id).toBe('p1');
  });

  test('throws for root removal', () => {
    const doc = createTestDocument();
    expect(() => removeNodeAtPath(doc, [])).toThrow();
  });

  test('removes from root level', () => {
    const doc = createTestDocument();
    const newDoc = removeNodeAtPath(doc, [1]); // Remove h1b

    expect(newDoc.children.length).toBe(1);
    expect(newDoc.children[0].id).toBe('h1');
  });
});

describe('moveNode', () => {
  test('moves node to new parent', () => {
    const doc = createTestDocument();
    // Move p1 from h1 to h1b
    const newDoc = moveNode(doc, [0, 0], [1], 0);

    // p1 should now be child of h1b
    const h1b = getNodeAtPath(newDoc, [1]) as HeadingDocumentNode;
    expect(h1b.children.length).toBe(1);
    expect(h1b.children[0].id).toBe('p1');

    // h1 should only have h2 now
    const h1 = getNodeAtPath(newDoc, [0]) as HeadingDocumentNode;
    expect(h1.children.length).toBe(1);
    expect(h1.children[0].id).toBe('h2');
  });

  test('adjusts index when moving within same parent (forward)', () => {
    const doc = createTestDocument();
    // Move p1 to after h2 within h1's children
    const newDoc = moveNode(doc, [0, 0], [0], 2);

    const h1 = getNodeAtPath(newDoc, [0]) as HeadingDocumentNode;
    expect(h1.children[0].id).toBe('h2');
    expect(h1.children[1].id).toBe('p1');
  });

  test('adjusts index when moving within same parent (backward)', () => {
    const doc = createTestDocument();
    // Move h2 to before p1 within h1's children
    const newDoc = moveNode(doc, [0, 1], [0], 0);

    const h1 = getNodeAtPath(newDoc, [0]) as HeadingDocumentNode;
    expect(h1.children[0].id).toBe('h2');
    expect(h1.children[1].id).toBe('p1');
  });
});

describe('buildIndices', () => {
  test('creates nodeIndex with correct paths', () => {
    const doc = createTestDocument();
    const { nodeIndex } = buildIndices(doc);

    expect(nodeIndex.get('root')).toEqual([]);
    expect(nodeIndex.get('h1')).toEqual([0]);
    expect(nodeIndex.get('p1')).toEqual([0, 0]);
    expect(nodeIndex.get('h2')).toEqual([0, 1]);
    expect(nodeIndex.get('p2')).toEqual([0, 1, 0]);
    expect(nodeIndex.get('h1b')).toEqual([1]);
  });

  test('creates parentIndex with correct parents', () => {
    const doc = createTestDocument();
    const { parentIndex } = buildIndices(doc);

    expect(parentIndex.get('root')).toBeUndefined();
    expect(parentIndex.get('h1')).toBe('root');
    expect(parentIndex.get('p1')).toBe('h1');
    expect(parentIndex.get('h2')).toBe('h1');
    expect(parentIndex.get('p2')).toBe('h2');
    expect(parentIndex.get('h1b')).toBe('root');
  });

  test('handles deeply nested structure', () => {
    const deepDoc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'h1',
          number: null,
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Level 1' },
          children: [
            {
              id: 'h2',
              number: null,
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Level 2' },
              children: [
                {
                  id: 'h3',
                  number: null,
                  type: 'HEADING',
                  format: 'TEXT',
                  contents: { de: 'Level 3' },
                  children: [
                    {
                      id: 'p',
                      number: null,
                      type: 'CONTENT',
                      format: 'TEXT',
                      contents: { de: 'Deep content' },
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const { nodeIndex, parentIndex } = buildIndices(deepDoc);

    expect(nodeIndex.get('p')).toEqual([0, 0, 0, 0]);
    expect(parentIndex.get('h3')).toBe('h2');
    expect(parentIndex.get('p')).toBe('h3');
  });
});

describe('flattenForRendering', () => {
  test('flattens tree to array', () => {
    const doc = createTestDocument();
    const flat = flattenForRendering(doc);

    // Should have 5 nodes (not counting root): h1, p1, h2, p2, h1b
    expect(flat.length).toBe(5);
    expect(flat.map((f) => f.node.id)).toEqual(['h1', 'p1', 'h2', 'p2', 'h1b']);
  });

  test('computes correct depth', () => {
    const doc = createTestDocument();
    const flat = flattenForRendering(doc);

    const depthById = Object.fromEntries(flat.map((f) => [f.node.id, f.depth]));
    expect(depthById.h1).toBe(0);
    expect(depthById.p1).toBe(1);
    expect(depthById.h2).toBe(1);
    expect(depthById.p2).toBe(2);
    expect(depthById.h1b).toBe(0);
  });

  test('computes isLastChild correctly', () => {
    const doc = createTestDocument();
    const flat = flattenForRendering(doc);

    const lastChildById = Object.fromEntries(flat.map((f) => [f.node.id, f.isLastChild]));
    expect(lastChildById.h1).toBe(false); // h1b comes after
    expect(lastChildById.p1).toBe(false); // h2 comes after
    expect(lastChildById.h2).toBe(true); // last child of h1
    expect(lastChildById.p2).toBe(true); // only child of h2
    expect(lastChildById.h1b).toBe(true); // last child of root
  });

  test('computes ancestorIsLastChild for connector lines', () => {
    const doc = createTestDocument();
    const flat = flattenForRendering(doc);

    // p2 is at depth 2 (under h2 which is under h1)
    const p2 = flat.find((f) => f.node.id === 'p2')!;
    // ancestorIsLastChild should tell us about ancestors from depth 0 upward
    // h1 (depth 0) is NOT last child (h1b follows)
    // h2 (depth 1) IS last child of h1
    expect(p2.ancestorIsLastChild).toEqual([false, true]);
  });

  test('includes parentId', () => {
    const doc = createTestDocument();
    const flat = flattenForRendering(doc);

    const parentById = Object.fromEntries(flat.map((f) => [f.node.id, f.parentId]));
    expect(parentById.h1).toBe('root');
    expect(parentById.p1).toBe('h1');
    expect(parentById.h2).toBe('h1');
    expect(parentById.p2).toBe('h2');
    expect(parentById.h1b).toBe('root');
  });

  test('includes list_item children in flattening', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [
            createListItem('item1', '1.', 'First item'),
            createListItem('item2', '2.', 'Second item'),
          ],
        } as ContainerDocumentNode,
      ],
    };

    const flat = flattenForRendering(doc);
    const ids = flat.map((f) => f.node.id);

    // Should include list, list_items, AND their child content nodes
    expect(ids).toEqual(['list1', 'item1', 'item1-content', 'item2', 'item2-content']);
  });
});

describe('mergeAdjacentLists', () => {
  test('merges two adjacent lists into one', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [createListItem('item1', '1.', 'Item 1')],
        },
        {
          id: 'list2',
          number: null,
          type: 'LIST',
          children: [createListItem('item2', '1.', 'Item 2')],
        },
      ],
    };

    const result = mergeAdjacentLists(doc, []);

    expect(result.children.length).toBe(1);
    expect(result.children[0].type).toBe('LIST');
    const mergedList = result.children[0] as ContainerDocumentNode;
    expect(mergedList.children.length).toBe(2);
    expect(mergedList.children[0].id).toBe('item1');
    expect(mergedList.children[1].id).toBe('item2');
  });

  test('merges three adjacent lists into one', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [createListItem('item1', null, 'A')],
        },
        {
          id: 'list2',
          number: null,
          type: 'LIST',
          children: [createListItem('item2', null, 'B')],
        },
        {
          id: 'list3',
          number: null,
          type: 'LIST',
          children: [createListItem('item3', null, 'C')],
        },
      ],
    };

    const result = mergeAdjacentLists(doc, []);

    expect(result.children.length).toBe(1);
    const mergedList = result.children[0] as ContainerDocumentNode;
    expect(mergedList.children.length).toBe(3);
  });

  test('does not merge non-adjacent lists', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [createListItem('item1', null, 'A')],
        },
        {
          id: 'content1',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'Separator' },
          children: [],
        },
        {
          id: 'list2',
          number: null,
          type: 'LIST',
          children: [createListItem('item2', null, 'B')],
        },
      ],
    };

    const result = mergeAdjacentLists(doc, []);

    expect(result.children.length).toBe(3);
  });

  test('returns unchanged document when no lists to merge', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'p1',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'A' },
          children: [],
        },
        {
          id: 'p2',
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: { de: 'B' },
          children: [],
        },
      ],
    };

    const result = mergeAdjacentLists(doc, []);

    expect(result).toBe(doc); // Same reference - no change needed
  });

  test('merges lists within nested container', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'heading1',
          number: '1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Heading' },
          children: [
            {
              id: 'list1',
              number: null,
              type: 'LIST',
              children: [createListItem('item1', null, 'A')],
            },
            {
              id: 'list2',
              number: null,
              type: 'LIST',
              children: [createListItem('item2', null, 'B')],
            },
          ],
        },
      ],
    };

    const result = mergeAdjacentLists(doc, [0]);

    const heading = result.children[0] as HeadingDocumentNode;
    expect(heading.children.length).toBe(1);
    const mergedList = heading.children[0] as ContainerDocumentNode;
    expect(mergedList.children.length).toBe(2);
  });

  test('preserves first list id when merging', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [createListItem('item1', null, 'A')],
        },
        {
          id: 'list2',
          number: null,
          type: 'LIST',
          children: [createListItem('item2', null, 'B')],
        },
      ],
    };

    const result = mergeAdjacentLists(doc, []);

    expect(result.children[0].id).toBe('list1');
  });
});

describe('nested lists', () => {
  // Helper to create a nested list inside a list_item
  const createListItemWithNestedList = (
    itemId: string,
    itemNumber: string | null,
    itemContent: string,
    nestedListId: string,
    nestedItems: { id: string; number: string | null; content: string }[]
  ): ContainerDocumentNode => ({
    id: itemId,
    number: itemNumber,
    type: 'LIST_ITEM',
    children: [
      {
        id: `${itemId}-content`,
        number: null,
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: itemContent },
        children: [],
      } as ContentDocumentNode,
      {
        id: nestedListId,
        number: null,
        type: 'LIST',
        children: nestedItems.map((ni) => createListItem(ni.id, ni.number, ni.content)),
      } as ContainerDocumentNode,
    ],
  });

  test('supports nested lists (list inside list_item)', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [
            createListItem('item1', '1.', 'First item'),
            createListItemWithNestedList(
              'item2',
              '2.',
              'Second item with nested list',
              'nested-list',
              [
                { id: 'nested1', number: 'a.', content: 'Nested item A' },
                { id: 'nested2', number: 'b.', content: 'Nested item B' },
              ]
            ),
            createListItem('item3', '3.', 'Third item'),
          ],
        } as ContainerDocumentNode,
      ],
    };

    // Structure should be valid
    const { nodeIndex, parentIndex } = buildIndices(doc);

    // All nodes should be indexed
    expect(nodeIndex.get('list1')).toEqual([0]);
    expect(nodeIndex.get('item1')).toEqual([0, 0]);
    expect(nodeIndex.get('item2')).toEqual([0, 1]);
    expect(nodeIndex.get('item2-content')).toEqual([0, 1, 0]);
    expect(nodeIndex.get('nested-list')).toEqual([0, 1, 1]);
    expect(nodeIndex.get('nested1')).toEqual([0, 1, 1, 0]);
    expect(nodeIndex.get('nested2')).toEqual([0, 1, 1, 1]);
    expect(nodeIndex.get('item3')).toEqual([0, 2]);

    // Parent relationships should be correct
    expect(parentIndex.get('nested-list')).toBe('item2');
    expect(parentIndex.get('nested1')).toBe('nested-list');
    expect(parentIndex.get('nested2')).toBe('nested-list');
  });

  test('flattens nested lists correctly', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [
            createListItem('item1', '1.', 'First'),
            createListItemWithNestedList('item2', '2.', 'Second', 'nested', [
              { id: 'sub1', number: 'a.', content: 'Sub A' },
            ]),
          ],
        } as ContainerDocumentNode,
      ],
    };

    const flat = flattenForRendering(doc);
    const ids = flat.map((f) => f.node.id);

    // Should include all nodes in depth-first order
    expect(ids).toEqual([
      'list1',
      'item1',
      'item1-content',
      'item2',
      'item2-content',
      'nested',
      'sub1',
      'sub1-content',
    ]);
  });

  test('computes correct depth for nested list items', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [
            createListItemWithNestedList('item1', '1.', 'First', 'nested', [
              { id: 'sub1', number: 'a.', content: 'Sub' },
            ]),
          ],
        } as ContainerDocumentNode,
      ],
    };

    const flat = flattenForRendering(doc);
    const depthById = Object.fromEntries(flat.map((f) => [f.node.id, f.depth]));

    expect(depthById.list1).toBe(0);
    expect(depthById.item1).toBe(1);
    expect(depthById['item1-content']).toBe(2);
    expect(depthById.nested).toBe(2);
    expect(depthById.sub1).toBe(3);
    expect(depthById['sub1-content']).toBe(4);
  });

  test('can access and update nested list items', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [
            createListItemWithNestedList('item1', '1.', 'First', 'nested', [
              { id: 'sub1', number: 'a.', content: 'Original' },
            ]),
          ],
        } as ContainerDocumentNode,
      ],
    };

    // Access nested list item's content
    const nestedContent = getNodeAtPath(doc, [0, 0, 1, 0, 0]) as LeafDocumentNode;
    expect(nestedContent.contents.de).toBe('Original');

    // Update nested content
    const updated = updateNodeAtPath(
      doc,
      [0, 0, 1, 0, 0],
      (node) =>
        ({
          ...node,
          contents: { de: 'Updated' },
        }) as LeafDocumentNode
    );

    const updatedContent = getNodeAtPath(updated, [0, 0, 1, 0, 0]) as LeafDocumentNode;
    expect(updatedContent.contents.de).toBe('Updated');
  });

  test('can remove nested list items', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [
            createListItemWithNestedList('item1', '1.', 'First', 'nested', [
              { id: 'sub1', number: 'a.', content: 'Sub A' },
              { id: 'sub2', number: 'b.', content: 'Sub B' },
            ]),
          ],
        } as ContainerDocumentNode,
      ],
    };

    // Remove first nested item
    const updated = removeNodeAtPath(doc, [0, 0, 1, 0]);

    const nestedList = getNodeAtPath(updated, [0, 0, 1]) as ContainerDocumentNode;
    expect(nestedList.children.length).toBe(1);
    expect(nestedList.children[0].id).toBe('sub2');
  });

  test('can insert items into nested list', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [
            createListItemWithNestedList('item1', '1.', 'First', 'nested', [
              { id: 'sub1', number: 'a.', content: 'Sub A' },
            ]),
          ],
        } as ContainerDocumentNode,
      ],
    };

    const newItem = createListItem('sub2', 'b.', 'Sub B');
    const updated = insertNodeAtPath(doc, [0, 0, 1], 1, newItem);

    const nestedList = getNodeAtPath(updated, [0, 0, 1]) as ContainerDocumentNode;
    expect(nestedList.children.length).toBe(2);
    expect(nestedList.children[1].id).toBe('sub2');
  });

  test('can move nested list item to parent list', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [
            createListItem('item1', '1.', 'First'),
            createListItemWithNestedList('item2', '2.', 'Second', 'nested', [
              { id: 'sub1', number: 'a.', content: 'Sub A' },
              { id: 'sub2', number: 'b.', content: 'Sub B' },
            ]),
          ],
        } as ContainerDocumentNode,
      ],
    };

    // Move sub1 from nested list to parent list (after item2)
    const updated = moveNode(doc, [0, 1, 1, 0], [0], 2);

    // sub1 should now be in parent list at index 2
    const parentList = getNodeAtPath(updated, [0]) as ContainerDocumentNode;
    expect(parentList.children.length).toBe(3);
    expect(parentList.children[2].id).toBe('sub1');

    // nested list should only have sub2 now
    const nestedList = getNodeAtPath(updated, [0, 1, 1]) as ContainerDocumentNode;
    expect(nestedList.children.length).toBe(1);
    expect(nestedList.children[0].id).toBe('sub2');
  });
});

describe('changeNodeFormat', () => {
  test('updates format on a content node', () => {
    const doc = createTestDocument();
    const updated = changeNodeFormat(doc, [0, 0], 'MARKDOWN');
    const node = getNodeAtPath(updated, [0, 0]) as ContentDocumentNode;
    expect(node.format).toBe('MARKDOWN');
  });

  test('leaves contents untouched', () => {
    const doc = createTestDocument();
    const before = getNodeAtPath(doc, [0, 0]) as ContentDocumentNode;
    const updated = changeNodeFormat(doc, [0, 0], 'MARKDOWN');
    const after = getNodeAtPath(updated, [0, 0]) as ContentDocumentNode;
    expect(after.contents).toEqual(before.contents);
  });

  test('returns a new tree (immutability)', () => {
    const doc = createTestDocument();
    const updated = changeNodeFormat(doc, [0, 0], 'MARKDOWN');
    expect(updated).not.toBe(doc);
  });

  test('updates format on a heading node', () => {
    const doc = createTestDocument();
    const updated = changeNodeFormat(doc, [0], 'MARKDOWN_MINIMAL');
    const heading = getNodeAtPath(updated, [0]) as HeadingDocumentNode;
    expect(heading.format).toBe('MARKDOWN_MINIMAL');
  });

  test('no-ops (returns same root) when target format is not allowed for the node type', () => {
    const doc = createTestDocument();
    // heading does not allow MARKDOWN
    const result = changeNodeFormat(doc, [0], 'MARKDOWN');
    expect(result).toBe(doc);
    const heading = getNodeAtPath(result, [0]) as HeadingDocumentNode;
    expect(heading.format).toBe('TEXT');
  });

  test('no-ops when content node asked for MARKDOWN_MINIMAL', () => {
    const doc = createTestDocument();
    const result = changeNodeFormat(doc, [0, 0], 'MARKDOWN_MINIMAL');
    expect(result).toBe(doc);
  });

  test('no-ops when target node is a container (no format)', () => {
    const doc: ContainerDocumentNode = {
      id: 'root',
      number: null,
      type: 'DOCUMENT',
      children: [
        {
          id: 'list1',
          number: null,
          type: 'LIST',
          children: [],
        },
      ],
    };
    const result = changeNodeFormat(doc, [0], 'TEXT');
    expect(result).toBe(doc);
  });

  test('no-ops when path does not exist', () => {
    const doc = createTestDocument();
    const result = changeNodeFormat(doc, [99], 'TEXT');
    expect(result).toBe(doc);
  });
});

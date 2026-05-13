import { useCallback } from 'react';
import type {
  ContainerDocumentNode,
  ContentBearingNodeType,
  ContentDocumentNode,
  DocumentNode,
  HeadingDocumentNode,
  Language,
  LeafDocumentNode,
  NodeFormat,
  ParentType,
} from '../types/document';
import { canBeChildOf, canHaveFormat, DEFAULT_FORMAT } from '../types/document';
import type { NodePath } from '../types/editor';
import { generateId } from '../utils/document-utils';
import {
  buildIndices,
  changeNodeFormat as changeNodeFormatInTree,
  getNodeAtPath,
  insertNodeAtPath,
  mergeAdjacentLists,
  moveNode,
  removeNodeAtPath,
  updateNodeAtPath,
} from '../utils/tree-utils';

/**
 * Decide which format the converted node should carry: keep the previous one if it's
 * still allowed for the new node type, otherwise fall back to the type's default.
 */
const carryFormatOrDefault = (
  previousFormat: NodeFormat | undefined,
  nextType: ContentBearingNodeType
): NodeFormat => {
  if (previousFormat && canHaveFormat(nextType, previousFormat)) {
    return previousFormat;
  }
  return DEFAULT_FORMAT[nextType];
};

export type MoveResult = { success: true } | { success: false; reason: string };

interface UseTreeOperationsProps {
  document: ContainerDocumentNode;
  commit: (doc: ContainerDocumentNode, saveHistory?: boolean) => void;
  nodeIndex: Map<string, NodePath>;
  parentIndex: Map<string, string>;
  language: Language;
}

/**
 * Flatten a list (and any nested lists inside its list_items) to a sequence of
 * content nodes. Each list_item becomes one content node carrying the
 * list_item's `number`; any nested list is flattened recursively and emitted
 * after that content node. Other list_item children (extra content nodes,
 * headings, leaves) are lifted in source order.
 */
function flattenListToContents(list: ContainerDocumentNode): DocumentNode[] {
  const out: DocumentNode[] = [];
  for (const item of list.children) {
    if (item.type !== 'list_item') continue;
    const listItem = item as ContainerDocumentNode;

    const flattenedChildren: DocumentNode[] = [];
    let numberAttached = false;

    for (const child of listItem.children) {
      if (child.type === 'list') {
        flattenedChildren.push(...flattenListToContents(child as ContainerDocumentNode));
      } else if (child.type === 'content' && !numberAttached) {
        // Promote the first content child: it carries the list_item's id/number.
        const c = child as ContentDocumentNode;
        flattenedChildren.push({
          id: listItem.id,
          number: listItem.number,
          type: 'content',
          format: c.format,
          contents: c.contents,
          children: c.children,
        });
        numberAttached = true;
      } else {
        flattenedChildren.push(child);
      }
    }

    if (!numberAttached) {
      // No content child to carry the list_item's id/number — synthesize a
      // placeholder so the label survives. Place it at the start so the
      // number appears where the list_item used to begin.
      flattenedChildren.unshift({
        id: listItem.id,
        number: listItem.number,
        type: 'content',
        format: 'TEXT',
        contents: {},
        children: [],
      });
    }

    out.push(...flattenedChildren);
  }
  return out;
}

/** Create a new empty sibling node appropriate for the given parent. */
function createNewSiblingNode(parent: DocumentNode, language: Language): DocumentNode {
  if (parent.type === 'list') {
    return {
      id: generateId(),
      number: null,
      type: 'list_item',
      children: [
        {
          id: generateId(),
          number: null,
          type: 'content',
          format: 'TEXT',
          contents: { [language]: '' },
          children: [],
        } as ContentDocumentNode,
      ],
    } as ContainerDocumentNode;
  }

  return {
    id: generateId(),
    number: null,
    type: 'content',
    format: 'TEXT',
    contents: { [language]: '' },
    children: [],
  } as ContentDocumentNode;
}

export const useTreeOperations = ({
  document,
  commit,
  nodeIndex,
  parentIndex,
  language,
}: UseTreeOperationsProps) => {
  /**
   * Add a new sibling node after the specified node.
   */
  const addNodeAfter = useCallback(
    (afterId: string) => {
      const path = nodeIndex.get(afterId);
      if (!path || path.length === 0) return;

      const parentPath = path.slice(0, -1);
      const siblingIndex = path[path.length - 1];
      const parent = parentPath.length === 0 ? document : getNodeAtPath(document, parentPath);

      if (!parent || !('children' in parent)) return;

      const newNode = createNewSiblingNode(parent, language);
      const newDoc = insertNodeAtPath(document, parentPath, siblingIndex + 1, newNode);
      commit(newDoc);

      return newNode.id;
    },
    [document, nodeIndex, language, commit]
  );

  /**
   * Add a new sibling node before the specified node.
   */
  const addNodeBefore = useCallback(
    (beforeId: string) => {
      const path = nodeIndex.get(beforeId);
      if (!path || path.length === 0) return;

      const parentPath = path.slice(0, -1);
      const siblingIndex = path[path.length - 1];
      const parent = parentPath.length === 0 ? document : getNodeAtPath(document, parentPath);

      if (!parent || !('children' in parent)) return;

      const newNode = createNewSiblingNode(parent, language);
      const newDoc = insertNodeAtPath(document, parentPath, siblingIndex, newNode);
      commit(newDoc);

      return newNode.id;
    },
    [document, nodeIndex, language, commit]
  );

  /**
   * Remove nodes and their subtrees.
   * Rebuilds indices between iterations so processing order doesn't matter.
   */
  const removeNodes = useCallback(
    (ids: string[]) => {
      let doc = document;
      let changed = false;

      // Process in reverse order to avoid index shifting issues
      const reversed = [...ids].reverse();

      for (const id of reversed) {
        const idx = changed ? buildIndices(doc).nodeIndex : nodeIndex;
        const path = idx.get(id);
        if (!path || path.length === 0) continue;

        doc = removeNodeAtPath(doc, path);
        changed = true;
      }

      if (changed) {
        commit(doc);
      }
    },
    [document, nodeIndex, commit]
  );

  /**
   * Update node contents (for editing).
   */
  const updateNodeContents = useCallback(
    (id: string, contents: string, saveHistory = true) => {
      const path = nodeIndex.get(id);
      if (!path) return;

      const node = getNodeAtPath(document, path);
      if (!node || !('contents' in node)) return;

      const newDoc = updateNodeAtPath(document, path, (n) => ({
        ...n,
        contents: {
          ...(n as LeafDocumentNode | HeadingDocumentNode).contents,
          [language]: contents,
        },
      }));
      commit(newDoc, saveHistory);
    },
    [document, nodeIndex, language, commit]
  );

  /**
   * Find the previous sibling that can accept the given node as a child.
   * - For footnotes: heading or content (both can have footnote children)
   * - For other nodes: heading only
   */
  const findPreviousSiblingTarget = (
    parent: DocumentNode,
    childIndex: number,
    nodeType: DocumentNode['type']
  ): { node: HeadingDocumentNode | ContentDocumentNode; index: number } | null => {
    if (!('children' in parent)) return null;

    for (let i = childIndex - 1; i >= 0; i--) {
      const sibling = parent.children[i];
      if (sibling.type === 'heading') {
        return { node: sibling as HeadingDocumentNode, index: i };
      }
      // Footnotes can also be nested under content nodes
      if (nodeType === 'footnote' && sibling.type === 'content') {
        return { node: sibling as ContentDocumentNode, index: i };
      }
    }
    return null;
  };

  /**
   * Indent a single node in a document (pure function, no commit).
   * Returns the new document, or null if the operation can't be performed.
   */
  const indentNodeInDoc = (
    doc: ContainerDocumentNode,
    idx: Map<string, NodePath>,
    id: string
  ): ContainerDocumentNode | null => {
    const path = idx.get(id);
    if (!path || path.length === 0) return null;

    const parentPath = path.slice(0, -1);
    const childIndex = path[path.length - 1];
    const parent = parentPath.length === 0 ? doc : getNodeAtPath(doc, parentPath);
    const node = getNodeAtPath(doc, path);

    if (!parent || !node || !('children' in parent)) return null;

    // Nest a list_item under its preceding sibling list_item. If that sibling
    // already ends with a nested list, append to it; otherwise create one.
    if (node.type === 'list_item') {
      if (parent.type !== 'list' || childIndex === 0) return null;
      const prevSibling = parent.children[childIndex - 1];
      if (prevSibling.type !== 'list_item') return null;
      const listItem = node as ContainerDocumentNode;

      const prevSiblingPath = [...parentPath, childIndex - 1];
      const prevChildren = (prevSibling as ContainerDocumentNode).children;
      const lastChild = prevChildren[prevChildren.length - 1];

      // Remove first; prevSibling's path and its own children are unaffected
      // because the removal touches the outer list, not prevSibling itself —
      // so prevChildren stays accurate for indexing into the nested list below.
      let newDoc = removeNodeAtPath(doc, path);

      if (lastChild && lastChild.type === 'list') {
        const nestedListPath = [...prevSiblingPath, prevChildren.length - 1];
        newDoc = updateNodeAtPath(newDoc, nestedListPath, (n) => ({
          ...n,
          children: [...(n as ContainerDocumentNode).children, listItem],
        }));
      } else {
        const newList: ContainerDocumentNode = {
          id: generateId(),
          number: null,
          type: 'list',
          children: [listItem],
        };
        newDoc = updateNodeAtPath(newDoc, prevSiblingPath, (n) => ({
          ...n,
          children: [...(n as ContainerDocumentNode).children, newList],
        }));
      }
      return newDoc;
    }

    // Find previous sibling that can accept this node as child
    const target = findPreviousSiblingTarget(parent, childIndex, node.type);
    if (!target) {
      return null;
    }

    // Remove node from current location
    let newDoc = removeNodeAtPath(doc, path);

    // The target path might have shifted if target was after the removed node
    // But since we're looking for previous siblings, target.index < childIndex
    // so the path is still valid
    const targetPath = [...parentPath, target.index];

    // Add node as last child of target (heading or content)
    newDoc = updateNodeAtPath(newDoc, targetPath, (targetNode) => ({
      ...targetNode,
      children: [...(targetNode as HeadingDocumentNode | ContentDocumentNode).children, node],
    }));

    return newDoc;
  };

  /**
   * Tab: Nest nodes deeper into the tree.
   * Processes multiple nodes, rebuilding indices between each operation.
   */
  const indentNodes = useCallback(
    (ids: string[]) => {
      let doc = document;
      let changed = false;

      for (const id of ids) {
        const idx = changed ? buildIndices(doc).nodeIndex : nodeIndex;
        const result = indentNodeInDoc(doc, idx, id);
        if (result) {
          doc = result;
          changed = true;
        }
      }

      if (changed) {
        commit(doc);
      }
    },
    [document, nodeIndex, commit]
  );

  /**
   * Outdent a single node in a document (pure function, no commit).
   * Returns the new document, or null if the operation can't be performed.
   */
  const outdentNodeInDoc = (
    doc: ContainerDocumentNode,
    idx: Map<string, NodePath>,
    id: string
  ): ContainerDocumentNode | null => {
    const path = idx.get(id);
    if (!path || path.length <= 1) {
      return null;
    }

    const parentPath = path.slice(0, -1);
    const parent = getNodeAtPath(doc, parentPath);
    const node = getNodeAtPath(doc, path);

    if (!parent || !node) return null;

    if (parent.type !== 'heading' && parent.type !== 'list' && parent.type !== 'content')
      return null;

    // Special case: if parent is list and node is list_item
    if (parent.type === 'list' && node.type === 'list_item') {
      const grandparentPath = parentPath.slice(0, -1);
      const parentIndexInGrandparent = parentPath[parentPath.length - 1];
      const grandparent = grandparentPath.length === 0 ? doc : getNodeAtPath(doc, grandparentPath);

      if (!grandparent || !('children' in grandparent)) return null;

      // Proper nested case: a list inside a list_item. Pop the list_item out
      // to be a sibling of the enclosing list_item in the outer list. If that
      // empties the nested list, drop it.
      if (grandparent.type === 'list_item') {
        const greatGrandparentPath = grandparentPath.slice(0, -1);
        const grandparentIdxInGGP = grandparentPath[grandparentPath.length - 1];
        const greatGrandparent =
          greatGrandparentPath.length === 0 ? doc : getNodeAtPath(doc, greatGrandparentPath);
        if (!greatGrandparent || greatGrandparent.type !== 'list') return null;

        let newDoc = removeNodeAtPath(doc, path);
        const parentAfter = getNodeAtPath(newDoc, parentPath);
        if (parentAfter && 'children' in parentAfter && parentAfter.children.length === 0) {
          newDoc = removeNodeAtPath(newDoc, parentPath);
        }
        newDoc = insertNodeAtPath(newDoc, greatGrandparentPath, grandparentIdxInGGP + 1, node);
        return newDoc;
      }

      // Fallback for malformed `list > list` structures (which the schema
      // forbids, but Mammoth occasionally produces). Insert as sibling of the
      // parent list inside its grandparent and drop the now-empty inner list
      // — repairing the structure as a side effect of the user's outdent.
      if (!canBeChildOf(node.type, grandparent.type as ParentType)) {
        return null;
      }

      let newDoc = removeNodeAtPath(doc, path);
      const parentAfter = getNodeAtPath(newDoc, parentPath);
      if (parentAfter && 'children' in parentAfter && parentAfter.children.length === 0) {
        newDoc = removeNodeAtPath(newDoc, parentPath);
      }
      newDoc = insertNodeAtPath(newDoc, grandparentPath, parentIndexInGrandparent + 1, node);
      return newDoc;
    }

    // Standard case: move node to be sibling of parent
    const grandparentPath = parentPath.slice(0, -1);
    const parentIndexInGrandparent = parentPath[parentPath.length - 1];

    let newDoc = removeNodeAtPath(doc, path);
    newDoc = insertNodeAtPath(newDoc, grandparentPath, parentIndexInGrandparent + 1, node);
    return newDoc;
  };

  /**
   * Shift-Tab: Unnest nodes to be siblings of their parents.
   * Processes multiple nodes, rebuilding indices between each operation.
   * Processes in reverse flat order to maintain correct indices.
   */
  const outdentNodes = useCallback(
    (ids: string[]) => {
      let doc = document;
      let changed = false;

      // Process in reverse order to avoid index shifting issues. This is also
      // load-bearing for outdenting multiple list_items out of a nested list:
      // the last one to leave drops the now-empty nested list, and an earlier
      // (forward) pass would invalidate the second item's path.
      const reversed = [...ids].reverse();

      for (const id of reversed) {
        const idx = changed ? buildIndices(doc).nodeIndex : nodeIndex;
        const result = outdentNodeInDoc(doc, idx, id);
        if (result) {
          doc = result;
          changed = true;
        }
      }

      if (changed) {
        commit(doc);
      }
    },
    [document, nodeIndex, commit]
  );

  /**
   * Change a content-bearing node's format. No-op when the node doesn't exist or the
   * target format isn't allowed for its type. Commits a single history entry on success.
   */
  const changeNodeFormat = useCallback(
    (id: string, format: NodeFormat) => {
      const path = nodeIndex.get(id);
      if (!path) return;

      const node = getNodeAtPath(document, path);
      if (!node) return;
      const contentBearing: ContentBearingNodeType[] = ['heading', 'content', 'footnote', 'image'];
      if (!contentBearing.includes(node.type as ContentBearingNodeType)) return;
      if (!canHaveFormat(node.type as ContentBearingNodeType, format)) return;

      const newDoc = changeNodeFormatInTree(document, path, format);
      commit(newDoc);
    },
    [document, nodeIndex, commit]
  );

  /**
   * Update node number/label.
   */
  const updateNodeNumber = useCallback(
    (id: string, number: string | null) => {
      const path = nodeIndex.get(id);
      if (!path) return;

      const newDoc = updateNodeAtPath(document, path, (n) => ({
        ...n,
        number,
      }));
      commit(newDoc);
    },
    [document, nodeIndex, commit]
  );

  /**
   * List numbering styles.
   */
  type ListStyle = 'unordered' | 'numbered' | 'lettered';

  /**
   * Get the number string for a list item based on style and index.
   */
  const getNumberForStyle = (style: ListStyle, index: number): string | null => {
    switch (style) {
      case 'unordered':
        return null;
      case 'numbered':
        return `${index + 1}.`;
      case 'lettered':
        return `${String.fromCharCode(97 + index)}.`;
    }
  };

  /**
   * Check if a node has contents (is leaf, heading, or content - not pure container).
   */
  const hasContents = (
    node: DocumentNode
  ): node is LeafDocumentNode | HeadingDocumentNode | ContentDocumentNode => {
    return 'contents' in node;
  };

  /**
   * Change the type of a single node in a document (pure function, no commit).
   * Returns the new document, or null if the operation can't be performed.
   */
  const changeNodeTypeInDoc = (
    doc: ContainerDocumentNode,
    idx: Map<string, NodePath>,
    id: string,
    targetType: 'heading' | 'content' | 'list' | 'footnote',
    listStyle?: ListStyle
  ): ContainerDocumentNode | null => {
    const path = idx.get(id);
    if (!path || path.length === 0) return null; // Can't change root

    const node = getNodeAtPath(doc, path);
    if (!node) return null;

    // Get parent info
    const parentPath = path.slice(0, -1);
    const nodeIdxInParent = path[path.length - 1];
    const parent = parentPath.length === 0 ? doc : getNodeAtPath(doc, parentPath);
    if (!parent || !('children' in parent)) return null;

    // Handle list_item specially - it requires extraction from list
    if (node.type === 'list_item') {
      if (targetType === 'list') {
        // Change only this item's number (not all siblings)
        const style = listStyle || 'numbered';
        const indexInParent = path[path.length - 1];
        return updateNodeAtPath(doc, path, (n) => ({
          ...n,
          number: getNumberForStyle(style, indexInParent),
        }));
      }
      if (targetType === 'footnote') {
        // list_item cannot be converted to footnote directly
        return null;
      }
      // Extract from list and convert
      return extractAndConvertListItemInDoc(doc, path, node as ContainerDocumentNode, targetType);
    }

    // Handle list node - can only change list style or flatten to content
    if (node.type === 'list') {
      if (targetType === 'list') {
        const style = listStyle || 'numbered';
        const listNode = node as ContainerDocumentNode;
        const newChildren = listNode.children.map((child, i) => ({
          ...child,
          number: getNumberForStyle(style, i),
        }));
        return updateNodeAtPath(doc, path, () => ({
          ...node,
          children: newChildren,
        }));
      }
      if (targetType === 'content') {
        // Hoist list_items as content nodes, preserving each number. Nested
        // lists are flattened recursively because content nodes can't host
        // arbitrary nesting.
        const flattened = flattenListToContents(node as ContainerDocumentNode);
        let newDoc = removeNodeAtPath(doc, path);
        for (let i = 0; i < flattened.length; i++) {
          newDoc = insertNodeAtPath(newDoc, parentPath, nodeIdxInParent + i, flattened[i]);
        }
        return newDoc;
      }
      return null;
    }

    // Can only convert nodes with contents
    if (!hasContents(node)) return null;

    // Handle conversion to footnote
    if (targetType === 'footnote') {
      if (node.type === 'footnote') return null; // Already a footnote

      const carryFormat = carryFormatOrDefault(
        (node as { format?: NodeFormat }).format,
        'footnote'
      );

      // Create footnote node (leaf - no children)
      const footnoteNode: LeafDocumentNode = {
        id: node.id,
        number: node.number,
        type: 'footnote',
        format: carryFormat,
        contents: node.contents,
      };

      // Replace node with footnote
      let newDoc = updateNodeAtPath(doc, path, () => footnoteNode);

      // If converting from heading or content with children, lift children as siblings
      if (node.type === 'heading') {
        const headingChildren = (node as HeadingDocumentNode).children;
        for (let i = 0; i < headingChildren.length; i++) {
          newDoc = insertNodeAtPath(
            newDoc,
            parentPath,
            nodeIdxInParent + 1 + i,
            headingChildren[i]
          );
        }
      } else if (node.type === 'content') {
        const contentChildren = (node as ContentDocumentNode).children;
        for (let i = 0; i < contentChildren.length; i++) {
          newDoc = insertNodeAtPath(
            newDoc,
            parentPath,
            nodeIdxInParent + 1 + i,
            contentChildren[i]
          );
        }
      }

      return newDoc;
    }

    // Handle conversion to heading
    if (targetType === 'heading') {
      if (node.type === 'heading') return null; // Already a heading

      const carryFormat = carryFormatOrDefault((node as { format?: NodeFormat }).format, 'heading');

      const newNode: HeadingDocumentNode = {
        id: node.id,
        number: node.number,
        type: 'heading',
        format: carryFormat,
        contents: node.contents,
        children: [],
      };

      return updateNodeAtPath(doc, path, () => newNode);
    }

    // Handle conversion to content
    if (targetType === 'content') {
      if (node.type === 'content') return null; // Already content

      const carryFormat = carryFormatOrDefault((node as { format?: NodeFormat }).format, 'content');

      const contentNode: ContentDocumentNode = {
        id: node.id,
        number: node.number,
        type: 'content',
        format: carryFormat,
        contents: node.contents,
        children: [],
      };

      let newDoc = updateNodeAtPath(doc, path, () => contentNode);

      // If converting from heading, lift children as siblings
      if (node.type === 'heading') {
        const headingChildren = (node as HeadingDocumentNode).children;
        for (let i = 0; i < headingChildren.length; i++) {
          newDoc = insertNodeAtPath(
            newDoc,
            parentPath,
            nodeIdxInParent + 1 + i,
            headingChildren[i]
          );
        }
      }
      // footnote -> content: no children to lift (footnote is a leaf node)

      return newDoc;
    }

    // Handle conversion to list
    if (targetType === 'list') {
      const style = listStyle || 'numbered';

      // For unordered lists we keep the source node's number on the new
      // list_item. Numbered/lettered styles deliberately renumber: picking
      // those styles is the user asking for a fresh sequence. The effective
      // index for that sequence accounts for items in immediately-preceding
      // adjacent lists, since mergeAdjacentLists below will fold those in —
      // this is what makes batch conversions yield 1., 2., 3. instead of
      // three '1.'s.
      let effectiveIndex = 0;
      for (let i = nodeIdxInParent - 1; i >= 0; i--) {
        const sibling = parent.children[i];
        if (sibling.type !== 'list') break;
        effectiveIndex += (sibling as ContainerDocumentNode).children.length;
      }
      const itemNumber =
        style === 'unordered' ? node.number : getNumberForStyle(style, effectiveIndex);

      const listItem: ContainerDocumentNode = {
        id: generateId(),
        number: itemNumber,
        type: 'list_item',
        children: [
          {
            id: node.id,
            number: null,
            type: 'content',
            format: 'TEXT',
            contents: node.contents,
            children: [],
          } as ContentDocumentNode,
        ],
      };

      const list: ContainerDocumentNode = {
        id: generateId(),
        number: null,
        type: 'list',
        children: [listItem],
      };

      let newDoc = updateNodeAtPath(doc, path, () => list);

      // If it was a heading, lift its children after the new list
      if (node.type === 'heading') {
        const headingChildren = (node as HeadingDocumentNode).children;
        for (let i = 0; i < headingChildren.length; i++) {
          newDoc = insertNodeAtPath(
            newDoc,
            parentPath,
            nodeIdxInParent + 1 + i,
            headingChildren[i]
          );
        }
      }

      // Merge adjacent lists in the parent
      newDoc = mergeAdjacentLists(newDoc, parentPath);

      return newDoc;
    }

    return null;
  };

  /**
   * Change the type of one or more nodes.
   * Processes all nodes sequentially with index rebuilding, committing once at the end.
   */
  const changeNodeTypes = useCallback(
    (
      ids: string[],
      targetType: 'heading' | 'content' | 'list' | 'footnote',
      listStyle?: ListStyle
    ) => {
      let doc = document;
      let changed = false;

      // Process in forward (flat) order — callers sort IDs before passing them in.
      // Unlike removeNodes/outdentNodes (which reverse), forward order is correct here
      // because type changes that alter structure (e.g., list merging) read naturally.
      for (const id of ids) {
        const idx = changed ? buildIndices(doc).nodeIndex : nodeIndex;
        const result = changeNodeTypeInDoc(doc, idx, id, targetType, listStyle);
        if (result) {
          doc = result;
          changed = true;
        }
      }

      if (changed) {
        commit(doc);
      }
    },
    [document, nodeIndex, commit]
  );

  /**
   * Extract a list_item from its list and convert to heading or content (pure function, no commit).
   * Returns the new document, or null if the operation can't be performed.
   */
  const extractAndConvertListItemInDoc = (
    doc: ContainerDocumentNode,
    itemPath: NodePath,
    item: ContainerDocumentNode,
    targetType: 'heading' | 'content'
  ): ContainerDocumentNode | null => {
    const listPath = itemPath.slice(0, -1);
    const itemIndexInList = itemPath[itemPath.length - 1];
    const list = getNodeAtPath(doc, listPath) as ContainerDocumentNode;

    if (!list || list.type !== 'list') return null;

    // Extract contents and format from the first child content node
    const firstChild = item.children[0];
    const contents = firstChild && 'contents' in firstChild ? firstChild.contents : {};
    const childFormat =
      firstChild && 'format' in firstChild
        ? (firstChild as { format: NodeFormat }).format
        : undefined;

    // Preserve the list_item's number on the new node so the visible label
    // ("1.", "Art. 5", etc.) survives the conversion. Carry the source format
    // when valid for the target so single-item conversions match the multi-item
    // (list -> content) flatten path.
    const convertedNode: DocumentNode =
      targetType === 'heading'
        ? ({
            id: item.id,
            number: item.number,
            type: 'heading',
            format: carryFormatOrDefault(childFormat, 'heading'),
            contents,
            children: [],
          } as HeadingDocumentNode)
        : ({
            id: item.id,
            number: item.number,
            type: 'content',
            format: carryFormatOrDefault(childFormat, 'content'),
            contents,
            children: [],
          } as ContentDocumentNode);

    // Get parent of list info
    const listParentPath = listPath.slice(0, -1);
    const listIndexInParent = listPath[listPath.length - 1];

    if (list.children.length === 1) {
      // Only item in list - replace entire list with converted node
      return updateNodeAtPath(doc, listPath, () => convertedNode);
    } else {
      // Multiple items - remove from list, insert converted node
      let newDoc = removeNodeAtPath(doc, itemPath);

      // If it was the first item, insert before the list; otherwise, insert after
      if (itemIndexInList === 0) {
        newDoc = insertNodeAtPath(newDoc, listParentPath, listIndexInParent, convertedNode);
      } else {
        newDoc = insertNodeAtPath(newDoc, listParentPath, listIndexInParent + 1, convertedNode);
      }

      return newDoc;
    }
  };

  /**
   * Move a node to a new position relative to a target node.
   * Used for drag & drop operations.
   *
   * Validates the move before committing - returns failure if the move
   * would violate parent-child rules.
   *
   * @param sourceId - ID of the node to move
   * @param targetId - ID of the node to drop on
   * @param position - 'top' to insert before target, 'bottom' to insert after target
   * @returns MoveResult indicating success or failure with reason
   */
  const moveNodeById = useCallback(
    (sourceId: string, targetId: string, position: 'top' | 'bottom'): MoveResult => {
      if (sourceId === targetId) {
        return { success: false, reason: 'Cannot move node to itself' };
      }

      const sourcePath = nodeIndex.get(sourceId);
      const targetPath = nodeIndex.get(targetId);

      if (!sourcePath || !targetPath) {
        return { success: false, reason: 'Source or target node not found' };
      }

      // Get the source node to check its type
      const sourceNode = getNodeAtPath(document, sourcePath);
      if (!sourceNode) {
        return { success: false, reason: 'Source node not found' };
      }

      // Calculate where to insert:
      // - 'top': insert at target's index in target's parent
      // - 'bottom': insert at target's index + 1 in target's parent
      const targetParentPath = targetPath.slice(0, -1);
      const targetIndexInParent = targetPath[targetPath.length - 1];
      const insertIndex = position === 'top' ? targetIndexInParent : targetIndexInParent + 1;

      // Determine the new parent
      const targetParent =
        targetParentPath.length === 0 ? document : getNodeAtPath(document, targetParentPath);

      if (!targetParent || !('children' in targetParent)) {
        return { success: false, reason: 'Invalid target parent' };
      }

      // Validate the parent-child relationship
      const parentType = targetParent.type as ParentType;
      if (!canBeChildOf(sourceNode.type, parentType)) {
        return {
          success: false,
          reason: `${sourceNode.type} cannot be child of ${parentType}`,
        };
      }

      const newDoc = moveNode(document, sourcePath, targetParentPath, insertIndex);
      commit(newDoc);

      return { success: true };
    },
    [document, nodeIndex, commit]
  );

  /**
   * Get the ID of the node that would become the parent if sourceId were dropped
   * on targetId. Returns null if the move would be invalid.
   */
  const getReceivingParentId = useCallback(
    (sourceId: string, targetId: string): string | null => {
      if (sourceId === targetId) return null;

      const sourcePath = nodeIndex.get(sourceId);
      const targetPath = nodeIndex.get(targetId);
      if (!sourcePath || !targetPath) return null;

      const sourceNode = getNodeAtPath(document, sourcePath);
      if (!sourceNode) return null;

      // Get target's parent (the receiving node)
      const parentPath = targetPath.slice(0, -1);
      const parentNode = parentPath.length === 0 ? document : getNodeAtPath(document, parentPath);

      if (!parentNode || !('children' in parentNode)) return null;

      // Validate the parent-child relationship
      const parentType = parentNode.type as ParentType;
      if (!canBeChildOf(sourceNode.type, parentType)) return null;

      return parentNode.id;
    },
    [document, nodeIndex]
  );

  return {
    addNodeAfter,
    addNodeBefore,
    removeNodes,
    updateNodeContents,
    updateNodeNumber,
    indentNodes,
    outdentNodes,
    changeNodeTypes,
    changeNodeFormat,
    moveNodeById,
    getReceivingParentId,
    nodeIndex,
    parentIndex,
  };
};

import { useCallback } from 'react';
import type { ContainerDocumentNode, HeadingDocumentNode, LeafDocumentNode, ContentDocumentNode, DocumentNode, Language, ParentType } from '../types/document';
import { canBeChildOf } from '../types/document';
import type { NodePath } from '../types/editor';
import { getNodeAtPath, updateNodeAtPath, insertNodeAtPath, removeNodeAtPath, mergeAdjacentLists, moveNode } from '../utils/tree-utils';
import { generateId } from '../utils/document-utils';

export type MoveResult = { success: true } | { success: false; reason: string };

interface UseTreeOperationsProps {
  document: ContainerDocumentNode;
  commit: (doc: ContainerDocumentNode, saveHistory?: boolean) => void;
  nodeIndex: Map<string, NodePath>;
  parentIndex: Map<string, string>;
  language: Language;
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
  const addNodeAfter = useCallback((afterId: string) => {
    const path = nodeIndex.get(afterId);
    if (!path || path.length === 0) return;

    const parentPath = path.slice(0, -1);
    const siblingIndex = path[path.length - 1];
    const parentId = parentIndex.get(afterId);
    const parent = parentPath.length === 0 ? document : getNodeAtPath(document, parentPath);

    if (!parent || !('children' in parent)) return;

    // Determine new node type based on parent context
    let newNode: DocumentNode;

    if (parent.type === 'list') {
      // Inside a list, create a list_item (container with child content node)
      newNode = {
        id: generateId(),
        number: null,
        type: 'list_item',
        children: [
          {
            id: generateId(),
            number: null,
            type: 'content',
            contents: { [language]: '' },
            children: [],
          } as ContentDocumentNode,
        ],
      } as ContainerDocumentNode;
    } else {
      // Default to content node
      newNode = {
        id: generateId(),
        number: null,
        type: 'content',
        contents: { [language]: '' },
        children: [],
      } as ContentDocumentNode;
    }

    const newDoc = insertNodeAtPath(document, parentPath, siblingIndex + 1, newNode);
    commit(newDoc);

    return newNode.id;
  }, [document, nodeIndex, parentIndex, language, commit]);

  /**
   * Remove a node and its subtree.
   */
  const removeNode = useCallback((id: string) => {
    const path = nodeIndex.get(id);
    if (!path || path.length === 0) return; // Can't remove root

    const newDoc = removeNodeAtPath(document, path);
    commit(newDoc);
  }, [document, nodeIndex, commit]);

  /**
   * Update node contents (for editing).
   */
  const updateNodeContents = useCallback((id: string, contents: string, saveHistory = true) => {
    const path = nodeIndex.get(id);
    if (!path) return;

    const node = getNodeAtPath(document, path);
    if (!node || !('contents' in node)) return;

    const newDoc = updateNodeAtPath(document, path, (n) => ({
      ...n,
      contents: { ...(n as LeafDocumentNode | HeadingDocumentNode).contents, [language]: contents },
    }));
    commit(newDoc, saveHistory);
  }, [document, nodeIndex, language, commit]);

  /**
   * Find the previous sibling that can accept children (heading).
   */
  const findPreviousSiblingHeading = (
    parent: DocumentNode,
    childIndex: number
  ): { node: HeadingDocumentNode; index: number } | null => {
    if (!('children' in parent)) return null;

    for (let i = childIndex - 1; i >= 0; i--) {
      const sibling = parent.children[i];
      if (sibling.type === 'heading') {
        return { node: sibling as HeadingDocumentNode, index: i };
      }
    }
    return null;
  };

  /**
   * Tab: Nest node deeper into the tree.
   * For content/heading: move to become last child of previous sibling heading.
   * For list_item: more complex handling (create nested list).
   */
  const indentNode = useCallback((id: string) => {
    const path = nodeIndex.get(id);
    if (!path || path.length === 0) return;

    const parentPath = path.slice(0, -1);
    const childIndex = path[path.length - 1];
    const parent = parentPath.length === 0 ? document : getNodeAtPath(document, parentPath);
    const node = getNodeAtPath(document, path);

    if (!parent || !node || !('children' in parent)) return;

    // Special case: list items - for now, skip this complex case
    if (node.type === 'list_item') {
      // TODO: Implement nested list handling
      // This would require converting a list_item to have a nested list
      return;
    }

    // Find previous sibling heading
    const target = findPreviousSiblingHeading(parent, childIndex);
    if (!target) {
      // No previous heading to nest under
      return;
    }

    // Remove node from current location
    let newDoc = removeNodeAtPath(document, path);

    // The target path might have shifted if target was after the removed node
    // But since we're looking for previous siblings, target.index < childIndex
    // so the path is still valid
    const targetPath = [...parentPath, target.index];
    const targetNode = getNodeAtPath(newDoc, targetPath) as HeadingDocumentNode;

    // Add node as last child of target heading
    newDoc = updateNodeAtPath(newDoc, targetPath, (heading) => ({
      ...heading,
      children: [...(heading as HeadingDocumentNode).children, node],
    }));

    commit(newDoc);
  }, [document, nodeIndex, commit]);

  /**
   * Shift-Tab: Unnest node to be a sibling of parent.
   */
  const outdentNode = useCallback((id: string) => {
    const path = nodeIndex.get(id);
    if (!path || path.length <= 1) {
      // Can't outdent if at document level (path length 1 means direct child of root)
      return;
    }

    const parentPath = path.slice(0, -1);
    const childIndex = path[path.length - 1];
    const parent = getNodeAtPath(document, parentPath);
    const node = getNodeAtPath(document, path);

    if (!parent || !node) return;

    // Parent must be a heading or list to outdent from
    if (parent.type !== 'heading' && parent.type !== 'list') return;

    // Special case: if parent is list and node is list_item in a nested list
    if (parent.type === 'list' && node.type === 'list_item') {
      // Need to find grandparent list and insert there
      const grandparentPath = parentPath.slice(0, -1);
      const parentIndex = parentPath[parentPath.length - 1];
      const grandparent = grandparentPath.length === 0
        ? document
        : getNodeAtPath(document, grandparentPath);

      if (grandparent && 'children' in grandparent && grandparent.type === 'list') {
        // Remove from nested list
        let newDoc = removeNodeAtPath(document, path);

        // Insert into grandparent list after the nested list
        newDoc = insertNodeAtPath(newDoc, grandparentPath, parentIndex + 1, node);
        commit(newDoc);
        return;
      }
    }

    // Standard case: move node to be sibling of parent
    const grandparentPath = parentPath.slice(0, -1);
    const parentIndexInGrandparent = parentPath[parentPath.length - 1];

    // Remove node from parent
    let newDoc = removeNodeAtPath(document, path);

    // Insert as sibling after parent in grandparent
    newDoc = insertNodeAtPath(newDoc, grandparentPath, parentIndexInGrandparent + 1, node);

    commit(newDoc);
  }, [document, nodeIndex, commit]);

  /**
   * Update node number/label.
   */
  const updateNodeNumber = useCallback((id: string, number: string | null) => {
    const path = nodeIndex.get(id);
    if (!path) return;

    const newDoc = updateNodeAtPath(document, path, (n) => ({
      ...n,
      number,
    }));
    commit(newDoc);
  }, [document, nodeIndex, commit]);

  /**
   * List numbering styles.
   */
  type ListStyle = 'unordered' | 'numbered' | 'lettered';

  /**
   * Get the number string for a list item based on style and index.
   */
  const getNumberForStyle = (style: ListStyle, index: number): string | null => {
    switch (style) {
      case 'unordered': return null;
      case 'numbered': return `${index + 1}.`;
      case 'lettered': return `${String.fromCharCode(97 + index)}.`;
    }
  };

  /**
   * Check if a node has contents (is leaf, heading, or content - not pure container).
   */
  const hasContents = (node: DocumentNode): node is LeafDocumentNode | HeadingDocumentNode | ContentDocumentNode => {
    return 'contents' in node;
  };

  /**
   * Change the type of a node.
   * Handles conversions between heading, content, and list_item.
   *
   * @param id - Node ID to convert
   * @param targetType - 'heading' | 'content' | 'list'
   * @param listStyle - For lists: 'unordered' | 'numbered' | 'lettered'
   */
  const changeNodeType = useCallback((
    id: string,
    targetType: 'heading' | 'content' | 'list',
    listStyle?: ListStyle
  ) => {
    const path = nodeIndex.get(id);
    if (!path || path.length === 0) return; // Can't change root

    const node = getNodeAtPath(document, path);
    if (!node) return;

    // Get parent info
    const parentPath = path.slice(0, -1);
    const nodeIndexInParent = path[path.length - 1];
    const parent = parentPath.length === 0 ? document : getNodeAtPath(document, parentPath);
    if (!parent || !('children' in parent)) return;

    // Handle list_item specially - it requires extraction from list
    if (node.type === 'list_item') {
      if (targetType === 'list') {
        // Just change list style
        changeListStyle(path, listStyle || 'numbered');
        return;
      }
      // Extract from list and convert
      extractAndConvertListItem(path, node as ContainerDocumentNode, targetType);
      return;
    }

    // Can only convert nodes with contents
    if (!hasContents(node)) return;

    // Handle conversion to heading
    if (targetType === 'heading') {
      if (node.type === 'heading') return; // Already a heading

      // content -> heading: add empty children
      const newNode: HeadingDocumentNode = {
        id: node.id,
        number: node.number,
        type: 'heading',
        contents: node.contents,
        children: [],
      };

      const newDoc = updateNodeAtPath(document, path, () => newNode);
      commit(newDoc);
      return;
    }

    // Handle conversion to content
    if (targetType === 'content') {
      if (node.type === 'content') return; // Already content

      // heading -> content: lift children as siblings
      const headingNode = node as HeadingDocumentNode;
      const children = headingNode.children;

      // Create content node (with empty children array)
      const contentNode: ContentDocumentNode = {
        id: node.id,
        number: node.number,
        type: 'content',
        contents: node.contents,
        children: [],
      };

      // Replace heading with content
      let newDoc = updateNodeAtPath(document, path, () => contentNode);

      // Insert former children after the converted node
      for (let i = 0; i < children.length; i++) {
        newDoc = insertNodeAtPath(newDoc, parentPath, nodeIndexInParent + 1 + i, children[i]);
      }

      commit(newDoc);
      return;
    }

    // Handle conversion to list
    if (targetType === 'list') {
      const style = listStyle || 'numbered';

      // Create list item from the node (container with child content node)
      const listItem: ContainerDocumentNode = {
        id: generateId(),
        number: getNumberForStyle(style, 0),
        type: 'list_item',
        children: [
          {
            id: node.id,
            number: null,
            type: 'content',
            contents: node.contents,
            children: [],
          } as ContentDocumentNode,
        ],
      };

      // Create list container
      const list: ContainerDocumentNode = {
        id: generateId(),
        number: null,
        type: 'list',
        children: [listItem],
      };

      // Replace node with list
      let newDoc = updateNodeAtPath(document, path, () => list);

      // If it was a heading, lift its children after the new list
      if (node.type === 'heading') {
        const headingChildren = (node as HeadingDocumentNode).children;
        for (let i = 0; i < headingChildren.length; i++) {
          newDoc = insertNodeAtPath(newDoc, parentPath, nodeIndexInParent + 1 + i, headingChildren[i]);
        }
      }

      // Merge adjacent lists in the parent
      newDoc = mergeAdjacentLists(newDoc, parentPath);

      commit(newDoc);
      return;
    }
  }, [document, nodeIndex, commit]);

  /**
   * Change the numbering style of a list (affects all items).
   */
  const changeListStyle = useCallback((itemPath: NodePath, style: ListStyle) => {
    const parentPath = itemPath.slice(0, -1);
    const parent = parentPath.length === 0 ? document : getNodeAtPath(document, parentPath);

    if (!parent || parent.type !== 'list') return;

    // Update all items' numbers
    const listNode = parent as ContainerDocumentNode;
    const newChildren = listNode.children.map((child, i) => ({
      ...child,
      number: getNumberForStyle(style, i),
    }));

    const newDoc = updateNodeAtPath(document, parentPath, () => ({
      ...parent,
      children: newChildren,
    }));

    commit(newDoc);
  }, [document, commit]);

  /**
   * Extract a list_item from its list and convert to heading or content.
   */
  const extractAndConvertListItem = useCallback((
    itemPath: NodePath,
    item: ContainerDocumentNode,
    targetType: 'heading' | 'content'
  ) => {
    const listPath = itemPath.slice(0, -1);
    const itemIndexInList = itemPath[itemPath.length - 1];
    const list = getNodeAtPath(document, listPath) as ContainerDocumentNode;

    if (!list || list.type !== 'list') return;

    // Extract contents from the first child content node
    const firstChild = item.children[0];
    const contents = firstChild && 'contents' in firstChild ? firstChild.contents : {};

    // Create the converted node
    const convertedNode: DocumentNode = targetType === 'heading'
      ? {
          id: item.id,
          number: null,
          type: 'heading',
          contents,
          children: [],
        } as HeadingDocumentNode
      : {
          id: item.id,
          number: null,
          type: 'content',
          contents,
          children: [],
        } as ContentDocumentNode;

    // Get parent of list info
    const listParentPath = listPath.slice(0, -1);
    const listIndexInParent = listPath[listPath.length - 1];

    if (list.children.length === 1) {
      // Only item in list - replace entire list with converted node
      const newDoc = updateNodeAtPath(document, listPath, () => convertedNode);
      commit(newDoc);
    } else {
      // Multiple items - remove from list, insert converted node
      // Remove the item from the list
      let newDoc = removeNodeAtPath(document, itemPath);

      // Determine where to insert the converted node
      // If it was the first item, insert before the list
      // Otherwise, insert after the list
      if (itemIndexInList === 0) {
        newDoc = insertNodeAtPath(newDoc, listParentPath, listIndexInParent, convertedNode);
      } else {
        newDoc = insertNodeAtPath(newDoc, listParentPath, listIndexInParent + 1, convertedNode);
      }

      commit(newDoc);
    }
  }, [document, commit]);

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
  const moveNodeById = useCallback((
    sourceId: string,
    targetId: string,
    position: 'top' | 'bottom'
  ): MoveResult => {
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
    const targetParent = targetParentPath.length === 0
      ? document
      : getNodeAtPath(document, targetParentPath);

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
  }, [document, nodeIndex, commit]);

  return {
    addNodeAfter,
    removeNode,
    updateNodeContents,
    updateNodeNumber,
    indentNode,
    outdentNode,
    changeNodeType,
    moveNodeById,
  };
};

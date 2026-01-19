import { useCallback } from 'react';
import type { ContainerDocumentNode, HeadingDocumentNode, LeafDocumentNode, DocumentNode, Language } from '../types/document';
import type { NodePath } from '../types/editor';
import { getNodeAtPath, updateNodeAtPath, insertNodeAtPath, removeNodeAtPath } from '../utils/tree-utils';
import { generateId } from '../utils/document-utils';

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
      // Inside a list, create a list_item
      newNode = {
        id: generateId(),
        number: null,
        type: 'list_item',
        contents: { [language]: '' },
      } as LeafDocumentNode;
    } else {
      // Default to content node
      newNode = {
        id: generateId(),
        number: null,
        type: 'content',
        contents: { [language]: '' },
      } as LeafDocumentNode;
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

  return {
    addNodeAfter,
    removeNode,
    updateNodeContents,
    updateNodeNumber,
    indentNode,
    outdentNode,
  };
};

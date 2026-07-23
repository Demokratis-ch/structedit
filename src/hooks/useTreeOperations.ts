import { useCallback } from 'react';
import type {
  ContentBearingNodeType,
  ContentDocumentNode,
  ContributionMode,
  DocumentNode,
  DocumentRootNode,
  FootnoteDocumentNode,
  HeadingDocumentNode,
  ImageDocumentNode,
  Language,
  NodeFormat,
  ParentType,
} from '../types/document';
import { canBeChildOf, canHaveFormat } from '../types/document';
import type { NodePath } from '../types/editor';
import {
  canMergeIdsInDoc,
  changeNodeTypeInDoc,
  createNewSiblingNode,
  indentNodeInDoc,
  keepOutermostIds,
  type ListStyle,
  mergeNodesInDoc,
  outdentNodeInDoc,
} from '../utils/tree-mutations';
import {
  buildIndices,
  changeNodeFormat as changeNodeFormatInTree,
  getNodeAtPath,
  insertNodeAtPath,
  moveNode,
  removeNodeAtPath,
  setNodeContributionMode,
  updateChildrenAtPath,
  updateNodeAtPath,
} from '../utils/tree-utils';

export type MoveResult = { success: true } | { success: false; reason: string };

interface UseTreeOperationsProps {
  document: DocumentRootNode;
  commit: (doc: DocumentRootNode, saveHistory?: boolean) => void;
  nodeIndex: Map<string, NodePath>;
  parentIndex: Map<string, string>;
  language: Language;
}

/**
 * React/undo orchestration around the pure tree mutations in
 * `../utils/tree-mutations`. Each callback resolves the current document and
 * index, delegates the actual restructuring to a pure function, and commits the
 * result to history. Multi-node operations rebuild the index between iterations
 * so processing order doesn't matter.
 */
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
          ...(
            n as
              | FootnoteDocumentNode
              | ImageDocumentNode
              | HeadingDocumentNode
              | ContentDocumentNode
          ).contents,
          [language]: contents,
        },
      }));
      commit(newDoc, saveHistory);
    },
    [document, nodeIndex, language, commit]
  );

  /**
   * Tab: Nest nodes deeper into the tree.
   * Processes multiple nodes, rebuilding indices between each operation.
   */
  const indentNodes = useCallback(
    (ids: string[]) => {
      let doc = document;
      let changed = false;

      for (const id of keepOutermostIds(ids, nodeIndex)) {
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
      const reversed = keepOutermostIds(ids, nodeIndex).reverse();

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
      const contentBearing: ContentBearingNodeType[] = ['HEADING', 'CONTENT', 'FOOTNOTE', 'IMAGE'];
      if (!contentBearing.includes(node.type as ContentBearingNodeType)) return;
      if (!canHaveFormat(node.type as ContentBearingNodeType, format)) return;

      const newDoc = changeNodeFormatInTree(document, path, format);
      commit(newDoc);
    },
    [document, nodeIndex, commit]
  );

  /**
   * Set (or clear) the contribution mode on every given node in a single history entry. Nodes
   * whose type can't hold the requested mode are skipped (their existing mode is left untouched),
   * so painting a mode across a mixed selection only affects the nodes it validly applies to.
   * Passing `undefined` clears the mode. Rebuilds indices between iterations like the other
   * multi-node ops so processing order doesn't matter.
   */
  const changeNodeContributionMode = useCallback(
    (ids: string[], mode: ContributionMode | undefined) => {
      let doc = document;
      let changed = false;

      for (const id of ids) {
        const idx = changed ? buildIndices(doc).nodeIndex : nodeIndex;
        const path = idx.get(id);
        if (!path) continue;

        const result = setNodeContributionMode(doc, path, mode);
        if (result !== doc) {
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
   * Change the type of one or more nodes.
   * Processes all nodes sequentially with index rebuilding, committing once at the end.
   */
  const changeNodeTypes = useCallback(
    (
      ids: string[],
      targetType: 'HEADING' | 'CONTENT' | 'LIST' | 'FOOTNOTE',
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
   * Cluster the named nodes at the top or bottom of their respective parents.
   * Nodes keep their current parent; selected siblings preserve their relative
   * order within each parent. Different parents are reordered independently in
   * a single commit. Skips parents where the move would be a no-op.
   */
  const moveNodesToBoundary = useCallback(
    (ids: string[], position: 'top' | 'bottom') => {
      if (ids.length === 0) return;

      // Group ids by parent path.
      const byParent = new Map<string, { parentPath: NodePath; selectedIds: Set<string> }>();
      for (const id of ids) {
        const path = nodeIndex.get(id);
        if (!path || path.length === 0) continue;
        const parentPath = path.slice(0, -1);
        const key = parentPath.join('.');
        let group = byParent.get(key);
        if (!group) {
          group = { parentPath, selectedIds: new Set() };
          byParent.set(key, group);
        }
        group.selectedIds.add(id);
      }

      // Deepest-first: rewriting a parent's children doesn't disturb the path
      // to deeper parents we still need to visit (deeper parents live inside
      // an ancestor we haven't touched yet).
      const groups = [...byParent.values()].sort(
        (a, b) => b.parentPath.length - a.parentPath.length
      );

      let doc = document;
      let changed = false;

      for (const { parentPath, selectedIds } of groups) {
        const parent = parentPath.length === 0 ? doc : getNodeAtPath(doc, parentPath);
        if (!parent || !('children' in parent)) continue;

        // Iterate the parent's children in document order so the selected ones
        // cluster in their original relative order, regardless of how the
        // caller ordered ids.
        const children = parent.children;
        const selected: DocumentNode[] = [];
        const unselected: DocumentNode[] = [];
        for (const child of children) {
          if (selectedIds.has(child.id)) {
            selected.push(child);
          } else {
            unselected.push(child);
          }
        }

        const newChildren =
          position === 'top' ? [...selected, ...unselected] : [...unselected, ...selected];

        const noChange = newChildren.every((c, i) => c === children[i]);
        if (noChange) continue;

        doc = updateChildrenAtPath(doc, parentPath, () => newChildren);
        changed = true;
      }

      if (changed) {
        commit(doc);
      }
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

  /**
   * Curried form of `canMergeIdsInDoc` over the current document/index. Useful
   * for driving UI affordances (e.g. disabling the merge button).
   */
  const canMergeIds = useCallback(
    (ids: readonly string[]) => canMergeIdsInDoc(ids, document, nodeIndex),
    [document, nodeIndex]
  );

  /**
   * Merge a contiguous run of same-parent, same-type siblings into a single
   * node. No-op when the selection doesn't qualify — see `mergeNodesInDoc`.
   */
  const mergeNodes = useCallback(
    (ids: readonly string[]) => {
      const newDoc = mergeNodesInDoc(ids, document, nodeIndex);
      if (newDoc) commit(newDoc);
    },
    [document, nodeIndex, commit]
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
    changeNodeContributionMode,
    mergeNodes,
    canMergeIds,
    moveNodeById,
    moveNodesToBoundary,
    getReceivingParentId,
    nodeIndex,
    parentIndex,
  };
};

import {
  type BlockDocumentNode,
  type ContentBearingNodeType,
  type ContributionMode,
  canHaveFormat,
  canHaveMode,
  type DocumentNode,
  type DocumentRootNode,
  type FootnoteDocumentNode,
  type ListItemDocumentNode,
  type NodeFormat,
  type ParentDocumentNode,
} from '../types/document';
import type { FlattenedNode, NodePath } from '../types/editor';

/**
 * Rebuild a parent node with a transformed children array, preserving the node's concrete type.
 *
 * The `map` callback operates at the widened `DocumentNode[]` level so generic walkers and tree
 * transforms need not know which concrete parent they hold; the cast back to the exact child union
 * (`ListItemDocumentNode[]` / `FootnoteDocumentNode[]` / `BlockDocumentNode[]`) is asserted here,
 * keyed off the runtime `type` discriminant. Every immutable children-rebuild routes through this
 * one helper rather than sprinkling casts at each call site — the cast trusts the callback to
 * return nodes valid for the parent (it can't be statically enforced once widened to `DocumentNode`).
 */
export function withMappedChildren<T extends ParentDocumentNode>(
  node: T,
  map: (children: DocumentNode[]) => DocumentNode[]
): T {
  switch (node.type) {
    case 'LIST':
      return { ...node, children: map(node.children) as ListItemDocumentNode[] };
    case 'CONTENT':
      return { ...node, children: map(node.children) as FootnoteDocumentNode[] };
    default:
      // DOCUMENT | HEADING | LIST_ITEM all carry block-level children.
      return { ...node, children: map(node.children) as BlockDocumentNode[] };
  }
}

/**
 * Get a node at a given path (immutable read).
 */
export function getNodeAtPath(root: DocumentNode, path: NodePath): DocumentNode | null {
  let current: DocumentNode = root;
  for (const index of path) {
    if (!('children' in current) || !current.children) {
      return null;
    }
    if (index < 0 || index >= current.children.length) {
      return null;
    }
    current = current.children[index];
  }
  return current;
}

/**
 * Update a node at path (immutable - returns new tree).
 * Uses structural sharing for efficiency.
 */
export function updateNodeAtPath(
  root: DocumentRootNode,
  path: NodePath,
  updater: (node: DocumentNode) => DocumentNode
): DocumentRootNode {
  // The root passed in is always a container; the recursion below descends through any parent
  // node (headings/content carry children too), so the single boundary cast restores that fact.
  return updateParentAtPath(root, path, updater) as DocumentRootNode;
}

/**
 * Recursive core of {@link updateNodeAtPath}. Operates over any parent node so a path can descend
 * through headings and content nodes, not just the container types.
 */
function updateParentAtPath(
  node: ParentDocumentNode,
  path: NodePath,
  updater: (node: DocumentNode) => DocumentNode
): DocumentNode {
  if (path.length === 0) {
    return updater(node);
  }

  const [headIndex, ...tailPath] = path;

  return withMappedChildren(node, (children) => {
    const newChildren = [...children];
    const child = newChildren[headIndex];
    if (tailPath.length === 0) {
      newChildren[headIndex] = updater(child);
    } else if ('children' in child) {
      // Only parent nodes (those carrying `children`) can be descended into further.
      newChildren[headIndex] = updateParentAtPath(child, tailPath, updater);
    }
    return newChildren;
  });
}

/**
 * Replace a parent node's children at `path` via a mapping callback, preserving the node's
 * concrete type. The ergonomic wrapper for the common `updateNodeAtPath(..., (n) => ({ ...n,
 * children })` shape — the per-type child cast is handled by {@link withMappedChildren}.
 */
export function updateChildrenAtPath(
  root: DocumentRootNode,
  path: NodePath,
  map: (children: DocumentNode[]) => DocumentNode[]
): DocumentRootNode {
  return updateNodeAtPath(root, path, (node) =>
    'children' in node ? withMappedChildren(node, map) : node
  );
}

const CONTENT_BEARING_TYPES: ContentBearingNodeType[] = ['HEADING', 'CONTENT', 'FOOTNOTE', 'IMAGE'];

/**
 * Change a content-bearing node's format. No-op when the target node is a container
 * (no format) or the chosen format isn't allowed for the node's type. Leaves
 * contents untouched. Returns the same root reference if no change was applied.
 */
export function changeNodeFormat(
  root: DocumentRootNode,
  path: NodePath,
  format: NodeFormat
): DocumentRootNode {
  const node = getNodeAtPath(root, path);
  if (!node) return root;
  if (!CONTENT_BEARING_TYPES.includes(node.type as ContentBearingNodeType)) return root;
  if (!canHaveFormat(node.type as ContentBearingNodeType, format)) return root;
  return updateNodeAtPath(root, path, (n) => ({ ...n, format }) as DocumentNode);
}

/**
 * Set (or clear) a node's contribution mode. No-op (returns the same root reference) when the node
 * doesn't exist, the requested mode isn't allowed for its type, or the node already carries it.
 * Passing `undefined` clears the field entirely, so a cleared node is indistinguishable from a
 * never-set one after a JSON round-trip. Unlike {@link changeNodeFormat}, every node type — the
 * root and containers included — is eligible.
 */
export function setNodeContributionMode(
  root: DocumentRootNode,
  path: NodePath,
  mode: ContributionMode | undefined
): DocumentRootNode {
  const node = getNodeAtPath(root, path);
  if (!node) return root;
  if (mode !== undefined && !canHaveMode(node.type, mode)) return root;
  // Already in the requested state (treating an absent field as `undefined`) — preserve reference.
  if ((node.contributionMode ?? undefined) === mode) return root;
  return updateNodeAtPath(root, path, (n) => {
    if (mode === undefined) {
      const next = { ...n };
      delete (next as { contributionMode?: ContributionMode }).contributionMode;
      return next as DocumentNode;
    }
    return { ...n, contributionMode: mode } as DocumentNode;
  });
}

/**
 * Insert a node at a specific position.
 */
export function insertNodeAtPath(
  root: DocumentRootNode,
  parentPath: NodePath,
  index: number,
  newNode: DocumentNode
): DocumentRootNode {
  return updateNodeAtPath(root, parentPath, (parent) => {
    if (!('children' in parent)) {
      throw new Error('Cannot insert into leaf node');
    }
    return withMappedChildren(parent, (children) => {
      const newChildren = [...children];
      newChildren.splice(index, 0, newNode);
      return newChildren;
    });
  });
}

/**
 * Remove a node at path.
 */
export function removeNodeAtPath(root: DocumentRootNode, path: NodePath): DocumentRootNode {
  if (path.length === 0) {
    throw new Error('Cannot remove root');
  }

  const parentPath = path.slice(0, -1);
  const childIndex = path[path.length - 1];

  return updateNodeAtPath(root, parentPath, (parent) => {
    if (!('children' in parent)) {
      throw new Error('Parent is not a container');
    }
    return withMappedChildren(parent, (children) => {
      const newChildren = [...children];
      newChildren.splice(childIndex, 1);
      return newChildren;
    });
  });
}

/**
 * Move a node from one location to another.
 */
export function moveNode(
  root: DocumentRootNode,
  fromPath: NodePath,
  toParentPath: NodePath,
  toIndex: number
): DocumentRootNode {
  const node = getNodeAtPath(root, fromPath);
  if (!node) {
    throw new Error('Source node not found');
  }

  // Check if moving within same parent
  const fromParentPath = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1];
  const sameParent =
    fromParentPath.length === toParentPath.length &&
    fromParentPath.every((v, i) => v === toParentPath[i]);

  // Remove first
  const result = removeNodeAtPath(root, fromPath);

  // Adjust target index if moving within same parent and source was before target
  let adjustedIndex = toIndex;
  if (sameParent && fromIndex < toIndex) {
    adjustedIndex--;
  }

  // Adjust toParentPath if the removal affects it
  // The removal of fromPath affects toParentPath only if:
  // 1. They share the same parent path prefix (fromParentPath)
  // 2. AND fromIndex < the index in toParentPath at that level
  const adjustedToParentPath = [...toParentPath];

  // Check if fromParentPath is a prefix of toParentPath
  // If so, we need to check if fromIndex affects the next segment
  if (
    fromParentPath.length <= toParentPath.length &&
    fromParentPath.every((v, i) => v === toParentPath[i])
  ) {
    // The paths share fromParentPath as a common prefix
    // Check if toParentPath continues at the level where fromIndex is
    if (fromParentPath.length < toParentPath.length) {
      // toParentPath has a segment at the same level as fromIndex
      if (fromIndex < toParentPath[fromParentPath.length]) {
        adjustedToParentPath[fromParentPath.length]--;
      }
    }
    // Note: if fromParentPath.length === toParentPath.length, that's sameParent case
    // which is already handled above with adjustedIndex
  }

  // Insert at new location
  return insertNodeAtPath(result, adjustedToParentPath, adjustedIndex, node);
}

/**
 * Build lookup indices for efficient tree operations.
 */
export function buildIndices(root: DocumentRootNode): {
  nodeIndex: Map<string, NodePath>;
  parentIndex: Map<string, string>;
} {
  const nodeIndex = new Map<string, NodePath>();
  const parentIndex = new Map<string, string>();

  function walk(node: DocumentNode, path: NodePath, parentId: string | null) {
    nodeIndex.set(node.id, [...path]);
    if (parentId !== null) {
      parentIndex.set(node.id, parentId);
    }

    if ('children' in node && node.children) {
      node.children.forEach((child, i) => {
        walk(child, [...path, i], node.id);
      });
    }
  }

  walk(root, [], null);
  return { nodeIndex, parentIndex };
}

/**
 * Merge adjacent list siblings within a parent container.
 * Combines consecutive lists into a single list.
 */
export function mergeAdjacentLists(root: DocumentRootNode, parentPath: NodePath): DocumentRootNode {
  const parent = parentPath.length === 0 ? root : getNodeAtPath(root, parentPath);
  if (!parent || !('children' in parent)) return root;

  const children = parent.children;
  const merged: DocumentNode[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child.type === 'LIST' && merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.type === 'LIST') {
        // Merge this list into the previous one (both narrowed to LIST → typed list_item children).
        merged[merged.length - 1] = {
          ...prev,
          children: [...prev.children, ...child.children],
        };
        continue;
      }
    }

    merged.push(child);
  }

  // No change needed if same length
  if (merged.length === children.length) return root;

  // Update the parent with merged children (handles the root via an empty parentPath).
  return updateChildrenAtPath(root, parentPath, () => merged);
}

/**
 * Flatten tree to array for rendering, computing connector line metadata.
 */
export function flattenForRendering(root: DocumentRootNode): FlattenedNode[] {
  const result: FlattenedNode[] = [];

  function walk(
    node: DocumentNode,
    path: NodePath,
    depth: number,
    parentId: string | null,
    ancestorIsLastChild: boolean[]
  ) {
    // Get parent to determine if this node is last child
    let isLastChild = false;
    if (path.length > 0) {
      const parentPath = path.slice(0, -1);
      const parent = parentPath.length === 0 ? root : getNodeAtPath(root, parentPath);
      if (parent && 'children' in parent) {
        const myIndex = path[path.length - 1];
        isLastChild = myIndex === parent.children.length - 1;
      }
    }

    result.push({
      node,
      path: [...path],
      depth,
      parentId,
      isLastChild,
      ancestorIsLastChild: [...ancestorIsLastChild],
    });

    if ('children' in node && node.children) {
      const newAncestorFlags = [...ancestorIsLastChild, isLastChild];
      node.children.forEach((child, i) => {
        walk(child, [...path, i], depth + 1, node.id, newAncestorFlags);
      });
    }
  }

  // Start from root's children (don't render root itself)
  root.children.forEach((child, i) => {
    walk(child, [i], 0, root.id, []);
  });

  return result;
}

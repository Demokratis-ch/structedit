import type { DocumentNode, ContainerDocumentNode } from '../types/document';
import type { NodePath, FlattenedNode } from '../types/editor';

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
  root: ContainerDocumentNode,
  path: NodePath,
  updater: (node: DocumentNode) => DocumentNode
): ContainerDocumentNode {
  if (path.length === 0) {
    return updater(root) as ContainerDocumentNode;
  }

  const [headIndex, ...tailPath] = path;
  const newChildren = [...root.children];

  if (tailPath.length === 0) {
    newChildren[headIndex] = updater(newChildren[headIndex]);
  } else {
    const child = newChildren[headIndex];
    if ('children' in child) {
      newChildren[headIndex] = updateNodeAtPath(
        child as ContainerDocumentNode,
        tailPath,
        updater
      );
    }
  }

  return { ...root, children: newChildren };
}

/**
 * Insert a node at a specific position.
 */
export function insertNodeAtPath(
  root: ContainerDocumentNode,
  parentPath: NodePath,
  index: number,
  newNode: DocumentNode
): ContainerDocumentNode {
  if (parentPath.length === 0) {
    const newChildren = [...root.children];
    newChildren.splice(index, 0, newNode);
    return { ...root, children: newChildren };
  }

  return updateNodeAtPath(root, parentPath, (parent) => {
    if (!('children' in parent)) {
      throw new Error('Cannot insert into leaf node');
    }
    const newChildren = [...(parent as ContainerDocumentNode).children];
    newChildren.splice(index, 0, newNode);
    return { ...parent, children: newChildren };
  });
}

/**
 * Remove a node at path.
 */
export function removeNodeAtPath(
  root: ContainerDocumentNode,
  path: NodePath
): ContainerDocumentNode {
  if (path.length === 0) {
    throw new Error('Cannot remove root');
  }

  const parentPath = path.slice(0, -1);
  const childIndex = path[path.length - 1];

  if (parentPath.length === 0) {
    const newChildren = [...root.children];
    newChildren.splice(childIndex, 1);
    return { ...root, children: newChildren };
  }

  return updateNodeAtPath(root, parentPath, (parent) => {
    if (!('children' in parent)) {
      throw new Error('Parent is not a container');
    }
    const newChildren = [...(parent as ContainerDocumentNode).children];
    newChildren.splice(childIndex, 1);
    return { ...parent, children: newChildren };
  });
}

/**
 * Move a node from one location to another.
 */
export function moveNode(
  root: ContainerDocumentNode,
  fromPath: NodePath,
  toParentPath: NodePath,
  toIndex: number
): ContainerDocumentNode {
  const node = getNodeAtPath(root, fromPath);
  if (!node) {
    throw new Error('Source node not found');
  }

  // Check if moving within same parent
  const fromParentPath = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1];
  const sameParent = fromParentPath.length === toParentPath.length &&
    fromParentPath.every((v, i) => v === toParentPath[i]);

  // Remove first
  let result = removeNodeAtPath(root, fromPath);

  // Adjust target index if moving within same parent and source was before target
  let adjustedIndex = toIndex;
  if (sameParent && fromIndex < toIndex) {
    adjustedIndex--;
  }

  // Insert at new location
  return insertNodeAtPath(result, toParentPath, adjustedIndex, node);
}

/**
 * Build lookup indices for efficient tree operations.
 */
export function buildIndices(root: ContainerDocumentNode): {
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
 * Flatten tree to array for rendering, computing connector line metadata.
 */
export function flattenForRendering(root: ContainerDocumentNode): FlattenedNode[] {
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
        walk(
          child,
          [...path, i],
          depth + 1,
          node.id,
          newAncestorFlags
        );
      });
    }
  }

  // Start from root's children (don't render root itself)
  root.children.forEach((child, i) => {
    walk(child, [i], 0, root.id, []);
  });

  return result;
}

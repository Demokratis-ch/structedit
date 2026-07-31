import type { DocumentNode, DocumentRootNode, Language } from './document';

/**
 * Path from root to a node, represented as array of child indices.
 * Example: [0, 2, 1] means root.children[0].children[2].children[1]
 */
export type NodePath = number[];

/**
 * Selection state for the tree editor.
 */
export interface EditorSelection {
  selectedIds: Set<string>;
  anchorPath: NodePath | null; // Starting point for shift-selection
  focusPath: NodePath | null; // Current endpoint
}

/**
 * Flattened view of a tree node for rendering.
 * Computed from tree structure, includes metadata for connector lines.
 */
export interface FlattenedNode {
  node: DocumentNode;
  path: NodePath;
  depth: number;
  parentId: string | null;
  isLastChild: boolean;
  ancestorIsLastChild: boolean[]; // For vertical line continuation at each depth
}

/**
 * Scope of a bulk contribution-mode apply: the selected node(s) only, or each selected node
 * together with all its descendants.
 */
export type ContributionScope = 'node' | 'subtree';

/**
 * Node-type filter for a bulk contribution-mode apply. `'all'` means every type in scope.
 */
export type ContributionTypeFilter = DocumentNode['type'] | 'all';

/**
 * Complete editor state for the tree-based editor.
 */
export interface TreeEditorState {
  document: DocumentRootNode;
  selection: EditorSelection;
  editingId: string | null;
  language: Language;
  nodeIndex: Map<string, NodePath>;
  parentIndex: Map<string, string>;
}

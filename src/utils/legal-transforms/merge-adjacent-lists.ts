import type { ContainerDocumentNode, DocumentNode, Language } from '../../types/document';
import type { TreeTransform } from './types';

/**
 * Recurse into a container, merging adjacent `list` siblings at each level.
 * Returns the original node reference if nothing changed (memo-friendly).
 *
 * Merge contract: when two adjacent `list` nodes are merged, the first list's
 * identity (`id`, `number`, and any other top-level fields) wins; the second
 * list's list_item children are appended to the first's children. Every
 * merged `list_item`'s `number` field is preserved exactly — no
 * auto-renumbering. Restarted sequences (e.g., Mammoth page-splits) survive
 * as-is; downstream transforms (notably listNumberDedupTransform) handle the
 * arabic-with-<sup> page-split case via text content. Explicit markers from
 * `data-list-style-type` are never overwritten.
 *
 * The recursion descends through every container including `list_item`, so
 * adjacent lists nested inside a list item are merged too.
 */
function recurseIntoContainer(node: DocumentNode): DocumentNode {
  if (!('children' in node) || !node.children || node.children.length === 0) return node;

  const out: DocumentNode[] = [];
  let changed = false;

  for (const child of node.children) {
    const recursed = recurseIntoContainer(child);
    if (recursed !== child) changed = true;

    const last = out[out.length - 1];
    if (recursed.type === 'list' && last?.type === 'list') {
      const prev = last as ContainerDocumentNode;
      const curr = recursed as ContainerDocumentNode;
      out[out.length - 1] = {
        ...prev,
        children: [...prev.children, ...curr.children],
      };
      changed = true;
    } else {
      out.push(recursed);
    }
  }

  return changed ? { ...node, children: out } : node;
}

export const mergeAdjacentListsTransform: TreeTransform = (
  root: ContainerDocumentNode,
  _language: Language
): ContainerDocumentNode => {
  return recurseIntoContainer(root) as ContainerDocumentNode;
};

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
import { generateId } from './document-utils';
import {
  getNodeAtPath,
  insertNodeAtPath,
  mergeAdjacentLists,
  removeNodeAtPath,
  updateNodeAtPath,
} from './tree-utils';

/**
 * Pure, position-/id-addressed tree mutations: the logic behind the editor's
 * commands, expressed as `(document, index, …) -> new document | null`. Every
 * function here is React-free and side-effect-free — `useTreeOperations` wraps
 * them with commit/history orchestration. See the module boundary note in the
 * project docs: this layer composes the mechanical primitives in `tree-utils`
 * and adds document-schema knowledge (list rules, formats, numbering).
 */

const MERGEABLE_TYPES: ReadonlySet<DocumentNode['type']> = new Set([
  'CONTENT',
  'FOOTNOTE',
  'HEADING',
  'LIST',
  'LIST_ITEM',
]);

// Most → least permissive. Used to pick the resulting format when merging.
const FORMAT_RANK: Record<NodeFormat, number> = {
  TEXT: 0,
  NEWLINES: 1,
  MARKDOWN_MINIMAL: 2,
  MARKDOWN_INLINE: 3,
  MARKDOWN: 4,
};

const isStrictPathPrefix = (a: NodePath, b: NodePath): boolean => {
  if (a.length >= b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

/**
 * Keep only the "outermost" ids: drop any id whose ancestor is also in the set.
 * When a node and one of its descendants are both selected, an indent/outdent of
 * the ancestor already carries the descendant along, so processing the
 * descendant separately would change its relative nesting and corrupt the
 * structure (issue #108). Order is preserved.
 */
export const keepOutermostIds = (ids: string[], nodeIndex: Map<string, NodePath>): string[] => {
  const entries = ids
    .map((id) => ({ id, path: nodeIndex.get(id) }))
    .filter((e): e is { id: string; path: NodePath } => e.path !== undefined);
  return entries
    .filter(({ path }) => !entries.some((o) => o.path !== path && isStrictPathPrefix(o.path, path)))
    .map(({ id }) => id);
};

/**
 * Resolve the canonical merge targets for the given ids, sorted in document
 * order. Returns null when the selection doesn't qualify.
 *
 * Filters out ids whose ancestor is also selected ("outermost wins"). This
 * matters for shift-click selections over containers like list_items: the
 * range typically picks up nested content children too, which would otherwise
 * mix node types and block the merge. The descendants are not lost — they
 * stay inside the merged container.
 */
export const resolveMergeTargets = (
  ids: readonly string[],
  doc: ContainerDocumentNode,
  nodeIndex: Map<string, NodePath>
): NodePath[] | null => {
  if (ids.length < 2) return null;

  const paths: NodePath[] = [];
  for (const id of ids) {
    const path = nodeIndex.get(id);
    if (!path || path.length === 0) return null;
    paths.push(path);
  }

  const outermost = paths.filter(
    (p) => !paths.some((other) => other !== p && isStrictPathPrefix(other, p))
  );
  if (outermost.length < 2) return null;

  const parentKey = outermost[0].slice(0, -1).join('.');
  for (const p of outermost) {
    if (p.slice(0, -1).join('.') !== parentKey) return null;
  }

  const sorted = [...outermost].sort((a, b) => a[a.length - 1] - b[b.length - 1]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][sorted[i].length - 1] !== sorted[i - 1][sorted[i - 1].length - 1] + 1) {
      return null;
    }
  }

  const firstNode = getNodeAtPath(doc, sorted[0]);
  if (!firstNode || !MERGEABLE_TYPES.has(firstNode.type)) return null;
  for (const p of sorted) {
    const n = getNodeAtPath(doc, p);
    if (!n || n.type !== firstNode.type) return null;
  }

  return sorted;
};

/**
 * Check whether a merge of the given ids is valid. See `resolveMergeTargets`
 * for the full set of rules.
 */
export const canMergeIdsInDoc = (
  ids: readonly string[],
  doc: ContainerDocumentNode,
  nodeIndex: Map<string, NodePath>
): boolean => resolveMergeTargets(ids, doc, nodeIndex) !== null;

/** Per-language join. Empty strings on either side don't introduce stray separators. */
const mergeContentsFromNodes = (
  nodes: ReadonlyArray<HeadingDocumentNode | ContentDocumentNode | LeafDocumentNode>,
  separator: string
): Partial<Record<Language, string>> => {
  const languages = new Set<Language>();
  for (const n of nodes) {
    for (const k of Object.keys(n.contents)) {
      languages.add(k as Language);
    }
  }
  const out: Partial<Record<Language, string>> = {};
  for (const lang of languages) {
    const parts: string[] = [];
    for (const n of nodes) {
      const value = n.contents[lang];
      if (value && value.length > 0) parts.push(value);
    }
    if (parts.length > 0) out[lang] = parts.join(separator);
  }
  return out;
};

/**
 * Pick the merged format: max by rank among sources. For content/footnote we
 * floor to NEWLINES because the join inserts literal `\n`s; for heading we
 * never floor (whitespace separator) so TEXT stays valid.
 */
const mergeFormatOf = (
  formats: readonly NodeFormat[],
  type: ContentBearingNodeType
): NodeFormat => {
  let best: NodeFormat = formats[0];
  for (const f of formats) {
    if (FORMAT_RANK[f] > FORMAT_RANK[best]) best = f;
  }
  if ((type === 'CONTENT' || type === 'FOOTNOTE') && best === 'TEXT') {
    best = 'NEWLINES';
  }
  // Defense against pre-existing data corruption: if a source carried a format
  // not allowed for its type, fall back to the default rather than propagate.
  return canHaveFormat(type, best) ? best : DEFAULT_FORMAT[type];
};

/**
 * The paragraph break required by a given format for content/footnote merges.
 * Markdown collapses a single `\n` to a space at render time, so paragraph
 * boundaries need a blank line. Plain NEWLINES keeps a single `\n`.
 */
const paragraphSeparatorFor = (format: NodeFormat): string => {
  if (format === 'MARKDOWN' || format === 'MARKDOWN_INLINE') return '\n\n';
  return '\n';
};

/**
 * Decide which format the converted node should carry: keep the previous one if it's
 * still allowed for the new node type, otherwise fall back to the type's default.
 */
export const carryFormatOrDefault = (
  previousFormat: NodeFormat | undefined,
  nextType: ContentBearingNodeType
): NodeFormat => {
  if (previousFormat && canHaveFormat(nextType, previousFormat)) {
    return previousFormat;
  }
  return DEFAULT_FORMAT[nextType];
};

/**
 * Flatten a list (and any nested lists inside its list_items) to a sequence of
 * content nodes. Each list_item becomes one content node carrying the
 * list_item's `number`; any nested list is flattened recursively and emitted
 * after that content node. Other list_item children (extra content nodes,
 * headings, leaves) are lifted in source order.
 */
export function flattenListToContents(list: ContainerDocumentNode): DocumentNode[] {
  const out: DocumentNode[] = [];
  for (const item of list.children) {
    if (item.type !== 'LIST_ITEM') continue;
    const listItem = item as ContainerDocumentNode;

    const flattenedChildren: DocumentNode[] = [];
    let numberAttached = false;

    for (const child of listItem.children) {
      if (child.type === 'LIST') {
        flattenedChildren.push(...flattenListToContents(child as ContainerDocumentNode));
      } else if (child.type === 'CONTENT' && !numberAttached) {
        // Promote the first content child: it carries the list_item's id/number.
        const c = child as ContentDocumentNode;
        flattenedChildren.push({
          id: listItem.id,
          number: listItem.number,
          type: 'CONTENT',
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
        type: 'CONTENT',
        format: 'TEXT',
        contents: {},
        children: [],
      });
    }

    out.push(...flattenedChildren);
  }
  return out;
}

/**
 * Lift a node out of the LIST_ITEM that contains it, making it a sibling of the
 * enclosing LIST while preserving document reading order. The list_item and the
 * list are split around the node: anything that came before it stays in the
 * original list (placed before the lifted node); anything that came after moves
 * into a fresh list placed after the lifted node. Empty fragments are dropped.
 *
 * This is what lets a node whose type the LIST schema can't hold — most visibly
 * a HEADING that ended up inside a list — be "tabbed out" of the list (issue
 * #101, problem 4). A single level of lifting always lands in a valid parent:
 * a LIST's parent is always DOCUMENT, HEADING, or LIST_ITEM, all of which accept
 * every node type a list_item can hold.
 *
 * `path` points at the node to lift; its parent must be a LIST_ITEM. Returns
 * null when the structure isn't the expected LIST > LIST_ITEM > node shape
 * (e.g. a malformed list_item not inside a list), so odd inputs are left alone.
 */
export function liftNodeOutOfListItem(
  doc: ContainerDocumentNode,
  path: NodePath
): ContainerDocumentNode | null {
  const itemPath = path.slice(0, -1);
  const listPath = itemPath.slice(0, -1);

  const node = getNodeAtPath(doc, path);
  const item = getNodeAtPath(doc, itemPath);
  const list = listPath.length === 0 ? doc : getNodeAtPath(doc, listPath);
  if (!node || !item || item.type !== 'LIST_ITEM' || !list || list.type !== 'LIST') {
    return null;
  }

  const gpPath = listPath.slice(0, -1);
  const gp = gpPath.length === 0 ? doc : getNodeAtPath(doc, gpPath);
  if (!gp || !('children' in gp)) return null;

  const nodeIndexInItem = path[path.length - 1];
  const itemIndexInList = itemPath[itemPath.length - 1];
  const listIndexInGp = listPath[listPath.length - 1];

  const itemChildren = item.children;
  const beforeChildren = itemChildren.slice(0, nodeIndexInItem);
  const afterChildren = itemChildren.slice(nodeIndexInItem + 1);

  const listChildren = list.children;
  const itemsBefore = listChildren.slice(0, itemIndexInList);
  const itemsAfter = listChildren.slice(itemIndexInList + 1);

  // The "before" fragment of the split list_item keeps the original id/number —
  // it's the natural start of the item. Omitted when nothing precedes the node.
  const beforeItem: DocumentNode | null =
    beforeChildren.length > 0 ? { ...item, children: beforeChildren } : null;

  // The "after" fragment is a continuation: when there's a "before" fragment it
  // already owns the original id/number, so this one needs a fresh id and drops
  // the number (a duplicate label would mislead). With no "before" fragment it
  // IS the surviving remnant of the item, so it keeps the original id/number.
  const afterItem: DocumentNode | null =
    afterChildren.length > 0
      ? beforeItem
        ? { ...item, id: generateId(), number: null, children: afterChildren }
        : { ...item, children: afterChildren }
      : null;

  const beforeListChildren = [...itemsBefore, ...(beforeItem ? [beforeItem] : [])];
  const afterListChildren = [...(afterItem ? [afterItem] : []), ...itemsAfter];

  // Replace the single list entry in the grandparent with [beforeList?, node, afterList?].
  // The fragments are left unmerged on purpose: the lifted node sits between them
  // and `outdentNodes` (unlike the type-change paths) never calls
  // mergeAdjacentLists — re-joining a split list stays the user's explicit choice.
  const replacement: DocumentNode[] = [];
  if (beforeListChildren.length > 0) {
    replacement.push({ ...list, children: beforeListChildren });
  }
  replacement.push(node);
  if (afterListChildren.length > 0) {
    // Reuse the original list id only when the "before" list didn't claim it.
    const afterListId = beforeListChildren.length > 0 ? generateId() : list.id;
    replacement.push({ ...list, id: afterListId, children: afterListChildren });
  }

  const newGpChildren = [...gp.children];
  newGpChildren.splice(listIndexInGp, 1, ...replacement);

  if (gpPath.length === 0) {
    return { ...doc, children: newGpChildren };
  }
  return updateNodeAtPath(doc, gpPath, (n) => ({
    ...n,
    children: newGpChildren,
  }));
}

/** Create a new empty sibling node appropriate for the given parent. */
export function createNewSiblingNode(parent: DocumentNode, language: Language): DocumentNode {
  if (parent.type === 'LIST') {
    return {
      id: generateId(),
      number: null,
      type: 'LIST_ITEM',
      children: [
        {
          id: generateId(),
          number: null,
          type: 'CONTENT',
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
    type: 'CONTENT',
    format: 'TEXT',
    contents: { [language]: '' },
    children: [],
  } as ContentDocumentNode;
}

/**
 * Find the previous sibling that can accept the given node as a child.
 * - For footnotes: heading or content (both can have footnote children)
 * - For other nodes: heading only
 */
export const findPreviousSiblingTarget = (
  parent: DocumentNode,
  childIndex: number,
  nodeType: DocumentNode['type']
): { node: HeadingDocumentNode | ContentDocumentNode; index: number } | null => {
  if (!('children' in parent)) return null;

  for (let i = childIndex - 1; i >= 0; i--) {
    const sibling = parent.children[i];
    if (sibling.type === 'HEADING') {
      return { node: sibling as HeadingDocumentNode, index: i };
    }
    // Footnotes can also be nested under content nodes
    if (nodeType === 'FOOTNOTE' && sibling.type === 'CONTENT') {
      return { node: sibling as ContentDocumentNode, index: i };
    }
  }
  return null;
};

/**
 * Indent a single node in a document (pure function, no commit).
 * Returns the new document, or null if the operation can't be performed.
 */
export const indentNodeInDoc = (
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
  if (node.type === 'LIST_ITEM') {
    if (parent.type !== 'LIST' || childIndex === 0) return null;
    const prevSibling = parent.children[childIndex - 1];
    if (prevSibling.type !== 'LIST_ITEM') return null;
    const listItem = node as ContainerDocumentNode;

    const prevSiblingPath = [...parentPath, childIndex - 1];
    const prevChildren = (prevSibling as ContainerDocumentNode).children;
    const lastChild = prevChildren[prevChildren.length - 1];

    // Remove first; prevSibling's path and its own children are unaffected
    // because the removal touches the outer list, not prevSibling itself —
    // so prevChildren stays accurate for indexing into the nested list below.
    let newDoc = removeNodeAtPath(doc, path);

    if (lastChild && lastChild.type === 'LIST') {
      const nestedListPath = [...prevSiblingPath, prevChildren.length - 1];
      newDoc = updateNodeAtPath(newDoc, nestedListPath, (n) => ({
        ...n,
        children: [...(n as ContainerDocumentNode).children, listItem],
      }));
    } else {
      const newList: ContainerDocumentNode = {
        id: generateId(),
        number: null,
        type: 'LIST',
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
 * Outdent a single node in a document (pure function, no commit).
 * Returns the new document, or null if the operation can't be performed.
 */
export const outdentNodeInDoc = (
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

  // Issue #101: a node trapped inside a LIST_ITEM whose type the LIST can't
  // hold (most visibly a HEADING) is lifted out of the list — splitting the
  // list_item and the list around it so reading order is preserved.
  if (parent.type === 'LIST_ITEM') {
    return liftNodeOutOfListItem(doc, path);
  }

  if (parent.type !== 'HEADING' && parent.type !== 'LIST' && parent.type !== 'CONTENT') return null;

  // Special case: if parent is list and node is list_item
  if (parent.type === 'LIST' && node.type === 'LIST_ITEM') {
    const grandparentPath = parentPath.slice(0, -1);
    const parentIndexInGrandparent = parentPath[parentPath.length - 1];
    const grandparent = grandparentPath.length === 0 ? doc : getNodeAtPath(doc, grandparentPath);

    if (!grandparent || !('children' in grandparent)) return null;

    // Proper nested case: a list inside a list_item. Pop the list_item out
    // to be a sibling of the enclosing list_item in the outer list. If that
    // empties the nested list, drop it.
    if (grandparent.type === 'LIST_ITEM') {
      const greatGrandparentPath = grandparentPath.slice(0, -1);
      const grandparentIdxInGGP = grandparentPath[grandparentPath.length - 1];
      const greatGrandparent =
        greatGrandparentPath.length === 0 ? doc : getNodeAtPath(doc, greatGrandparentPath);
      if (!greatGrandparent || greatGrandparent.type !== 'LIST') return null;

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

/** List numbering styles. */
export type ListStyle = 'unordered' | 'numbered' | 'lettered';

/** Get the number string for a list item based on style and index. */
export const getNumberForStyle = (style: ListStyle, index: number): string | null => {
  switch (style) {
    case 'unordered':
      return null;
    case 'numbered':
      return `${index + 1}.`;
    case 'lettered':
      return `${String.fromCharCode(97 + index)}.`;
  }
};

/** Check if a node has contents (is leaf, heading, or content - not pure container). */
const hasContents = (
  node: DocumentNode
): node is LeafDocumentNode | HeadingDocumentNode | ContentDocumentNode => {
  return 'contents' in node;
};

/**
 * Extract a list_item from its list and convert to heading or content (pure function, no commit).
 * Returns the new document, or null if the operation can't be performed.
 */
export const extractAndConvertListItemInDoc = (
  doc: ContainerDocumentNode,
  itemPath: NodePath,
  item: ContainerDocumentNode,
  targetType: 'HEADING' | 'CONTENT'
): ContainerDocumentNode | null => {
  const listPath = itemPath.slice(0, -1);
  const itemIndexInList = itemPath[itemPath.length - 1];
  const list = getNodeAtPath(doc, listPath) as ContainerDocumentNode;

  if (!list || list.type !== 'LIST') return null;

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
    targetType === 'HEADING'
      ? ({
          id: item.id,
          number: item.number,
          type: 'HEADING',
          format: carryFormatOrDefault(childFormat, 'HEADING'),
          contents,
          children: [],
        } as HeadingDocumentNode)
      : ({
          id: item.id,
          number: item.number,
          type: 'CONTENT',
          format: carryFormatOrDefault(childFormat, 'CONTENT'),
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
 * Change the type of a single node in a document (pure function, no commit).
 * Returns the new document, or null if the operation can't be performed.
 */
export const changeNodeTypeInDoc = (
  doc: ContainerDocumentNode,
  idx: Map<string, NodePath>,
  id: string,
  targetType: 'HEADING' | 'CONTENT' | 'LIST' | 'FOOTNOTE',
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
  if (node.type === 'LIST_ITEM') {
    if (targetType === 'LIST') {
      // Change only this item's number (not all siblings)
      const style = listStyle || 'numbered';
      const indexInParent = path[path.length - 1];
      return updateNodeAtPath(doc, path, (n) => ({
        ...n,
        number: getNumberForStyle(style, indexInParent),
      }));
    }
    if (targetType === 'FOOTNOTE') {
      // list_item cannot be converted to footnote directly
      return null;
    }
    // Extract from list and convert
    return extractAndConvertListItemInDoc(doc, path, node as ContainerDocumentNode, targetType);
  }

  // Handle list node - can only change list style or flatten to content
  if (node.type === 'LIST') {
    if (targetType === 'LIST') {
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
    if (targetType === 'CONTENT') {
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
  if (targetType === 'FOOTNOTE') {
    if (node.type === 'FOOTNOTE') return null; // Already a footnote

    const carryFormat = carryFormatOrDefault((node as { format?: NodeFormat }).format, 'FOOTNOTE');

    // Create footnote node (leaf - no children)
    const footnoteNode: LeafDocumentNode = {
      id: node.id,
      number: node.number,
      type: 'FOOTNOTE',
      format: carryFormat,
      contents: node.contents,
    };

    // Replace node with footnote
    let newDoc = updateNodeAtPath(doc, path, () => footnoteNode);

    // If converting from heading or content with children, lift children as siblings
    if (node.type === 'HEADING') {
      const headingChildren = (node as HeadingDocumentNode).children;
      for (let i = 0; i < headingChildren.length; i++) {
        newDoc = insertNodeAtPath(newDoc, parentPath, nodeIdxInParent + 1 + i, headingChildren[i]);
      }
    } else if (node.type === 'CONTENT') {
      const contentChildren = (node as ContentDocumentNode).children;
      for (let i = 0; i < contentChildren.length; i++) {
        newDoc = insertNodeAtPath(newDoc, parentPath, nodeIdxInParent + 1 + i, contentChildren[i]);
      }
    }

    return newDoc;
  }

  // Handle conversion to heading
  if (targetType === 'HEADING') {
    if (node.type === 'HEADING') return null; // Already a heading

    const carryFormat = carryFormatOrDefault((node as { format?: NodeFormat }).format, 'HEADING');

    const newNode: HeadingDocumentNode = {
      id: node.id,
      number: node.number,
      type: 'HEADING',
      format: carryFormat,
      contents: node.contents,
      children: [],
    };

    return updateNodeAtPath(doc, path, () => newNode);
  }

  // Handle conversion to content
  if (targetType === 'CONTENT') {
    if (node.type === 'CONTENT') return null; // Already content

    const carryFormat = carryFormatOrDefault((node as { format?: NodeFormat }).format, 'CONTENT');

    const contentNode: ContentDocumentNode = {
      id: node.id,
      number: node.number,
      type: 'CONTENT',
      format: carryFormat,
      contents: node.contents,
      children: [],
    };

    let newDoc = updateNodeAtPath(doc, path, () => contentNode);

    // If converting from heading, lift children as siblings
    if (node.type === 'HEADING') {
      const headingChildren = (node as HeadingDocumentNode).children;
      for (let i = 0; i < headingChildren.length; i++) {
        newDoc = insertNodeAtPath(newDoc, parentPath, nodeIdxInParent + 1 + i, headingChildren[i]);
      }
    }
    // footnote -> content: no children to lift (footnote is a leaf node)

    return newDoc;
  }

  // Handle conversion to list
  if (targetType === 'LIST') {
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
      if (sibling.type !== 'LIST') break;
      effectiveIndex += (sibling as ContainerDocumentNode).children.length;
    }
    const itemNumber =
      style === 'unordered' ? node.number : getNumberForStyle(style, effectiveIndex);

    const listItem: ContainerDocumentNode = {
      id: generateId(),
      number: itemNumber,
      type: 'LIST_ITEM',
      children: [
        {
          id: node.id,
          number: null,
          type: 'CONTENT',
          format: 'TEXT',
          contents: node.contents,
          children: [],
        } as ContentDocumentNode,
      ],
    };

    const list: ContainerDocumentNode = {
      id: generateId(),
      number: null,
      type: 'LIST',
      children: [listItem],
    };

    let newDoc = updateNodeAtPath(doc, path, () => list);

    // If it was a heading, lift its children after the new list
    if (node.type === 'HEADING') {
      const headingChildren = (node as HeadingDocumentNode).children;
      for (let i = 0; i < headingChildren.length; i++) {
        newDoc = insertNodeAtPath(newDoc, parentPath, nodeIdxInParent + 1 + i, headingChildren[i]);
      }
    }

    // Merge adjacent lists in the parent
    newDoc = mergeAdjacentLists(newDoc, parentPath);

    return newDoc;
  }

  return null;
};

/**
 * Merge a contiguous run of same-parent, same-type siblings into a single node
 * (pure function, no commit). The first node keeps its id and number; trailing
 * siblings are removed. Content-bearing nodes have their text joined per
 * language (`"\n"` for content/footnote, `" "` for heading) and their children
 * appended in source order. Container nodes (list, list_item) just concatenate
 * their children.
 *
 * Returns the new document, or null when the selection doesn't qualify — see
 * `resolveMergeTargets`.
 */
export const mergeNodesInDoc = (
  ids: readonly string[],
  doc: ContainerDocumentNode,
  nodeIndex: Map<string, NodePath>
): ContainerDocumentNode | null => {
  const paths = resolveMergeTargets(ids, doc, nodeIndex);
  if (!paths) return null;

  const nodes = paths.map((p) => getNodeAtPath(doc, p)!) as DocumentNode[];
  const firstPath = paths[0];
  const firstNode = nodes[0];

  let mergedNode: DocumentNode;

  if (firstNode.type === 'HEADING') {
    const headings = nodes as HeadingDocumentNode[];
    mergedNode = {
      id: firstNode.id,
      number: firstNode.number,
      type: 'HEADING',
      format: mergeFormatOf(
        headings.map((n) => n.format),
        'HEADING'
      ),
      contents: mergeContentsFromNodes(headings, ' '),
      children: headings.flatMap((n) => n.children),
    };
  } else if (firstNode.type === 'CONTENT') {
    const contents = nodes as ContentDocumentNode[];
    const format = mergeFormatOf(
      contents.map((n) => n.format),
      'CONTENT'
    );
    mergedNode = {
      id: firstNode.id,
      number: firstNode.number,
      type: 'CONTENT',
      format,
      contents: mergeContentsFromNodes(contents, paragraphSeparatorFor(format)),
      children: contents.flatMap((n) => n.children),
    };
  } else if (firstNode.type === 'FOOTNOTE') {
    const footnotes = nodes as LeafDocumentNode[];
    const format = mergeFormatOf(
      footnotes.map((n) => n.format),
      'FOOTNOTE'
    );
    mergedNode = {
      id: firstNode.id,
      number: firstNode.number,
      type: 'FOOTNOTE',
      format,
      contents: mergeContentsFromNodes(footnotes, paragraphSeparatorFor(format)),
    };
  } else if (firstNode.type === 'LIST' || firstNode.type === 'LIST_ITEM') {
    const containers = nodes as ContainerDocumentNode[];
    mergedNode = {
      id: firstNode.id,
      number: firstNode.number,
      type: firstNode.type,
      children: containers.flatMap((n) => n.children),
    };
  } else {
    // Unreachable: resolveMergeTargets already rejected non-mergeable types.
    return null;
  }

  let newDoc = updateNodeAtPath(doc, firstPath, () => mergedNode);
  // Remove trailing sources in reverse index order so paths stay valid.
  for (let i = paths.length - 1; i >= 1; i--) {
    newDoc = removeNodeAtPath(newDoc, paths[i]);
  }
  return newDoc;
};

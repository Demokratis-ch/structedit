import { describe, expect, test } from 'vitest';
import type {
  BlockDocumentNode,
  ContentDocumentNode,
  ContentGroupDocumentNode,
  DefinitionListDocumentNode,
  DocumentRootNode,
  FootnoteDocumentNode,
  HeadingDocumentNode,
  ImageDocumentNode,
  ListDocumentNode,
  ListItemDocumentNode,
  NodeFormat,
  NumberedDocumentNode,
  TableDocumentNode,
} from '../types/document';
import { isValidDocument } from '../types/document';
import type { NodePath } from '../types/editor';
import {
  canMergeIdsInDoc,
  carryFormatOrDefault,
  changeNodeTypeInDoc,
  createNewSiblingNode,
  extractAndConvertListItemInDoc,
  findPreviousSiblingTarget,
  flattenListToContents,
  getNumberForStyle,
  indentNodeInDoc,
  keepOutermostIds,
  liftNodeOutOfListItem,
  mergeNodesInDoc,
  outdentNodeInDoc,
  resolveMergeTargets,
} from './tree-mutations';
import { buildIndices, getNodeAtPath } from './tree-utils';

const content = (id: string, text: string, number: string | null = null): ContentDocumentNode => ({
  id,
  number,
  type: 'CONTENT',
  format: 'TEXT',
  contents: { de: text },
  children: [],
});

const heading = (id: string, text: string, number: string | null = null): HeadingDocumentNode => ({
  id,
  number,
  type: 'HEADING',
  format: 'TEXT',
  contents: { de: text },
  children: [],
});

const listItem = (
  id: string,
  text: string,
  number: string | null = null
): ListItemDocumentNode => ({
  id,
  number,
  type: 'LIST_ITEM',
  children: [content(`${id}-c`, text)],
});

const footnote = (id: string, text: string, format: NodeFormat = 'TEXT'): FootnoteDocumentNode => ({
  id,
  number: null,
  type: 'FOOTNOTE',
  format,
  contents: { de: text },
});

const list = (id: string, children: ListItemDocumentNode[]): ListDocumentNode => ({
  id,
  number: null,
  type: 'LIST',
  children,
});

const doc = (children: BlockDocumentNode[]): DocumentRootNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children,
});

const idx = (d: DocumentRootNode): Map<string, NodePath> => buildIndices(d).nodeIndex;

describe('keepOutermostIds', () => {
  test('drops a descendant id when its ancestor is also present, preserving order', () => {
    const h: HeadingDocumentNode = { ...heading('h1', 'H'), children: [content('p1', 'p')] };
    const d = doc([h]);
    expect(keepOutermostIds(['h1', 'p1'], idx(d))).toEqual(['h1']);
    // order of survivors follows input order
    expect(keepOutermostIds(['p1', 'h1'], idx(d))).toEqual(['h1']);
  });

  test('returns all ids when none is an ancestor of another', () => {
    const d = doc([heading('h1', 'A'), heading('h2', 'B')]);
    expect(keepOutermostIds(['h1', 'h2'], idx(d))).toEqual(['h1', 'h2']);
  });

  test('skips ids missing from the index', () => {
    const d = doc([heading('h1', 'A')]);
    expect(keepOutermostIds(['h1', 'ghost'], idx(d))).toEqual(['h1']);
  });
});

describe('resolveMergeTargets', () => {
  test('returns null for fewer than two ids', () => {
    const d = doc([heading('h1', 'A'), heading('h2', 'B')]);
    expect(resolveMergeTargets(['h1'], d, idx(d))).toBeNull();
  });

  test('returns null when ids have different parents', () => {
    const d = doc([{ ...heading('h1', 'A'), children: [content('p1', 'x')] }, heading('h2', 'B')]);
    expect(resolveMergeTargets(['p1', 'h2'], d, idx(d))).toBeNull();
  });

  test('returns null when ids are not contiguous siblings', () => {
    const d = doc([heading('h1', 'A'), heading('h2', 'B'), heading('h3', 'C')]);
    expect(resolveMergeTargets(['h1', 'h3'], d, idx(d))).toBeNull();
  });

  test('returns null when sibling types differ', () => {
    const d = doc([{ ...heading('h1', 'A'), children: [content('p1', 'x'), heading('h2', 'B')] }]);
    expect(resolveMergeTargets(['p1', 'h2'], d, idx(d))).toBeNull();
  });

  test('returns sorted paths for a valid contiguous same-type run', () => {
    const d = doc([heading('h1', 'A'), heading('h2', 'B'), heading('h3', 'C')]);
    // pass out of order to confirm it sorts
    expect(resolveMergeTargets(['h2', 'h1'], d, idx(d))).toEqual([[0], [1]]);
  });

  test('filters out descendant ids (outermost wins) without blocking the merge', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [listItem('li1', 'one'), listItem('li2', 'two')],
    };
    const d = doc([list]);
    // li1-c is a descendant of li1; it must be filtered, leaving li1+li2 mergeable
    expect(resolveMergeTargets(['li1', 'li1-c', 'li2'], d, idx(d))).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });
});

describe('canMergeIdsInDoc', () => {
  test('true for a valid run, false otherwise', () => {
    const d = doc([heading('h1', 'A'), heading('h2', 'B'), heading('h3', 'C')]);
    expect(canMergeIdsInDoc(['h1', 'h2'], d, idx(d))).toBe(true);
    expect(canMergeIdsInDoc(['h1', 'h3'], d, idx(d))).toBe(false);
  });
});

describe('carryFormatOrDefault', () => {
  test('keeps the previous format when valid for the target type', () => {
    expect(carryFormatOrDefault('MARKDOWN', 'CONTENT')).toBe('MARKDOWN');
  });

  test('falls back to the default when the previous format is disallowed', () => {
    // MARKDOWN is not allowed for HEADING -> default TEXT
    expect(carryFormatOrDefault('MARKDOWN', 'HEADING')).toBe('TEXT');
  });

  test('falls back to the default when no previous format is given', () => {
    expect(carryFormatOrDefault(undefined, 'CONTENT')).toBe('TEXT');
  });
});

describe('flattenListToContents', () => {
  test('turns each list_item into a content node carrying its number', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [listItem('li1', 'one', '1.'), listItem('li2', 'two', '2.')],
    };
    const out = flattenListToContents(list);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'li1', type: 'CONTENT', number: '1.' });
    expect((out[0] as ContentDocumentNode).contents).toEqual({ de: 'one' });
    expect(out[1]).toMatchObject({ id: 'li2', type: 'CONTENT', number: '2.' });
  });

  test('synthesizes a placeholder content node when a list_item has no content child', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [{ id: 'li1', number: '1.', type: 'LIST_ITEM', children: [] }],
    };
    const out = flattenListToContents(list);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'li1', type: 'CONTENT', number: '1.' });
  });

  test('recursively flattens nested lists after the carrying content node', () => {
    const nested: ListDocumentNode = {
      id: 'nested',
      number: null,
      type: 'LIST',
      children: [listItem('li1a', 'inner', 'a.')],
    };
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [
        {
          id: 'li1',
          number: '1.',
          type: 'LIST_ITEM',
          children: [content('li1-c', 'outer'), nested],
        },
      ],
    };
    const out = flattenListToContents(list);
    expect(out.map((n) => n.id)).toEqual(['li1', 'li1a']);
    expect(out[0]).toMatchObject({ number: '1.', type: 'CONTENT' });
    expect(out[1]).toMatchObject({ number: 'a.', type: 'CONTENT' });
  });
});

describe('createNewSiblingNode', () => {
  test('creates a LIST_ITEM with a CONTENT child when the parent is a LIST', () => {
    const parent: ListDocumentNode = { id: 'l', number: null, type: 'LIST', children: [] };
    const node = createNewSiblingNode(parent, 'de') as ListItemDocumentNode;
    expect(node.type).toBe('LIST_ITEM');
    expect(node.children[0].type).toBe('CONTENT');
    expect((node.children[0] as ContentDocumentNode).contents).toEqual({ de: '' });
  });

  test('creates a CONTENT node for non-list parents', () => {
    const parent = heading('h1', 'H');
    const node = createNewSiblingNode(parent, 'de');
    expect(node.type).toBe('CONTENT');
    expect((node as ContentDocumentNode).contents).toEqual({ de: '' });
  });
});

describe('findPreviousSiblingTarget', () => {
  test('returns the nearest preceding HEADING', () => {
    const parent: DocumentRootNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [heading('h1', 'A'), content('p1', 'x'), content('p2', 'y')],
    };
    const target = findPreviousSiblingTarget(parent, 2, 'CONTENT');
    expect(target).toEqual({ node: parent.children[0], index: 0 });
  });

  test('returns a preceding CONTENT node for a FOOTNOTE', () => {
    const parent: DocumentRootNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [content('p1', 'x'), heading('hh', 'H')],
    };
    // A FOOTNOTE can nest under a CONTENT sibling (a non-footnote could not).
    const target = findPreviousSiblingTarget(parent, 1, 'FOOTNOTE');
    expect(target).toEqual({ node: parent.children[0], index: 0 });
  });

  test('returns null when nothing qualifies', () => {
    const parent: DocumentRootNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [content('p1', 'x'), content('p2', 'y')],
    };
    expect(findPreviousSiblingTarget(parent, 1, 'CONTENT')).toBeNull();
  });
});

describe('indentNodeInDoc', () => {
  test('nests a content node under the preceding heading sibling', () => {
    const d = doc([heading('h1', 'A'), content('p1', 'x')]);
    const result = indentNodeInDoc(d, idx(d), 'p1');
    expect(result).not.toBeNull();
    const h1 = getNodeAtPath(result!, [0]) as HeadingDocumentNode;
    expect(h1.children.map((c) => c.id)).toEqual(['p1']);
    expect(result!.children).toHaveLength(1);
  });

  test('nests a list_item under the preceding list_item via a new nested list', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [listItem('li1', 'one'), listItem('li2', 'two')],
    };
    const d = doc([list]);
    const result = indentNodeInDoc(d, idx(d), 'li2');
    expect(result).not.toBeNull();
    const li1 = getNodeAtPath(result!, [0, 0]) as ListItemDocumentNode;
    const nested = li1.children.find((c) => c.type === 'LIST') as ListDocumentNode;
    expect(nested).toBeDefined();
    expect(nested.children.map((c) => c.id)).toEqual(['li2']);
  });

  test('returns null when there is no valid target', () => {
    const d = doc([content('p1', 'x'), content('p2', 'y')]);
    expect(indentNodeInDoc(d, idx(d), 'p1')).toBeNull(); // first child, nothing before
  });
});

describe('outdentNodeInDoc', () => {
  test('moves a nested node to be a sibling of its parent', () => {
    const h: HeadingDocumentNode = { ...heading('h1', 'A'), children: [content('p1', 'x')] };
    const d = doc([h]);
    const result = outdentNodeInDoc(d, idx(d), 'p1');
    expect(result).not.toBeNull();
    expect(result!.children.map((c) => c.id)).toEqual(['h1', 'p1']);
    expect((getNodeAtPath(result!, [0]) as HeadingDocumentNode).children).toHaveLength(0);
  });

  test('lifts a node out of a list_item, splitting the list around it (issue #101)', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [
        {
          id: 'li1',
          number: '1.',
          type: 'LIST_ITEM',
          children: [content('before', 'b'), heading('trapped', 'T'), content('after', 'a')],
        },
      ],
    };
    const d = doc([list]);
    const idMap = idx(d);
    const result = outdentNodeInDoc(d, idMap, 'trapped');
    expect(result).not.toBeNull();
    // heading is lifted to be a sibling of the (split) list at document level
    const types = result!.children.map((c) => c.type);
    expect(types).toContain('HEADING');
    const headingIndex = result!.children.findIndex((c) => c.id === 'trapped');
    expect(result!.children[headingIndex].type).toBe('HEADING');
    // a list fragment precedes and a list fragment follows the lifted heading
    expect(result!.children[headingIndex - 1].type).toBe('LIST');
    expect(result!.children[headingIndex + 1].type).toBe('LIST');
  });

  test('pops a list_item out of a nested list, dropping the now-empty inner list', () => {
    // outer list > li1 [content, inner list > [li1a]] , li2
    // Outdenting li1a makes it a sibling of li1; the emptied inner list is removed.
    const inner = list('inner', [listItem('li1a', 'nested')]);
    const li1: ListItemDocumentNode = {
      id: 'li1',
      number: '1.',
      type: 'LIST_ITEM',
      children: [content('li1-c', 'x'), inner],
    };
    const d = doc([list('outer', [li1, listItem('li2', 'two', '2.')])]);
    const result = outdentNodeInDoc(d, idx(d), 'li1a');
    expect(result).not.toBeNull();
    const outer = getNodeAtPath(result!, [0]) as ListDocumentNode;
    // li1a is now a sibling of li1, between it and li2
    expect(outer.children.map((c) => c.id)).toEqual(['li1', 'li1a', 'li2']);
    // the emptied nested list inside li1 was dropped
    const li1After = outer.children[0] as ListItemDocumentNode;
    expect(li1After.children.some((c) => c.type === 'LIST')).toBe(false);
  });

  test('returns null for a top-level node', () => {
    const d = doc([heading('h1', 'A')]);
    expect(outdentNodeInDoc(d, idx(d), 'h1')).toBeNull();
  });
});

describe('liftNodeOutOfListItem', () => {
  test('splits the list_item and list around the lifted node, preserving order', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [
        {
          id: 'li1',
          number: '1.',
          type: 'LIST_ITEM',
          children: [content('before', 'b'), heading('mid', 'M'), content('after', 'a')],
        },
      ],
    };
    const d = doc([list]);
    const path: NodePath = [0, 0, 1]; // the heading inside the list_item
    const result = liftNodeOutOfListItem(d, path);
    expect(result).not.toBeNull();
    const ids = result!.children.map((c) => c.id);
    const midIndex = ids.indexOf('mid');
    expect(midIndex).toBeGreaterThan(0);
    expect(result!.children[midIndex].type).toBe('HEADING');
    expect(result!.children[midIndex - 1].type).toBe('LIST');
    expect(result!.children[midIndex + 1].type).toBe('LIST');
  });

  test('returns null when the path is not inside a list_item', () => {
    const d = doc([heading('h1', 'A')]);
    expect(liftNodeOutOfListItem(d, [0])).toBeNull();
  });
});

describe('getNumberForStyle', () => {
  test('produces null / decimal / lettered labels', () => {
    expect(getNumberForStyle('unordered', 0)).toBeNull();
    expect(getNumberForStyle('numbered', 2)).toBe('3.');
    expect(getNumberForStyle('lettered', 0)).toBe('a.');
  });
});

describe('changeNodeTypeInDoc', () => {
  test('converts a content node to a heading', () => {
    const d = doc([content('p1', 'x', '5')]);
    const result = changeNodeTypeInDoc(d, idx(d), 'p1', 'HEADING');
    expect(result).not.toBeNull();
    const node = getNodeAtPath(result!, [0]) as HeadingDocumentNode;
    expect(node.type).toBe('HEADING');
    expect(node.id).toBe('p1');
    expect(node.number).toBe('5');
  });

  test('converts a content node to a list with style numbering', () => {
    const d = doc([content('p1', 'x')]);
    const result = changeNodeTypeInDoc(d, idx(d), 'p1', 'LIST', 'numbered');
    expect(result).not.toBeNull();
    const list = getNodeAtPath(result!, [0]) as ListDocumentNode;
    expect(list.type).toBe('LIST');
    expect(list.children[0].type).toBe('LIST_ITEM');
    expect((list.children[0] as NumberedDocumentNode).number).toBe('1.');
  });

  test('flattens a list to content nodes', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [listItem('li1', 'one', '1.'), listItem('li2', 'two', '2.')],
    };
    const d = doc([list]);
    const result = changeNodeTypeInDoc(d, idx(d), 'list1', 'CONTENT');
    expect(result).not.toBeNull();
    expect(result!.children.map((c) => c.type)).toEqual(['CONTENT', 'CONTENT']);
    expect(result!.children.map((c) => c.id)).toEqual(['li1', 'li2']);
  });

  test('extracts a list_item to a content node, preserving its number', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [listItem('li1', 'one', '1.'), listItem('li2', 'two', '2.')],
    };
    const d = doc([list]);
    const result = changeNodeTypeInDoc(d, idx(d), 'li1', 'CONTENT');
    expect(result).not.toBeNull();
    const converted = result!.children.find((c) => c.id === 'li1') as ContentDocumentNode;
    expect(converted.type).toBe('CONTENT');
    expect(converted.number).toBe('1.');
  });

  test('converts a heading to a footnote, lifting its children as siblings', () => {
    const h: HeadingDocumentNode = {
      ...heading('h1', 'H'),
      children: [content('c1', 'x'), content('c2', 'y')],
    };
    const d = doc([h]);
    const result = changeNodeTypeInDoc(d, idx(d), 'h1', 'FOOTNOTE');
    expect(result).not.toBeNull();
    expect(result!.children.map((c) => c.type)).toEqual(['FOOTNOTE', 'CONTENT', 'CONTENT']);
    expect(result!.children.map((c) => c.id)).toEqual(['h1', 'c1', 'c2']);
  });

  test('renumbers across a preceding adjacent list and merges into it', () => {
    // Converting the trailing content to a numbered list must continue the
    // preceding list's sequence (3.) and fold into it via mergeAdjacentLists.
    const d = doc([
      list('l1', [listItem('a', 'one', '1.'), listItem('b', 'two', '2.')]),
      content('p1', 'three'),
    ]);
    const result = changeNodeTypeInDoc(d, idx(d), 'p1', 'LIST', 'numbered');
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    const merged = result!.children[0] as ListDocumentNode;
    expect(merged.type).toBe('LIST');
    expect(merged.children.map((c) => (c as NumberedDocumentNode).number)).toEqual([
      '1.',
      '2.',
      '3.',
    ]);
  });

  test('returns null for the root node', () => {
    const d = doc([heading('h1', 'A')]);
    expect(changeNodeTypeInDoc(d, idx(d), 'root', 'CONTENT')).toBeNull();
  });
});

describe('extractAndConvertListItemInDoc', () => {
  test('replaces a single-item list with the converted node', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [listItem('li1', 'one', '1.')],
    };
    const d = doc([list]);
    const item = getNodeAtPath(d, [0, 0]) as ListItemDocumentNode;
    const result = extractAndConvertListItemInDoc(d, [0, 0], item, 'CONTENT');
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    expect(result!.children[0]).toMatchObject({ id: 'li1', type: 'CONTENT', number: '1.' });
  });

  test('inserts the converted first item before the surviving list', () => {
    const list: ListDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [listItem('li1', 'one', '1.'), listItem('li2', 'two', '2.')],
    };
    const d = doc([list]);
    const item = getNodeAtPath(d, [0, 0]) as ListItemDocumentNode;
    const result = extractAndConvertListItemInDoc(d, [0, 0], item, 'HEADING');
    expect(result).not.toBeNull();
    expect(result!.children[0]).toMatchObject({ id: 'li1', type: 'HEADING', number: '1.' });
    expect(result!.children[1].type).toBe('LIST');
    expect((result!.children[1] as ListDocumentNode).children).toHaveLength(1);
  });
});

describe('mergeNodesInDoc', () => {
  test('merges contiguous content siblings, joining text and appending children', () => {
    const p1: ContentDocumentNode = { ...content('p1', 'one'), children: [footnote('p1a', 'kid')] };
    const p2 = content('p2', 'two');
    const d = doc([p1, p2]);
    const result = mergeNodesInDoc(['p1', 'p2'], d, idx(d));
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    const merged = result!.children[0] as ContentDocumentNode;
    expect(merged.id).toBe('p1');
    expect(merged.contents.de).toBe('one\ntwo');
    expect(merged.children.map((c) => c.id)).toEqual(['p1a']);
  });

  test('merges headings with a space separator', () => {
    const d = doc([heading('h1', 'Hello'), heading('h2', 'World')]);
    const result = mergeNodesInDoc(['h1', 'h2'], d, idx(d));
    expect(result).not.toBeNull();
    const merged = result!.children[0] as HeadingDocumentNode;
    expect(merged.contents.de).toBe('Hello World');
  });

  test('floors merged TEXT content to NEWLINES and joins with a single newline', () => {
    // Both sources are TEXT; the join inserts a literal "\n", so the result
    // must be at least NEWLINES (TEXT would render the break as a space).
    const d = doc([content('p1', 'one'), content('p2', 'two')]);
    const result = mergeNodesInDoc(['p1', 'p2'], d, idx(d));
    const merged = result!.children[0] as ContentDocumentNode;
    expect(merged.format).toBe('NEWLINES');
    expect(merged.contents.de).toBe('one\ntwo');
  });

  test('keeps MARKDOWN content format and joins paragraphs with a blank line', () => {
    const p1: ContentDocumentNode = { ...content('p1', 'one'), format: 'MARKDOWN' };
    const p2: ContentDocumentNode = { ...content('p2', 'two'), format: 'MARKDOWN' };
    const d = doc([p1, p2]);
    const result = mergeNodesInDoc(['p1', 'p2'], d, idx(d));
    const merged = result!.children[0] as ContentDocumentNode;
    expect(merged.format).toBe('MARKDOWN');
    expect(merged.contents.de).toBe('one\n\ntwo');
  });

  test('merges contiguous footnote leaves (no children, NEWLINES join)', () => {
    const h: HeadingDocumentNode = {
      ...heading('h1', 'H'),
      children: [footnote('f1', 'a'), footnote('f2', 'b')],
    };
    const d = doc([h]);
    const result = mergeNodesInDoc(['f1', 'f2'], d, idx(d));
    expect(result).not.toBeNull();
    const parent = getNodeAtPath(result!, [0]) as HeadingDocumentNode;
    expect(parent.children).toHaveLength(1);
    const merged = parent.children[0] as FootnoteDocumentNode;
    expect(merged.type).toBe('FOOTNOTE');
    expect(merged.id).toBe('f1');
    expect(merged.contents.de).toBe('a\nb');
    expect('children' in merged).toBe(false);
  });

  test('merges adjacent list containers by concatenating their children', () => {
    const d = doc([
      list('l1', [listItem('a', 'one', '1.'), listItem('b', 'two', '2.')]),
      list('l2', [listItem('c', 'three', '3.')]),
    ]);
    const result = mergeNodesInDoc(['l1', 'l2'], d, idx(d));
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    const merged = result!.children[0] as ListDocumentNode;
    expect(merged.type).toBe('LIST');
    expect(merged.id).toBe('l1');
    expect(merged.children.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  test('returns null when the selection cannot be merged', () => {
    const d = doc([heading('h1', 'A'), heading('h2', 'B'), heading('h3', 'C')]);
    expect(mergeNodesInDoc(['h1', 'h3'], d, idx(d))).toBeNull();
  });
});

describe('changeNodeTypeInDoc — parent-validity guard', () => {
  // A footnote may live under a CONTENT node, but ALLOWED_CHILDREN.CONTENT is ['FOOTNOTE'] only.
  // The in-place conversions replace the node where it stands, so without a parent check they can
  // leave a node its parent may not hold — reachable from the UI by selecting such a footnote and
  // pressing H.
  const footnoteUnderContent = (): DocumentRootNode => {
    const c: ContentDocumentNode = { ...content('c1', 'body'), children: [footnote('f1', 'note')] };
    return doc([c]);
  };

  test('refuses to convert a footnote under a content node to a heading', () => {
    const d = footnoteUnderContent();
    expect(changeNodeTypeInDoc(d, idx(d), 'f1', 'HEADING')).toBeNull();
  });

  test('refuses to convert it to content, which the parent may not hold either', () => {
    const d = footnoteUnderContent();
    expect(changeNodeTypeInDoc(d, idx(d), 'f1', 'CONTENT')).toBeNull();
  });

  test('still allows the same conversion where the parent permits it', () => {
    // Under a HEADING, both HEADING and CONTENT are allowed children.
    const h: HeadingDocumentNode = { ...heading('h1', 'H'), children: [footnote('f1', 'note')] };
    const d = doc([h]);
    const asHeading = changeNodeTypeInDoc(d, idx(d), 'f1', 'HEADING');
    expect(asHeading).not.toBeNull();
    expect(isValidDocument(asHeading as DocumentRootNode)).toBe(true);
    expect(changeNodeTypeInDoc(d, idx(d), 'f1', 'CONTENT')).not.toBeNull();
  });

  test('leaves the document valid wherever a conversion is allowed to proceed', () => {
    const d = doc([content('c1', 'x'), heading('h1', 'H')]);
    for (const [id, target] of [
      ['c1', 'HEADING'],
      ['h1', 'CONTENT'],
      ['c1', 'FOOTNOTE'],
    ] as const) {
      const out = changeNodeTypeInDoc(d, idx(d), id, target);
      if (out) expect(isValidDocument(out)).toBe(true);
    }
  });
});

/**
 * ====================== Platform node types (issue #150) ======================
 */

const table = (id: string, source = '| a | b |\n| - | - |\n| 1 | 2 |'): TableDocumentNode => ({
  id,
  number: '',
  type: 'TABLE',
  format: 'MARKDOWN',
  contents: { de: source },
});

const definitionList = (id: string, source = 'Bund :: Staat'): DefinitionListDocumentNode => ({
  id,
  number: '',
  type: 'DEFINITION_LIST',
  format: 'MARKDOWN',
  contents: { de: source },
});

const image = (id: string): ImageDocumentNode => ({
  id,
  number: null,
  type: 'IMAGE',
  format: 'TEXT',
  contents: { de: 'x.png' },
});

const group = (
  id: string,
  number: string | null,
  children: ContentGroupDocumentNode['children']
): ContentGroupDocumentNode => ({
  id,
  number,
  type: 'CONTENT_GROUP',
  contents: {},
  format: 'TEXT',
  children,
});

describe('changeNodeTypeInDoc — text nodes ↔ TABLE / DEFINITION_LIST', () => {
  test('converts a content node to a table in place, keeping id/number/contents', () => {
    const d = doc([content('p1', '| a |', '3')]);
    const result = changeNodeTypeInDoc(d, idx(d), 'p1', 'TABLE');
    expect(result).not.toBeNull();
    const node = getNodeAtPath(result!, [0]) as TableDocumentNode;
    expect(node).toEqual({
      id: 'p1',
      number: '3',
      type: 'TABLE',
      format: 'MARKDOWN',
      contents: { de: '| a |' },
    });
    expect('children' in node).toBe(false);
    expect(isValidDocument(result!)).toBe(true);
  });

  test('lifts footnote children as following siblings when content becomes a table', () => {
    const c: ContentDocumentNode = { ...content('p1', 'x'), children: [footnote('f1', 'note')] };
    const d = doc([c, content('p2', 'after')]);
    const result = changeNodeTypeInDoc(d, idx(d), 'p1', 'TABLE');
    expect(result!.children.map((n) => [n.type, n.id])).toEqual([
      ['TABLE', 'p1'],
      ['FOOTNOTE', 'f1'],
      ['CONTENT', 'p2'],
    ]);
    expect(isValidDocument(result!)).toBe(true);
  });

  test("lifts a heading's children when it becomes a definition list", () => {
    const h: HeadingDocumentNode = {
      ...heading('h1', 'Begriffe', 'Art. 2'),
      format: 'MARKDOWN_MINIMAL',
      children: [content('c1', 'x'), list('l1', [listItem('li1', 'one', '1.')])],
    };
    const d = doc([h]);
    const result = changeNodeTypeInDoc(d, idx(d), 'h1', 'DEFINITION_LIST');
    expect(result!.children.map((n) => [n.type, n.id])).toEqual([
      ['DEFINITION_LIST', 'h1'],
      ['CONTENT', 'c1'],
      ['LIST', 'l1'],
    ]);
    const dl = result!.children[0] as DefinitionListDocumentNode;
    expect(dl.number).toBe('Art. 2');
    expect(dl.format).toBe('MARKDOWN');
    expect(dl.contents).toEqual({ de: 'Begriffe' });
    expect(isValidDocument(result!)).toBe(true);
  });

  test('a footnote becomes a table where the parent allows it', () => {
    const h: HeadingDocumentNode = { ...heading('h1', 'H'), children: [footnote('f1', 'note')] };
    const d = doc([h]);
    const result = changeNodeTypeInDoc(d, idx(d), 'f1', 'TABLE');
    expect(result).not.toBeNull();
    expect((getNodeAtPath(result!, [0, 0]) as TableDocumentNode).type).toBe('TABLE');
    expect(isValidDocument(result!)).toBe(true);
  });

  test('refuses to convert a footnote under a content node to a table', () => {
    const c: ContentDocumentNode = { ...content('c1', 'body'), children: [footnote('f1', 'note')] };
    const d = doc([c]);
    expect(changeNodeTypeInDoc(d, idx(d), 'f1', 'TABLE')).toBeNull();
    expect(changeNodeTypeInDoc(d, idx(d), 'f1', 'DEFINITION_LIST')).toBeNull();
  });

  test('refuses to convert a content node inside a content group to a table', () => {
    const d = doc([group('g1', '2', [content('c1', 'x')])]);
    expect(changeNodeTypeInDoc(d, idx(d), 'c1', 'TABLE')).toBeNull();
  });

  test('converts a table to a heading with the heading default format', () => {
    const d = doc([table('t1')]);
    const result = changeNodeTypeInDoc(d, idx(d), 't1', 'HEADING');
    const h = getNodeAtPath(result!, [0]) as HeadingDocumentNode;
    expect(h.type).toBe('HEADING');
    expect(h.format).toBe('TEXT');
    expect(h.contents).toEqual({ de: '| a | b |\n| - | - |\n| 1 | 2 |' });
    expect(h.children).toEqual([]);
    expect(isValidDocument(result!)).toBe(true);
  });

  test('converts a table to content and to a footnote, carrying MARKDOWN', () => {
    const d = doc([table('t1'), definitionList('d1')]);
    const asContent = getNodeAtPath(
      changeNodeTypeInDoc(d, idx(d), 't1', 'CONTENT')!,
      [0]
    ) as ContentDocumentNode;
    expect(asContent.type).toBe('CONTENT');
    expect(asContent.format).toBe('MARKDOWN');
    expect(asContent.children).toEqual([]);
    const asFootnote = getNodeAtPath(
      changeNodeTypeInDoc(d, idx(d), 'd1', 'FOOTNOTE')!,
      [1]
    ) as FootnoteDocumentNode;
    expect(asFootnote.type).toBe('FOOTNOTE');
    expect(asFootnote.format).toBe('MARKDOWN');
  });

  test('converts a table to a list item like any other text node', () => {
    const d = doc([table('t1')]);
    const result = changeNodeTypeInDoc(d, idx(d), 't1', 'LIST', 'numbered');
    const l = getNodeAtPath(result!, [0]) as ListDocumentNode;
    expect(l.type).toBe('LIST');
    expect(l.children[0].children[0].id).toBe('t1');
    expect(isValidDocument(result!)).toBe(true);
  });

  test('swaps table and definition list in place', () => {
    const d = doc([table('t1'), definitionList('d1')]);
    const r1 = changeNodeTypeInDoc(d, idx(d), 't1', 'DEFINITION_LIST')!;
    expect(getNodeAtPath(r1, [0])).toEqual({ ...table('t1'), type: 'DEFINITION_LIST' });
    const r2 = changeNodeTypeInDoc(d, idx(d), 'd1', 'TABLE')!;
    expect(getNodeAtPath(r2, [1])).toEqual({ ...definitionList('d1'), type: 'TABLE' });
  });

  test('returns null when the node already has the target type', () => {
    const d = doc([table('t1'), definitionList('d1')]);
    expect(changeNodeTypeInDoc(d, idx(d), 't1', 'TABLE')).toBeNull();
    expect(changeNodeTypeInDoc(d, idx(d), 'd1', 'DEFINITION_LIST')).toBeNull();
  });

  test('refuses to convert lists and list items to tables or definition lists', () => {
    const d = doc([list('l1', [listItem('li1', 'one', '1.')])]);
    expect(changeNodeTypeInDoc(d, idx(d), 'l1', 'TABLE')).toBeNull();
    expect(changeNodeTypeInDoc(d, idx(d), 'l1', 'DEFINITION_LIST')).toBeNull();
    expect(changeNodeTypeInDoc(d, idx(d), 'li1', 'TABLE')).toBeNull();
    expect(changeNodeTypeInDoc(d, idx(d), 'li1', 'DEFINITION_LIST')).toBeNull();
  });
});

describe('changeNodeTypeInDoc — wrapping into a CONTENT_GROUP', () => {
  test('wraps a numbered paragraph under a heading, moving the number onto the group', () => {
    const h: HeadingDocumentNode = {
      ...heading('h1', 'Art. 1'),
      children: [content('p1', 'Der Bund', '2'), content('p2', 'after')],
    };
    const d = doc([h]);
    const result = changeNodeTypeInDoc(d, idx(d), 'p1', 'CONTENT_GROUP');
    expect(result).not.toBeNull();
    const parent = getNodeAtPath(result!, [0]) as HeadingDocumentNode;
    expect(parent.children.map((n) => n.type)).toEqual(['CONTENT_GROUP', 'CONTENT']);
    const g = parent.children[0] as ContentGroupDocumentNode;
    expect(g.number).toBe('2');
    expect(g.contents).toEqual({});
    expect(g.format).toBe('TEXT');
    expect(g.id).not.toBe('p1');
    expect(g.children).toEqual([{ ...content('p1', 'Der Bund', null) }]);
    expect(isValidDocument(result!)).toBe(true);
  });

  test('wraps a list at document level', () => {
    const l = list('l1', [listItem('li1', 'one', 'a.')]);
    const d = doc([l]);
    const result = changeNodeTypeInDoc(d, idx(d), 'l1', 'CONTENT_GROUP');
    expect(result).not.toBeNull();
    const g = getNodeAtPath(result!, [0]) as ContentGroupDocumentNode;
    expect(g.type).toBe('CONTENT_GROUP');
    expect(g.number).toBeNull();
    expect(g.children).toEqual([l]);
    expect(isValidDocument(result!)).toBe(true);
  });

  test('refuses to wrap inside a list item or inside another group', () => {
    const d = doc([
      list('l1', [listItem('li1', 'one', '1.')]),
      group('g1', '2', [content('c1', 'x')]),
    ]);
    expect(changeNodeTypeInDoc(d, idx(d), 'li1-c', 'CONTENT_GROUP')).toBeNull();
    expect(changeNodeTypeInDoc(d, idx(d), 'c1', 'CONTENT_GROUP')).toBeNull();
  });

  test('refuses to wrap headings, footnotes, images, tables and definition lists', () => {
    const d = doc([
      heading('h1', 'H'),
      footnote('f1', 'n'),
      image('i1'),
      table('t1'),
      definitionList('d1'),
      group('g1', '2', []),
    ]);
    for (const id of ['h1', 'f1', 'i1', 't1', 'd1', 'g1']) {
      expect(changeNodeTypeInDoc(d, idx(d), id, 'CONTENT_GROUP')).toBeNull();
    }
  });
});

describe('changeNodeTypeInDoc — dissolving a CONTENT_GROUP', () => {
  test('lifts the children in place and moves the number onto the first paragraph', () => {
    const d = doc([
      heading('h0', 'before'),
      group('g1', '2', [content('c1', 'Der Bund'), list('l1', [listItem('li1', 'a', 'a.')])]),
      heading('h2', 'after'),
    ]);
    const result = changeNodeTypeInDoc(d, idx(d), 'g1', 'CONTENT');
    expect(result).not.toBeNull();
    expect(result!.children.map((n) => [n.type, n.id])).toEqual([
      ['HEADING', 'h0'],
      ['CONTENT', 'c1'],
      ['LIST', 'l1'],
      ['HEADING', 'h2'],
    ]);
    expect((result!.children[1] as ContentDocumentNode).number).toBe('2');
    expect(isValidDocument(result!)).toBe(true);
  });

  test('synthesizes a numbered paragraph carrying the group id when the first child is a list', () => {
    const d = doc([group('g1', '3', [list('l1', [listItem('li1', 'a', 'a.')])])]);
    const result = changeNodeTypeInDoc(d, idx(d), 'g1', 'CONTENT');
    expect(result!.children.map((n) => [n.type, n.id])).toEqual([
      ['CONTENT', 'g1'],
      ['LIST', 'l1'],
    ]);
    const placeholder = result!.children[0] as ContentDocumentNode;
    expect(placeholder.number).toBe('3');
    expect(placeholder.contents).toEqual({});
    expect(placeholder.format).toBe('TEXT');
    expect(isValidDocument(result!)).toBe(true);
  });

  test('keeps a first paragraph that already has its own number and inserts a placeholder', () => {
    const d = doc([group('g1', '3', [content('c1', 'x', '1')])]);
    const result = changeNodeTypeInDoc(d, idx(d), 'g1', 'CONTENT');
    expect(result!.children.map((n) => [n.id, (n as NumberedDocumentNode).number])).toEqual([
      ['g1', '3'],
      ['c1', '1'],
    ]);
  });

  test('drops an unnumbered group without a placeholder', () => {
    const d = doc([group('g1', null, [content('c1', 'x'), image('i1')])]);
    const result = changeNodeTypeInDoc(d, idx(d), 'g1', 'CONTENT');
    expect(result!.children.map((n) => n.id)).toEqual(['c1', 'i1']);
    expect((result!.children[0] as ContentDocumentNode).number).toBeNull();
  });

  test('an empty numbered group becomes a single empty paragraph', () => {
    const d = doc([group('g1', '4', [])]);
    const result = changeNodeTypeInDoc(d, idx(d), 'g1', 'CONTENT');
    expect(result!.children).toEqual([
      { id: 'g1', number: '4', type: 'CONTENT', format: 'TEXT', contents: {}, children: [] },
    ]);
  });

  test('refuses every other target for a group', () => {
    const d = doc([group('g1', '2', [content('c1', 'x')])]);
    for (const target of ['HEADING', 'FOOTNOTE', 'LIST', 'TABLE', 'DEFINITION_LIST'] as const) {
      expect(changeNodeTypeInDoc(d, idx(d), 'g1', target)).toBeNull();
    }
  });
});

describe('mergeNodesInDoc — content groups', () => {
  test('merges adjacent groups keeping the first id and number', () => {
    const d = doc([
      group('g1', '2', [content('c1', 'x')]),
      group('g2', '3', [content('c2', 'y'), list('l2', [])]),
    ]);
    expect(canMergeIdsInDoc(['g1', 'g2'], d, idx(d))).toBe(true);
    const result = mergeNodesInDoc(['g1', 'g2'], d, idx(d));
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    const g = result!.children[0] as ContentGroupDocumentNode;
    expect(g.id).toBe('g1');
    expect(g.number).toBe('2');
    expect(g.contents).toEqual({});
    expect(g.format).toBe('TEXT');
    expect(g.children.map((c) => c.id)).toEqual(['c1', 'c2', 'l2']);
    expect(isValidDocument(result!)).toBe(true);
  });

  test('does not merge tables or definition lists', () => {
    const d = doc([table('t1'), table('t2'), definitionList('d1'), definitionList('d2')]);
    expect(canMergeIdsInDoc(['t1', 't2'], d, idx(d))).toBe(false);
    expect(canMergeIdsInDoc(['d1', 'd2'], d, idx(d))).toBe(false);
  });
});

describe('indent / outdent — content groups', () => {
  test('Tab nests a paragraph under the preceding content group', () => {
    const d = doc([group('g1', '2', [content('c1', 'x')]), content('p1', 'y')]);
    const result = indentNodeInDoc(d, idx(d), 'p1');
    expect(result).not.toBeNull();
    const g = getNodeAtPath(result!, [0]) as ContentGroupDocumentNode;
    expect(g.children.map((c) => c.id)).toEqual(['c1', 'p1']);
    expect(isValidDocument(result!)).toBe(true);
  });

  test('Tab does not nest a heading or a table under a content group', () => {
    const d = doc([group('g1', '2', [content('c1', 'x')]), heading('h1', 'H')]);
    expect(indentNodeInDoc(d, idx(d), 'h1')).toBeNull();
    const d2 = doc([group('g1', '2', [content('c1', 'x')]), table('t1')]);
    expect(indentNodeInDoc(d2, idx(d2), 't1')).toBeNull();
  });

  test('Shift-Tab lifts a paragraph out of a content group', () => {
    const d = doc([group('g1', '2', [content('c1', 'x'), content('c2', 'y')])]);
    const result = outdentNodeInDoc(d, idx(d), 'c2');
    expect(result).not.toBeNull();
    expect(result!.children.map((n) => [n.type, n.id])).toEqual([
      ['CONTENT_GROUP', 'g1'],
      ['CONTENT', 'c2'],
    ]);
    expect(isValidDocument(result!)).toBe(true);
  });

  test('Shift-Tab refuses to lift a footnote out of a paragraph inside a group', () => {
    const c: ContentDocumentNode = { ...content('c1', 'x'), children: [footnote('f1', 'n')] };
    const d = doc([group('g1', '2', [c])]);
    expect(outdentNodeInDoc(d, idx(d), 'f1')).toBeNull();
  });

  test('Shift-Tab refuses to lift a table out of a list item that sits inside a group', () => {
    const item: ListItemDocumentNode = { ...listItem('li1', 'one', '1.'), children: [table('t1')] };
    const d = doc([group('g1', '2', [list('l1', [item])])]);
    expect(liftNodeOutOfListItem(d, [0, 0, 0, 0])).toBeNull();
    expect(outdentNodeInDoc(d, idx(d), 't1')).toBeNull();
  });

  test('findPreviousSiblingTarget offers a content group only for nodes it may hold', () => {
    const d = doc([group('g1', '2', []), content('p1', 'y'), heading('h1', 'H')]);
    expect(findPreviousSiblingTarget(d, 1, 'CONTENT')?.node.id).toBe('g1');
    expect(findPreviousSiblingTarget(d, 1, 'LIST')?.node.id).toBe('g1');
    expect(findPreviousSiblingTarget(d, 1, 'IMAGE')?.node.id).toBe('g1');
    expect(findPreviousSiblingTarget(d, 1, 'HEADING')).toBeNull();
    expect(findPreviousSiblingTarget(d, 1, 'TABLE')).toBeNull();
    expect(findPreviousSiblingTarget(d, 1, 'FOOTNOTE')).toBeNull();
    // A paragraph in between still takes a footnote, as before.
    expect(findPreviousSiblingTarget(d, 2, 'FOOTNOTE')?.node.id).toBe('p1');
  });
});

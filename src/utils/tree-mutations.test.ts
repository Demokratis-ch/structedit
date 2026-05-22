import { describe, expect, test } from 'vitest';
import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  HeadingDocumentNode,
  LeafDocumentNode,
  ListItemDocumentNode,
  NodeFormat,
  NumberedDocumentNode,
} from '../types/document';
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
): ContainerDocumentNode => ({
  id,
  number,
  type: 'LIST_ITEM',
  children: [content(`${id}-c`, text)],
});

const footnote = (id: string, text: string, format: NodeFormat = 'TEXT'): LeafDocumentNode => ({
  id,
  number: null,
  type: 'FOOTNOTE',
  format,
  contents: { de: text },
});

const list = (id: string, children: ContainerDocumentNode['children']): ContainerDocumentNode => ({
  id,
  number: null,
  type: 'LIST',
  children,
});

const doc = (children: ContainerDocumentNode['children']): ContainerDocumentNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children,
});

const idx = (d: ContainerDocumentNode): Map<string, NodePath> => buildIndices(d).nodeIndex;

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
    const list: ContainerDocumentNode = {
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
    const list: ContainerDocumentNode = {
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
    const list: ContainerDocumentNode = {
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
    const nested: ContainerDocumentNode = {
      id: 'nested',
      number: null,
      type: 'LIST',
      children: [listItem('li1a', 'inner', 'a.')],
    };
    const list: ContainerDocumentNode = {
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
    const parent: ContainerDocumentNode = { id: 'l', number: null, type: 'LIST', children: [] };
    const node = createNewSiblingNode(parent, 'de') as ContainerDocumentNode;
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
    const parent: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [heading('h1', 'A'), content('p1', 'x'), content('p2', 'y')],
    };
    const target = findPreviousSiblingTarget(parent, 2, 'CONTENT');
    expect(target).toEqual({ node: parent.children[0], index: 0 });
  });

  test('returns a preceding CONTENT node for a FOOTNOTE', () => {
    const parent: ContainerDocumentNode = {
      id: 'root',
      type: 'DOCUMENT',
      children: [content('p1', 'x'), heading('hh', 'H')],
    };
    // A FOOTNOTE can nest under a CONTENT sibling (a non-footnote could not).
    const target = findPreviousSiblingTarget(parent, 1, 'FOOTNOTE');
    expect(target).toEqual({ node: parent.children[0], index: 0 });
  });

  test('returns null when nothing qualifies', () => {
    const parent: ContainerDocumentNode = {
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
    const list: ContainerDocumentNode = {
      id: 'list1',
      number: null,
      type: 'LIST',
      children: [listItem('li1', 'one'), listItem('li2', 'two')],
    };
    const d = doc([list]);
    const result = indentNodeInDoc(d, idx(d), 'li2');
    expect(result).not.toBeNull();
    const li1 = getNodeAtPath(result!, [0, 0]) as ContainerDocumentNode;
    const nested = li1.children.find((c) => c.type === 'LIST') as ContainerDocumentNode;
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
    const list: ContainerDocumentNode = {
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
    const li1: ContainerDocumentNode = {
      id: 'li1',
      number: '1.',
      type: 'LIST_ITEM',
      children: [content('li1-c', 'x'), inner],
    };
    const d = doc([list('outer', [li1, listItem('li2', 'two', '2.')])]);
    const result = outdentNodeInDoc(d, idx(d), 'li1a');
    expect(result).not.toBeNull();
    const outer = getNodeAtPath(result!, [0]) as ContainerDocumentNode;
    // li1a is now a sibling of li1, between it and li2
    expect(outer.children.map((c) => c.id)).toEqual(['li1', 'li1a', 'li2']);
    // the emptied nested list inside li1 was dropped
    const li1After = outer.children[0] as ContainerDocumentNode;
    expect(li1After.children.some((c) => c.type === 'LIST')).toBe(false);
  });

  test('returns null for a top-level node', () => {
    const d = doc([heading('h1', 'A')]);
    expect(outdentNodeInDoc(d, idx(d), 'h1')).toBeNull();
  });
});

describe('liftNodeOutOfListItem', () => {
  test('splits the list_item and list around the lifted node, preserving order', () => {
    const list: ContainerDocumentNode = {
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
    const list = getNodeAtPath(result!, [0]) as ContainerDocumentNode;
    expect(list.type).toBe('LIST');
    expect(list.children[0].type).toBe('LIST_ITEM');
    expect((list.children[0] as NumberedDocumentNode).number).toBe('1.');
  });

  test('flattens a list to content nodes', () => {
    const list: ContainerDocumentNode = {
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
    const list: ContainerDocumentNode = {
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
    const merged = result!.children[0] as ContainerDocumentNode;
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
    const list: ContainerDocumentNode = {
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
    const list: ContainerDocumentNode = {
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
    expect((result!.children[1] as ContainerDocumentNode).children).toHaveLength(1);
  });
});

describe('mergeNodesInDoc', () => {
  test('merges contiguous content siblings, joining text and appending children', () => {
    const p1: ContentDocumentNode = { ...content('p1', 'one'), children: [content('p1a', 'kid')] };
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
    const merged = parent.children[0] as LeafDocumentNode;
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
    const merged = result!.children[0] as ContainerDocumentNode;
    expect(merged.type).toBe('LIST');
    expect(merged.id).toBe('l1');
    expect(merged.children.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  test('returns null when the selection cannot be merged', () => {
    const d = doc([heading('h1', 'A'), heading('h2', 'B'), heading('h3', 'C')]);
    expect(mergeNodesInDoc(['h1', 'h3'], d, idx(d))).toBeNull();
  });
});

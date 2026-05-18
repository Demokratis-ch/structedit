import { describe, expect, it } from 'vitest';
import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  HeadingDocumentNode,
} from '../../types/document';
import { parseHtmlLegalToTree, parseHtmlToTree } from '../document-utils';
import { mergeAdjacentListsTransform } from './merge-adjacent-lists';
import { content, createDoc, heading, list } from './test-helpers';

describe('mergeAdjacentListsTransform', () => {
  describe('core merge behaviour', () => {
    it('merges two adjacent list siblings at root level into one list', () => {
      const input = createDoc([
        list([{ number: '1.', content: 'A' }]),
        list([{ number: '1.', content: 'B' }]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe('LIST');
      const merged = result.children[0] as ContainerDocumentNode;
      expect(merged.children).toHaveLength(2);
      const item0 = merged.children[0] as ContainerDocumentNode;
      const item1 = merged.children[1] as ContainerDocumentNode;
      expect((item0.children[0] as ContentDocumentNode).contents.de).toBe('A');
      expect((item1.children[0] as ContentDocumentNode).contents.de).toBe('B');
    });

    it('preserves the first list id when merging', () => {
      const first = list([{ number: '1.', content: 'A' }]);
      const second = list([{ number: '1.', content: 'B' }]);
      const input = createDoc([first, second]);

      const result = mergeAdjacentListsTransform(input, 'de');

      expect(result.children[0].id).toBe(first.id);
    });

    it('leaves a single list untouched', () => {
      const input = createDoc([list([{ number: '1.', content: 'A' }])]);

      const result = mergeAdjacentListsTransform(input, 'de');

      expect(result).toBe(input);
    });

    it('leaves non-adjacent lists separate', () => {
      const input = createDoc([
        list([{ number: '1.', content: 'A' }]),
        content('Separator paragraph'),
        list([{ number: '1.', content: 'B' }]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      expect(result.children).toHaveLength(3);
      expect(result.children[0].type).toBe('LIST');
      expect(result.children[1].type).toBe('CONTENT');
      expect(result.children[2].type).toBe('LIST');
    });

    it('merges three or more consecutive lists into one', () => {
      const input = createDoc([
        list([{ number: '1.', content: 'A' }]),
        list([{ number: '1.', content: 'B' }]),
        list([{ number: '1.', content: 'C' }]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      expect(result.children).toHaveLength(1);
      const merged = result.children[0] as ContainerDocumentNode;
      expect(merged.children).toHaveLength(3);
    });

    it('merges adjacent lists nested inside a heading container', () => {
      const input = createDoc([
        heading('Section', [
          list([{ number: '1.', content: 'A' }]),
          list([{ number: '1.', content: 'B' }]),
        ]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      const h = result.children[0] as HeadingDocumentNode;
      expect(h.children).toHaveLength(1);
      const merged = h.children[0] as ContainerDocumentNode;
      expect(merged.children).toHaveLength(2);
    });

    it('merges adjacent lists at multiple nesting levels in one pass', () => {
      const input = createDoc([
        list([{ number: '1.', content: 'root A' }]),
        list([{ number: '1.', content: 'root B' }]),
        heading('Section', [
          list([{ number: '1.', content: 'nested A' }]),
          list([{ number: '1.', content: 'nested B' }]),
        ]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      expect(result.children).toHaveLength(2);
      const rootList = result.children[0] as ContainerDocumentNode;
      expect(rootList.children).toHaveLength(2);

      const h = result.children[1] as HeadingDocumentNode;
      const nestedList = h.children[0] as ContainerDocumentNode;
      expect(h.children).toHaveLength(1);
      expect(nestedList.children).toHaveLength(2);
    });

    it('does not merge sibling list_items as if they were lists', () => {
      // The transform recurses into every container, but list_items have
      // type 'LIST_ITEM' so they never match the merge condition (which
      // requires recursed.type === 'LIST').
      const input = createDoc([
        list([
          { number: '1.', content: 'A' },
          { number: '2.', content: 'B' },
        ]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      const merged = result.children[0] as ContainerDocumentNode;
      expect(merged.children).toHaveLength(2);
      expect(merged.children[0].type).toBe('LIST_ITEM');
      expect(merged.children[1].type).toBe('LIST_ITEM');
    });

    it('merges adjacent nested lists inside a list_item', () => {
      // processListElement (document-utils.ts) appends every nested <ol>/<ul>
      // child of a <li> as a separate list. If Mammoth splits a sub-list
      // across a page, these adjacent sub-lists must also merge.
      const outerListItem: ContainerDocumentNode = {
        id: 'outer-item',
        number: '1.',
        type: 'LIST_ITEM',
        children: [
          content('Outer item'),
          list([{ number: '1.', content: 'nested A' }]),
          list([{ number: '1.', content: 'nested B' }]),
        ],
      };
      const input = createDoc([
        {
          id: 'outer-list',
          number: null,
          type: 'LIST',
          children: [outerListItem],
        },
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      const outerList = result.children[0] as ContainerDocumentNode;
      const item = outerList.children[0] as ContainerDocumentNode;
      // Outer item content + ONE merged nested list (was two).
      expect(item.children).toHaveLength(2);
      const nestedList = item.children[1] as ContainerDocumentNode;
      expect(nestedList.type).toBe('LIST');
      expect(nestedList.children).toHaveLength(2);
    });

    it('returns same reference at every level when nothing changes', () => {
      const onlyList = list([{ number: '1.', content: 'A' }]);
      const innerHeading = heading('Inner', [onlyList]);
      const input = createDoc([innerHeading]);

      const result = mergeAdjacentListsTransform(input, 'de');

      // No merges anywhere → root, heading, and list references are all preserved.
      expect(result).toBe(input);
      expect(result.children[0]).toBe(innerHeading);
      expect((result.children[0] as HeadingDocumentNode).children[0]).toBe(onlyList);
    });
  });

  describe('marker preservation (no auto-renumber)', () => {
    it('preserves each list_item number exactly across the boundary (lettered)', () => {
      const input = createDoc([
        list([
          { number: 'a)', content: 'A' },
          { number: 'b)', content: 'B' },
          { number: 'c)', content: 'C' },
          { number: 'd)', content: 'D' },
        ]),
        list([
          { number: 'a)', content: 'E' },
          { number: 'b)', content: 'F' },
          { number: 'c)', content: 'G' },
        ]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      const merged = result.children[0] as ContainerDocumentNode;
      const numbers = merged.children.map((c) => c.number);
      expect(numbers).toEqual(['a)', 'b)', 'c)', 'd)', 'a)', 'b)', 'c)']);
    });

    it('preserves each list_item number exactly across the boundary (arabic)', () => {
      const input = createDoc([
        list([
          { number: '1.', content: 'A' },
          { number: '2.', content: 'B' },
          { number: '3.', content: 'C' },
        ]),
        list([
          { number: '1.', content: 'D' },
          { number: '2.', content: 'E' },
        ]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      const merged = result.children[0] as ContainerDocumentNode;
      const numbers = merged.children.map((c) => c.number);
      expect(numbers).toEqual(['1.', '2.', '3.', '1.', '2.']);
    });

    it('preserves null markers for unordered lists', () => {
      const input = createDoc([
        list([
          { number: null, content: 'A' },
          { number: null, content: 'B' },
        ]),
        list([{ number: null, content: 'C' }]),
      ]);

      const result = mergeAdjacentListsTransform(input, 'de');

      const merged = result.children[0] as ContainerDocumentNode;
      const numbers = merged.children.map((c) => c.number);
      expect(numbers).toEqual([null, null, null]);
    });
  });

  describe('end-to-end parsing', () => {
    it('merges adjacent <ol> elements produced by parseHtmlToTree', () => {
      const html = `<ol><li>A</li></ol><ol><li>B</li></ol>`;

      const tree = parseHtmlToTree(html, 'de');
      const result = mergeAdjacentListsTransform(tree, 'de');

      expect(result.children).toHaveLength(1);
      const merged = result.children[0] as ContainerDocumentNode;
      expect(merged.children).toHaveLength(2);
      // position-derived numbers are preserved as-is (no renumbering)
      expect(merged.children.map((c) => c.number)).toEqual(['1.', '1.']);
    });

    it('issue #67 scenario: merge runs before dedup so <sup> Absatznummern numbering is continuous', () => {
      // Mammoth-style page-split: two adjacent <ol>. The first has two items
      // (positional 1., 2.) — the second restarts positionally at 1. but its
      // <sup> tag carries the actual Word number 3. The merge transform must
      // run before listNumberDedup so the two lists become one before
      // Absatznummer detection. Per issue #63, superscript-numbered items are
      // paragraphs (content nodes), not list items, so the merged list is
      // fully dissolved into three content nodes carrying the original numbers.
      const html =
        `<ol><li><sup>1</sup> Page-1 item one</li><li><sup>2</sup> Page-1 item two</li></ol>` +
        `<ol><li><sup>3</sup> Page-2 item one</li></ol>`;

      const tree = parseHtmlLegalToTree(html, 'de');

      expect(tree.children).toHaveLength(3);
      expect(tree.children.every((c) => c.type === 'CONTENT')).toBe(true);
      expect(tree.children.map((c) => c.number)).toEqual(['^1^', '^2^', '^3^']);
    });

    it('preserves data-list-style-type markers across the merge (no overwrite)', () => {
      const html = `<ol><li style="list-style-type: 'a) ';">A</li></ol><ol><li style="list-style-type: 'a) ';">B</li></ol>`;

      const tree = parseHtmlLegalToTree(html, 'de');

      expect(tree.children).toHaveLength(1);
      const merged = tree.children[0] as ContainerDocumentNode;
      expect(merged.children).toHaveLength(2);
      // Explicit list-style-type markers preserved exactly — restart kept.
      expect(merged.children.map((c) => c.number)).toEqual(['a)', 'a)']);
    });
  });
});

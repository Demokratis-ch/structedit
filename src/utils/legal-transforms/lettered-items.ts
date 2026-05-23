import type {
  ContentDocumentNode,
  DocumentNode,
  DocumentRootNode,
  Language,
  ListDocumentNode,
} from '../../types/document';
import { generateId } from '../document-utils';
import { withMappedChildren } from '../tree-utils';
import { extractCleanText, matchLetteredItem } from './patterns';
import type { TreeTransform } from './types';

/**
 * Check if a node is a content node with lettered item pattern
 */
function getLetterMatch(node: DocumentNode): { letter: string; content: string } | null {
  if (node.type !== 'CONTENT') return null;
  const text = extractCleanText(node.contents.de || '');
  const match = matchLetteredItem(text);
  if (match.matched && match.letter && match.content !== undefined) {
    return { letter: match.letter, content: match.content };
  }
  return null;
}

/**
 * Strip the letter prefix from content. Inline markdown delimiters around the
 * prefix (e.g. `**a. First**`) are stripped first so the produced list_item —
 * whose content is stored as TEXT — doesn't keep both a duplicated letter and
 * literal markdown source.
 */
function stripLetterPrefix(htmlContent: string): string {
  return extractCleanText(htmlContent).replace(/^[a-z]\.\s+/, '');
}

/**
 * Create a list from accumulated lettered items
 */
function createList(
  items: { number: string; originalContent: ContentDocumentNode }[],
  language: Language
): ListDocumentNode {
  return {
    id: generateId(),
    number: null,
    type: 'LIST',
    children: items.map((item) => ({
      id: generateId(),
      number: item.number,
      type: 'LIST_ITEM' as const,
      children: [
        {
          id: generateId(),
          number: null,
          type: 'CONTENT' as const,
          format: 'TEXT' as const,
          contents: {
            [language]: stripLetterPrefix(item.originalContent.contents[language] || ''),
          },
          children: [],
        },
      ],
    })),
  };
}

/**
 * Process children of a container, grouping lettered items into lists
 */
function processChildren(children: DocumentNode[], language: Language): DocumentNode[] {
  // First, recursively apply to all container children
  const transformedChildren = children.map((child) => {
    if ('children' in child && child.children && child.children.length > 0) {
      return withMappedChildren(child, (grandchildren) => processChildren(grandchildren, language));
    }
    return child;
  });

  // Then group lettered items at this level
  const newChildren: DocumentNode[] = [];
  let pendingItems: { number: string; originalContent: ContentDocumentNode }[] = [];

  const flushList = () => {
    if (pendingItems.length === 0) return;
    newChildren.push(createList(pendingItems, language));
    pendingItems = [];
  };

  for (const child of transformedChildren) {
    const letterMatch = getLetterMatch(child);
    if (letterMatch) {
      pendingItems.push({
        number: `${letterMatch.letter}.`,
        originalContent: child as ContentDocumentNode,
      });
    } else {
      flushList();
      newChildren.push(child);
    }
  }
  flushList();

  return newChildren;
}

/**
 * Groups consecutive content nodes matching lettered patterns (a., b., c.)
 * into a single list node.
 *
 * Applies recursively to all container nodes in the tree.
 *
 * @example
 * Input tree:
 *   heading("Art. 1")
 *     content("Article intro")
 *     content("a. First item")
 *     content("b. Second item")
 *     content("Regular text")
 *
 * Output tree:
 *   heading("Art. 1")
 *     content("Article intro")
 *     list
 *       list_item(number: "a.")
 *         content("First item")
 *       list_item(number: "b.")
 *         content("Second item")
 *     content("Regular text")
 */
export const letteredItemsTransform: TreeTransform = (
  root: DocumentRootNode,
  language: Language
): DocumentRootNode => {
  return withMappedChildren(root, (children) => processChildren(children, language));
};

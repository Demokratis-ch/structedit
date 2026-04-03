import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  DocumentNode,
  HeadingDocumentNode,
  Language,
} from '../../types/document';
import type { TreeTransform } from './types';

/**
 * Pattern matching a leading number (with optional Swiss legal suffix) at the start of text.
 * Captures the number (e.g., "1", "2bis", "3ter") and expects whitespace after it.
 */
const LEADING_NUMBER_PATTERN =
  /^(\d+(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)?)\s+/;

/**
 * Check if a content node's text starts with a number and extract it.
 */
function extractLeadingNumber(
  contentNode: ContentDocumentNode,
  language: Language
): { number: string; strippedContent: string } | null {
  const text = contentNode.contents[language] || '';
  const match = text.match(LEADING_NUMBER_PATTERN);
  if (!match) return null;
  return {
    number: match[1],
    strippedContent: text.slice(match[0].length),
  };
}

/**
 * Process a list node, deduplicating numbers from list item content.
 */
function processListItem(
  listItem: ContainerDocumentNode,
  language: Language
): ContainerDocumentNode {
  if (listItem.children.length === 0) {
    return listItem;
  }

  const firstChild = listItem.children[0];
  const extracted =
    firstChild.type === 'content'
      ? extractLeadingNumber(firstChild as ContentDocumentNode, language)
      : null;

  const newFirstChild = extracted
    ? {
        ...(firstChild as ContentDocumentNode),
        contents: {
          ...(firstChild as ContentDocumentNode).contents,
          [language]: extracted.strippedContent,
        },
      }
    : processNode(firstChild, language);

  const remainingChildren = listItem.children.slice(1).map((child) => processNode(child, language));

  return {
    ...listItem,
    ...(extracted ? { number: extracted.number } : {}),
    children: [newFirstChild, ...remainingChildren],
  };
}

function processList(listNode: ContainerDocumentNode, language: Language): ContainerDocumentNode {
  return {
    ...listNode,
    children: listNode.children.map((item) => {
      if (item.type !== 'list_item') return item;
      return processListItem(item as ContainerDocumentNode, language);
    }),
  };
}

/**
 * Recursively process all nodes, applying list number deduplication.
 */
function processNode(node: DocumentNode, language: Language): DocumentNode {
  if (!('children' in node) || !node.children || node.children.length === 0) {
    return node;
  }

  const containerNode = node as ContainerDocumentNode | HeadingDocumentNode;

  if (node.type === 'list') {
    return processList(containerNode as ContainerDocumentNode, language);
  }

  return {
    ...containerNode,
    children: containerNode.children.map((child) => processNode(child, language)),
  };
}

/**
 * Deduplicates list item numbers that appear both as the ol-derived index
 * and as a leading number in the content text (e.g., from Mammoth's <sup> tags).
 *
 * The number in the text takes precedence and replaces the ol-derived number.
 *
 * @example
 * Input (after parseHtmlToTree):
 *   list
 *     list_item(number: "1.")
 *       content("1 Dieser Erlass regelt...")
 *     list_item(number: "2.")
 *       content("2 Er gilt für...")
 *
 * Output:
 *   list
 *     list_item(number: "1")
 *       content("Dieser Erlass regelt...")
 *     list_item(number: "2")
 *       content("Er gilt für...")
 */
export const listNumberDedupTransform: TreeTransform = (
  root: ContainerDocumentNode,
  language: Language
): ContainerDocumentNode => {
  return processNode(root, language) as ContainerDocumentNode;
};

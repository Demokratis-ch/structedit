import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  DocumentNode,
  HeadingDocumentNode,
  Language,
  NodeFormat,
} from '../../types/document';
import { generateId } from '../document-utils';
import { hasInlineMarkdownMarks } from '../format-render';
import type { TreeTransform } from './types';

const SWISS_SUFFIX = '(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)?';

/**
 * Pattern matching a leading number (with optional Swiss legal suffix) at the start of text.
 * Captures the number (e.g., "1", "2bis", "3ter") and expects whitespace after it.
 */
const LEADING_NUMBER_PATTERN = new RegExp(`^(\\d+${SWISS_SUFFIX})\\s+`);

/**
 * Same as LEADING_NUMBER_PATTERN but for a markdown-source superscript: `^N^ ...`
 * (what `<sup>N</sup>` becomes after htmlToMarkdown). Mammoth emits Swiss legal
 * Absatznummern this way; they're not list items.
 */
const LEADING_SUPERSCRIPT_NUMBER_PATTERN = new RegExp(`^\\^(\\d+${SWISS_SUFFIX})\\^\\s+`);

/**
 * After stripping a leading `<sup>` Absatznummer, the only inline mark may have been the
 * superscript itself — in that case the remaining source is plain text and the format
 * should drop from MARKDOWN to TEXT. Leave non-MARKDOWN formats alone.
 */
function downgradeFormatIfPlain(source: string, format: NodeFormat): NodeFormat {
  if (format !== 'MARKDOWN') return format;
  return hasInlineMarkdownMarks(source) ? format : 'TEXT';
}

/**
 * Tagged-union result of processing a list_item: either it stays a list_item (possibly
 * with a non-superscript number extracted) or it converts into a top-level content node
 * because the leading <sup>N</sup> marks it as an Absatznummer.
 */
type ProcessedListItem =
  | { kind: 'LIST_ITEM'; node: ContainerDocumentNode }
  | { kind: 'CONTENT'; node: ContentDocumentNode };

function processListItem(listItem: ContainerDocumentNode, language: Language): ProcessedListItem {
  if (listItem.children.length === 0) {
    return { kind: 'LIST_ITEM', node: listItem };
  }

  const firstChild = listItem.children[0];

  if (firstChild.type !== 'CONTENT') {
    return {
      kind: 'LIST_ITEM',
      node: {
        ...listItem,
        children: processChildren(listItem.children, language),
      },
    };
  }

  const contentNode = firstChild as ContentDocumentNode;
  const text = contentNode.contents[language] || '';

  // Superscript leading number → Absatznummer
  const supMatch = text.match(LEADING_SUPERSCRIPT_NUMBER_PATTERN);
  if (supMatch) {
    const strippedText = text.slice(supMatch[0].length);
    const newFormat = downgradeFormatIfPlain(strippedText, contentNode.format);
    const newContents = { ...contentNode.contents, [language]: strippedText };

    // A list_item can dissolve into a content node only when the list_item has no
    // sibling structure (e.g. nested lists) and the content node itself only carries
    // footnote children — both are legal children of a content node.
    const hasSiblings = listItem.children.length > 1;
    const contentHasNonFootnoteChildren = contentNode.children.some((c) => c.type !== 'FOOTNOTE');

    if (!hasSiblings && !contentHasNonFootnoteChildren) {
      // Preserve the superscript formatting on the converted content node's
      // number — the Absatznummer's visual identity is the superscript itself.
      // NumberMarkup renders the `number` field via MARKDOWN_MINIMAL, so the
      // `^N^` source round-trips to `<sup>N</sup>` in the UI.
      return {
        kind: 'CONTENT',
        node: {
          ...contentNode,
          number: `^${supMatch[1]}^`,
          format: newFormat,
          contents: newContents,
        },
      };
    }

    // Otherwise: keep as a list_item but strip the superscript markup and set number.
    const newFirstChild: ContentDocumentNode = {
      ...contentNode,
      format: newFormat,
      contents: newContents,
    };
    return {
      kind: 'LIST_ITEM',
      node: {
        ...listItem,
        number: supMatch[1],
        children: [newFirstChild, ...processChildren(listItem.children.slice(1), language)],
      },
    };
  }

  // Non-superscript leading number → real list_item, just dedupe.
  const numMatch = text.match(LEADING_NUMBER_PATTERN);
  if (numMatch) {
    const newFirstChild: ContentDocumentNode = {
      ...contentNode,
      contents: { ...contentNode.contents, [language]: text.slice(numMatch[0].length) },
    };
    return {
      kind: 'LIST_ITEM',
      node: {
        ...listItem,
        number: numMatch[1],
        children: [newFirstChild, ...processChildren(listItem.children.slice(1), language)],
      },
    };
  }

  // No leading number — just recurse into the rest of the item.
  return {
    kind: 'LIST_ITEM',
    node: {
      ...listItem,
      children: processChildren(listItem.children, language),
    },
  };
}

/**
 * Process a list node. If any items convert to content nodes, the list is split into
 * contiguous segments — the original list id stays on the first emitted segment, any
 * subsequent list segments get fresh ids.
 */
function processList(listNode: ContainerDocumentNode, language: Language): DocumentNode[] {
  const processed = listNode.children.map((item): ProcessedListItem => {
    if (item.type !== 'LIST_ITEM') {
      return { kind: 'LIST_ITEM', node: item as ContainerDocumentNode };
    }
    return processListItem(item as ContainerDocumentNode, language);
  });

  const result: DocumentNode[] = [];
  let buffer: ContainerDocumentNode[] = [];
  let firstSegment = true;

  const flush = () => {
    if (buffer.length === 0) return;
    result.push({
      ...listNode,
      id: firstSegment ? listNode.id : generateId(),
      children: buffer,
    });
    buffer = [];
    firstSegment = false;
  };

  for (const item of processed) {
    if (item.kind === 'LIST_ITEM') {
      buffer.push(item.node);
    } else {
      flush();
      result.push(item.node);
    }
  }
  flush();

  // Preserve the original (possibly empty) list when nothing converted, so an empty
  // input list still appears in the output.
  if (result.length === 0) {
    return [{ ...listNode, children: [] }];
  }

  return result;
}

/**
 * Recurse children, flat-mapping lists so they can dissolve / split.
 */
function processChildren(children: DocumentNode[], language: Language): DocumentNode[] {
  const result: DocumentNode[] = [];
  for (const child of children) {
    if (child.type === 'LIST') {
      result.push(...processList(child as ContainerDocumentNode, language));
    } else {
      result.push(processNode(child, language));
    }
  }
  return result;
}

function processNode(node: DocumentNode, language: Language): DocumentNode {
  if (!('children' in node) || !node.children || node.children.length === 0) {
    return node;
  }
  const containerNode = node as ContainerDocumentNode | HeadingDocumentNode | ContentDocumentNode;
  return {
    ...containerNode,
    children: processChildren(containerNode.children, language),
  };
}

/**
 * Deduplicates list item numbers that appear both as the ol-derived index and as a
 * leading number in the content text (e.g., from Mammoth's <sup> tags).
 *
 * The number in the text takes precedence and replaces the ol-derived number.
 *
 * Special case: a leading SUPERSCRIPT number (`^N^` in markdown source, originally
 * `<sup>N</sup>`) marks a Swiss legal Absatznummer — the list_item is converted to a
 * `content` node (when the item has no children other than that content + footnote
 * descendants). Such conversions can split the surrounding `list`.
 *
 * @example
 * Input (after parseHtmlToTree, list_item content already has `^1^ ...` markdown):
 *   list
 *     list_item(number: "1.")
 *       content("^1^ Dieser Erlass regelt...", format=MARKDOWN)
 *
 * Output:
 *   content(number: "1", "Dieser Erlass regelt...", format=TEXT)
 *   (the list is dissolved)
 */
export const listNumberDedupTransform: TreeTransform = (
  root: ContainerDocumentNode,
  language: Language
): ContainerDocumentNode => {
  return {
    ...root,
    children: processChildren(root.children, language),
  };
};

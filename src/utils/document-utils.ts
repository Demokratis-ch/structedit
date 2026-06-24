import DOMPurify from 'dompurify';
import {
  type BlockDocumentNode,
  type ContentDocumentNode,
  DOC_TREE_VERSION,
  type DocTreeEnvelope,
  type DocumentNode,
  type DocumentRootNode,
  type HeadingDocumentNode,
  type Language,
  type ListDocumentNode,
  type ListItemDocumentNode,
  type NodeFormat,
} from '../types/document';
import {
  hasInlineMarks,
  hasOnlyAnchorMarks,
  hasOnlyBreakMarks,
  htmlToMarkdown,
} from './format-render';
import { applySwissLegalTransforms } from './legal-transforms';

export const generateId = () => Math.random().toString(36).substring(2, 9);

// Strips only the final extension (e.g. "archive.tar.gz" -> "archive.tar"), so
// the JSON filename and the envelope title agree on what the "base name" is.
export const stripFileExtension = (filename: string): string => filename.replace(/\.[^/.]+$/, '');

export const deriveJsonFilename = (filename: string | null | undefined): string => {
  if (!filename) return 'document.json';
  return `${stripFileExtension(filename)}.json`;
};

/**
 * Wrap a document tree in a versioned envelope for export. The title is derived
 * from the source filename (extension stripped) and keyed by `language`.
 */
export const buildDocTreeEnvelope = (
  document: DocumentRootNode,
  options: { language: Language; filename?: string | null }
): DocTreeEnvelope => {
  const stripped = options.filename ? stripFileExtension(options.filename).trim() : '';
  const title = stripped ? { [options.language]: stripped } : {};
  return {
    DocTreeVersion: DOC_TREE_VERSION,
    metadata: { title },
    document,
  };
};

export const DEFAULT_LANGUAGE: Language = 'de';

export const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Stub language detection - returns DEFAULT_LANGUAGE for now
 */
export const detectLanguage = (text?: string): Language => {
  return DEFAULT_LANGUAGE;
};

/**
 * Convert list-style-type CSS on <li> elements to a data-list-style-type attribute
 * so that DOMPurify doesn't strip the information.
 * The captured value is trimmed (e.g., 'a) ' becomes 'a)') for use as a numbering label.
 */
export const preserveListStyleType = (html: string): string => {
  return html.replace(
    /<li\b([^>]*?)\s*style\s*=\s*["']list-style-type:\s*['"]([^'"]+)['"]\s*;?\s*["'](.*?)>/gi,
    (_match, before: string, value: string, after: string) =>
      `<li${before} data-list-style-type="${value.trim()}"${after}>`
  );
};

/**
 * True when a parsed document carries no text content anywhere in the tree.
 * Used to detect uploads/pastes we couldn't extract any structure from (e.g.
 * PDF→HTML output that is only positioned <span>s) so the UI can warn instead
 * of silently opening an empty editor.
 */
export const isEmptyDocument = (doc: DocumentRootNode): boolean => {
  const hasText = (node: DocumentNode): boolean => {
    // A label like "Art. 5" or "I." that legal transforms moved into `number` is
    // still real content even when `contents` is empty. (The document root has no `number`.)
    if ('number' in node && typeof node.number === 'string' && node.number.trim().length > 0) {
      return true;
    }
    if ('contents' in node && node.contents) {
      if (Object.values(node.contents).some((v) => typeof v === 'string' && v.trim().length > 0)) {
        return true;
      }
    }
    if ('children' in node && node.children) {
      return node.children.some(hasText);
    }
    return false;
  };
  return !hasText(doc);
};

/**
 * Parse HTML to DocumentNode tree structure
 */
export const parseHtmlToTree = (
  html: string,
  language: Language = detectLanguage(html)
): DocumentRootNode => {
  const preprocessedHtml = preserveListStyleType(html);
  const cleanHtml = DOMPurify.sanitize(preprocessedHtml, {
    ALLOWED_TAGS: [
      'b',
      'i',
      'em',
      'strong',
      'u',
      's',
      'strike',
      'span',
      'code',
      'sub',
      'sup',
      'p',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'br',
      'a',
    ],
    ALLOWED_ATTR: ['href', 'target', 'type', 'data-list-style-type'],
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml, 'text/html');

  const root: DocumentRootNode = {
    id: generateId(),
    type: 'DOCUMENT',
    children: [],
  };

  // Stack to track current parent at each heading level
  // Index 0 = document root, 1 = h1-level, 2 = h2-level, etc.
  // Only the root and headings are ever pushed; both carry block-level children.
  const parentStack: (DocumentRootNode | HeadingDocumentNode)[] = [root];

  const getCurrentParent = (): DocumentRootNode | HeadingDocumentNode => {
    return parentStack[parentStack.length - 1];
  };

  const addChild = (node: BlockDocumentNode) => {
    getCurrentParent().children.push(node);
  };

  /**
   * Extract the inner HTML of a node with block tags stripped, but inline marks preserved
   * so the caller can decide whether to keep them as Markdown or drop them.
   */
  const getInnerHtml = (node: Node): string => {
    if (node instanceof HTMLElement) {
      let content = node.innerHTML.trim();
      content = content.replace(/<\/?(div|p|h[1-6]|ul|ol|li)[^>]*>/gi, '');
      return content;
    }
    return (node.textContent || '').replace(/[\s\n]+/g, ' ').trim();
  };

  /**
   * Pick the per-node default format (design D8):
   *   heading → NEWLINES when only `<br>` is present (no inline marks, no anchor)
   *             → TEXT when only an anchor is present (links can't render under MARKDOWN_MINIMAL)
   *             → MARKDOWN_MINIMAL when an inline mark is present (any `<br>` is dropped:
   *               MARKDOWN_MINIMAL is single-line per the platform spec)
   *             → TEXT otherwise
   *   content/footnote → MARKDOWN when any inline mark, `<br>`, or anchor is present.
   *   image → always TEXT.
   */
  const chooseFormat = (
    nodeType: 'HEADING' | 'CONTENT' | 'FOOTNOTE' | 'IMAGE',
    rawHtml: string
  ): NodeFormat => {
    if (nodeType === 'IMAGE') return 'TEXT';
    if (!hasInlineMarks(rawHtml)) return 'TEXT';
    if (nodeType === 'HEADING') {
      if (hasOnlyAnchorMarks(rawHtml)) return 'TEXT';
      if (hasOnlyBreakMarks(rawHtml)) return 'NEWLINES';
      return 'MARKDOWN_MINIMAL';
    }
    return 'MARKDOWN';
  };

  // Inline HTML of an <li>, excluding nested <ol>/<ul>. Inline marks (e.g. <sup>) are
  // kept so chooseFormat / htmlToMarkdown can decide the right format and preserve
  // markup like Mammoth's <sup>N</sup> Absatznummer prefix.
  const getDirectInnerHtml = (li: Node): string => {
    let html = '';
    for (const child of Array.from(li.childNodes)) {
      const name = child.nodeName.toLowerCase();
      if (name === 'ol' || name === 'ul') continue;
      if (child.nodeType === Node.TEXT_NODE) {
        html += child.textContent || '';
      } else if (child instanceof HTMLElement) {
        html += child.outerHTML;
      }
    }
    return html.trim();
  };

  const processListElement = (domNode: Node, tagName: string): ListDocumentNode => {
    const list: ListDocumentNode = {
      id: generateId(),
      number: null,
      type: 'LIST',
      children: [],
    };

    const items = Array.from(domNode.childNodes).filter((n) => n.nodeName.toLowerCase() === 'li');

    items.forEach((li, index) => {
      const customStyle =
        li instanceof HTMLElement ? li.getAttribute('data-list-style-type') : null;
      const listItem: ListItemDocumentNode = {
        id: generateId(),
        number: customStyle || (tagName === 'ol' ? `${index + 1}.` : null),
        type: 'LIST_ITEM',
        children: [],
      };

      const rawHtml = getDirectInnerHtml(li);
      if (rawHtml) {
        const format = chooseFormat('CONTENT', rawHtml);
        const text = htmlToMarkdown(rawHtml, format);
        if (text) {
          const contentChild: ContentDocumentNode = {
            id: generateId(),
            number: null,
            type: 'CONTENT',
            format,
            contents: { [language]: text },
            children: [],
          };
          listItem.children.push(contentChild);
        }
      }

      // Recursively process nested lists
      for (const child of Array.from(li.childNodes)) {
        const childTag = child.nodeName.toLowerCase();
        if (childTag === 'ol' || childTag === 'ul') {
          listItem.children.push(processListElement(child, childTag));
        }
      }

      list.children.push(listItem);
    });

    return list;
  };

  const walkDom = (domNode: Node) => {
    if (domNode.nodeType === Node.COMMENT_NODE) return;
    if (domNode.nodeName === 'SCRIPT' || domNode.nodeName === 'STYLE') return;

    const tagName = domNode.nodeName.toLowerCase();

    // Heading elements - these define structure
    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName[1], 10); // 1-6
      const rawHtml = getInnerHtml(domNode);
      const format = chooseFormat('HEADING', rawHtml);
      const content = htmlToMarkdown(rawHtml, format);

      // Pop stack to appropriate level (heading level becomes index in stack)
      while (parentStack.length > level) {
        parentStack.pop();
      }

      const heading: HeadingDocumentNode = {
        id: generateId(),
        number: null,
        type: 'HEADING',
        format,
        contents: { [language]: content },
        children: [],
      };

      addChild(heading);
      parentStack.push(heading);
      return;
    }

    // Lists - create list container with list_item children
    if (tagName === 'ul' || tagName === 'ol') {
      const list = processListElement(domNode, tagName);
      addChild(list);
      return;
    }

    // Divs - transparent containers, recurse into children
    if (tagName === 'div') {
      Array.from(domNode.childNodes).forEach(walkDom);
      return;
    }

    // Paragraphs - create content nodes
    if (tagName === 'p') {
      const rawHtml = getInnerHtml(domNode);
      if (rawHtml) {
        const format = chooseFormat('CONTENT', rawHtml);
        const content = htmlToMarkdown(rawHtml, format);
        if (content) {
          const contentNode: ContentDocumentNode = {
            id: generateId(),
            number: null,
            type: 'CONTENT',
            format,
            contents: { [language]: content },
            children: [],
          };
          addChild(contentNode);
        }
      }
      return;
    }

    // For other elements, recurse into children
    Array.from(domNode.childNodes).forEach(walkDom);
  };

  walkDom(doc.body);
  return root;
};

/**
 * Parse HTML with Swiss legal document pattern detection to DocumentNode tree.
 *
 * This function parses HTML using parseHtmlToTree and then applies Swiss legal
 * document transformations to detect and structure:
 * - Roman numeral sections (I., II., III.) → top-level headings
 * - Article patterns (Art. X, § X) → nested headings
 * - Lettered items (a., b., c.) → grouped into lists
 */
export const parseHtmlLegalToTree = (
  html: string,
  language: Language = detectLanguage(html)
): DocumentRootNode => {
  const tree = parseHtmlToTree(html, language);
  return applySwissLegalTransforms(tree, language);
};

import DOMPurify from 'dompurify';
import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  DocumentNode,
  HeadingDocumentNode,
  Language,
} from '../types/document';
import { applySwissLegalTransforms } from './legal-transforms';

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const deriveJsonFilename = (filename: string | null | undefined): string => {
  if (!filename) return 'document.json';
  return `${filename.replace(/\.[^/.]+$/, '')}.json`;
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
 * Parse HTML to DocumentNode tree structure
 */
export const parseHtmlToTree = (
  html: string,
  language: Language = detectLanguage(html)
): ContainerDocumentNode => {
  const cleanHtml = DOMPurify.sanitize(html, {
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
    ALLOWED_ATTR: ['href', 'target', 'type'],
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml, 'text/html');

  const root: ContainerDocumentNode = {
    id: generateId(),
    number: null,
    type: 'document',
    children: [],
  };

  // Stack to track current parent at each heading level
  // Index 0 = document root, 1 = h1-level, 2 = h2-level, etc.
  const parentStack: (ContainerDocumentNode | HeadingDocumentNode)[] = [root];

  const getCurrentParent = (): ContainerDocumentNode | HeadingDocumentNode => {
    return parentStack[parentStack.length - 1];
  };

  const addChild = (node: DocumentNode) => {
    getCurrentParent().children.push(node);
  };

  const getInnerHtml = (node: Node): string => {
    if (node instanceof HTMLElement) {
      let content = node.innerHTML.trim();
      // Strip nested block tags
      content = content.replace(/<\/?(div|p|h[1-6]|ul|ol|li)[^>]*>/gi, '');
      // Strip inline formatting tags (Demokratis platform doesn't support formatting)
      content = content.replace(/<\/?(b|i|em|strong|u|s|strike|span|code|sub|sup)[^>]*>/gi, '');
      return content;
    }
    return (node.textContent || '').replace(/[\s\n]+/g, ' ').trim();
  };

  const walkDom = (domNode: Node) => {
    if (domNode.nodeType === Node.COMMENT_NODE) return;
    if (domNode.nodeName === 'SCRIPT' || domNode.nodeName === 'STYLE') return;

    const tagName = domNode.nodeName.toLowerCase();

    // Heading elements - these define structure
    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName[1], 10); // 1-6
      const content = getInnerHtml(domNode);

      // Pop stack to appropriate level (heading level becomes index in stack)
      while (parentStack.length > level) {
        parentStack.pop();
      }

      const heading: HeadingDocumentNode = {
        id: generateId(),
        number: null,
        type: 'heading',
        contents: { [language]: content },
        children: [],
      };

      addChild(heading);
      parentStack.push(heading);
      return;
    }

    // Lists - create list container with list_item children
    if (tagName === 'ul' || tagName === 'ol') {
      const list: ContainerDocumentNode = {
        id: generateId(),
        number: null,
        type: 'list',
        children: [],
      };

      addChild(list);

      // Process list items
      const items = Array.from(domNode.childNodes).filter((n) => n.nodeName.toLowerCase() === 'li');

      items.forEach((li, index) => {
        const listItem: ContainerDocumentNode = {
          id: generateId(),
          number: tagName === 'ol' ? `${index + 1}.` : null,
          type: 'list_item',
          children: [
            {
              id: generateId(),
              number: null,
              type: 'content',
              contents: { [language]: getInnerHtml(li) },
              children: [],
            } as ContentDocumentNode,
          ],
        };
        list.children.push(listItem);
      });
      return;
    }

    // Paragraphs and divs - create content nodes
    if (tagName === 'p' || tagName === 'div') {
      const content = getInnerHtml(domNode);
      if (content) {
        const contentNode: ContentDocumentNode = {
          id: generateId(),
          number: null,
          type: 'content',
          contents: { [language]: content },
          children: [],
        };
        addChild(contentNode);
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
): ContainerDocumentNode => {
  const tree = parseHtmlToTree(html, language);
  return applySwissLegalTransforms(tree, language);
};

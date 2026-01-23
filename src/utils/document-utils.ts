import type { Language, ContainerDocumentNode, HeadingDocumentNode, ContentDocumentNode, DocumentNode } from '../types/document';
import DOMPurify from 'dompurify';

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const DEFAULT_LANGUAGE: Language = 'de';

/**
 * Swiss Legal Document Pattern Detection
 */
const LEGAL_PATTERNS = {
  // Art. 1 or § 1 patterns
  article: /^(Art\.|§)\s*\d+[a-z]?(\s+Abs\.\s*\d+)?/i,
  // Section headers I. II. etc.
  romanSection: /^(I{1,3}|IV|VI{0,3}|IX|X{1,3})\.(\s|$)/,
  // (geändert), (neu), (aufgehoben)
  legalMarker: /\((geändert|neu|aufgehoben)\)/i,
  // 1 Text..., 2 Text... (numbered paragraph at start)
  numberedPara: /^\d+\s+[A-ZÄÖÜ]/,
  // a. text, b. text, c. text
  letteredItem: /^[a-z]\.\s/,
};

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
export const parseHtmlToTree = (html: string, language: Language = detectLanguage(html)): ContainerDocumentNode => {
  const cleanHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 's', 'strike', 'span', 'code', 'sub', 'sup', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'br', 'a'],
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
      // Strip nested block tags but keep inline formatting
      content = content.replace(/<\/?(div|p|h[1-6]|ul|ol|li)[^>]*>/gi, '');
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
      const level = parseInt(tagName[1]); // 1-6
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
      const items = Array.from(domNode.childNodes).filter(
        n => n.nodeName.toLowerCase() === 'li'
      );

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
 * Parse HTML with Swiss legal document pattern detection to DocumentNode tree
 */
export const parseHtmlLegalToTree = (html: string, language: Language = detectLanguage(html)): ContainerDocumentNode => {
  const cleanHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 's', 'strike', 'span', 'code', 'sub', 'sup', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'br', 'a'],
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

  // Stack to track current parent - headings create nesting
  const parentStack: (ContainerDocumentNode | HeadingDocumentNode)[] = [root];

  // Track if we're accumulating lettered items for a list
  let pendingListItems: { number: string; content: string }[] = [];

  const getCurrentParent = (): ContainerDocumentNode | HeadingDocumentNode => {
    return parentStack[parentStack.length - 1];
  };

  const addChild = (node: DocumentNode) => {
    getCurrentParent().children.push(node);
  };

  const flushPendingList = () => {
    if (pendingListItems.length > 0) {
      const list: ContainerDocumentNode = {
        id: generateId(),
        number: null,
        type: 'list',
        children: pendingListItems.map(item => ({
          id: generateId(),
          number: item.number,
          type: 'list_item' as const,
          children: [
            {
              id: generateId(),
              number: null,
              type: 'content' as const,
              contents: { [language]: item.content },
              children: [],
            },
          ],
        })),
      };
      addChild(list);
      pendingListItems = [];
    }
  };

  const getInnerHtml = (node: Node): string => {
    if (node instanceof HTMLElement) {
      let content = node.innerHTML.trim();
      content = content.replace(/<\/?(div|p|h[1-6]|ul|ol|li)[^>]*>/gi, '');
      return content;
    }
    return (node.textContent || '').replace(/[\s\n]+/g, ' ').trim();
  };

  const walkDom = (domNode: Node) => {
    if (domNode.nodeType === Node.COMMENT_NODE) return;
    if (domNode.nodeName === 'SCRIPT' || domNode.nodeName === 'STYLE') return;

    const tagName = domNode.nodeName.toLowerCase();

    // Heading elements
    if (/^h[1-6]$/.test(tagName)) {
      flushPendingList();
      const level = parseInt(tagName[1]);
      const content = getInnerHtml(domNode);

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

    // Lists
    if (tagName === 'ul' || tagName === 'ol') {
      flushPendingList();
      const list: ContainerDocumentNode = {
        id: generateId(),
        number: null,
        type: 'list',
        children: [],
      };

      addChild(list);

      const items = Array.from(domNode.childNodes).filter(
        n => n.nodeName.toLowerCase() === 'li'
      );

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

    // Paragraphs - check for legal patterns
    if (tagName === 'p' || tagName === 'div') {
      const content = getInnerHtml(domNode);
      if (!content) return;

      const cleanText = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

      // Check for lettered item (a., b., c.)
      const letteredMatch = cleanText.match(/^([a-z])\.\s+(.*)$/);
      if (letteredMatch) {
        pendingListItems.push({
          number: `${letteredMatch[1]}.`,
          content: content.replace(/^[a-z]\.\s+/, ''),
        });
        return;
      }

      // If we have pending items but this isn't a lettered item, flush
      flushPendingList();

      // Check for roman numeral section (I., II., etc.)
      if (LEGAL_PATTERNS.romanSection.test(cleanText)) {
        // Pop to document level for major sections
        while (parentStack.length > 1) {
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

      // Check for Article pattern (Art. X)
      if (LEGAL_PATTERNS.article.test(cleanText)) {
        // Articles nest under the current section
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

      // Regular content
      const contentNode: ContentDocumentNode = {
        id: generateId(),
        number: null,
        type: 'content',
        contents: { [language]: content },
        children: [],
      };
      addChild(contentNode);
      return;
    }

    // Recurse into other elements
    Array.from(domNode.childNodes).forEach(walkDom);
  };

  walkDom(doc.body);
  flushPendingList();
  return root;
};

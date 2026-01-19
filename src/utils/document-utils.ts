import { Block, TreeNode } from '../types';
import type { Language, ContainerDocumentNode, HeadingDocumentNode, LeafDocumentNode, DocumentNode } from '../types/document';
import DOMPurify from 'dompurify';

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const parseHtml = (html: string): Block[] => {
  // Sanitize before parsing
  const cleanHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 's', 'strike', 'span', 'code', 'sub', 'sup', 'p', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'br', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'type'], // explicitly no on* attributes
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml, 'text/html');
  const blocks: Block[] = [];

  const clean = (text: string) => text.replace(/[\s\n]+/g, ' ').trim();

  const walk = (node: Node, depth: number, listType: 'ul' | 'ol' | 'abc' | null) => {
    if (node.nodeType === Node.COMMENT_NODE) return;
    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') return;

    const tagName = node.nodeName.toLowerCase();

    // Atomic Blocks
    if (/^h[1-6]$/.test(tagName)) {
      const type = tagName === 'h1' ? 'h1' : 'h2';
      const content = clean(node.textContent || '');
      if (content) {
        blocks.push({ id: generateId(), content, type, depth: Math.min(depth, 5) });
      }
      return;
    }
    if (tagName === 'p') {
      // For P, we want to capture inner HTML for bold/italics if possible
      let content = '';
      if (node instanceof HTMLElement) {
         content = node.innerHTML.trim(); // Grab inner HTML to preserve <b>, <i> etc.
         // Basic sanitation: strip div/p tags if nested, but keep inline formatting
         content = content.replace(/<\/?(div|p|h[1-6]|ul|ol|li)[^>]*>/gi, ''); 
      } else {
         content = clean(node.textContent || '');
      }
      
      if (content) {
        blocks.push({ id: generateId(), content, type: listType || 'p', depth: Math.min(depth, 5) });
      }
      return;
    }

    // Container / Mixed Traversal
    const childNodes = Array.from(node.childNodes);
    let buffer = '';

    const flush = () => {
      const content = buffer.trim(); // Keep whitespace handling simple
      if (content) {
        blocks.push({
          id: generateId(),
          content,
          type: listType || 'p',
          depth: Math.min(depth, 5)
        });
      }
      buffer = '';
    };

    for (const child of childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        buffer += child.textContent || '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childTag = child.nodeName.toLowerCase();
        
        // Inline formatting tags we want to preserve
        const isFormatting = ['b', 'strong', 'i', 'em', 'u', 's', 'code', 'span', 'sub', 'sup', 'a'].includes(childTag);
        
        if (isFormatting) {
             buffer += (child as HTMLElement).outerHTML;
             continue;
        }

        // Block-level elements that cause a break
        const isBlock = ['div', 'p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'br', 'section', 'article', 'header', 'footer', 'main', 'nav'].includes(childTag);
        
        if (isBlock) {
          flush();
          
          if (childTag === 'br') {
             // just flush
          } else if (childTag === 'ul' || childTag === 'ol') {
             // For nested lists, we want to increment depth relative to current walking depth
             // But if it's a top-level list (depth 0), it stays 0 unless inside another li?
             // Actually, structfix model: depth is visual indent.
             // If we encounter UL inside LI, it means indent.
             const nextDepth = depth + 1; // Always increment depth for nested UL/OL structure
             
             // Detect type="a" for abc lists?
             let nextListType: 'ul' | 'ol' | 'abc' = childTag as 'ul' | 'ol';
             const typeAttr = (child as HTMLElement).getAttribute('type');
             
             if (childTag === 'ol') {
                 if (typeAttr === 'a') {
                     nextListType = 'abc';
                 } else if (!typeAttr) {
                     // Heuristic: Check first few children for "a. " pattern
                     const firstLi = Array.from(child.childNodes).find(n => n.nodeName.toLowerCase() === 'li');
                     if (firstLi && firstLi.textContent && /^[a-z]\.\s/.test(firstLi.textContent.trim())) {
                         nextListType = 'abc';
                     }
                 }
             }

             walk(child, nextDepth, nextListType);
          } else {
             walk(child, depth, listType);
          }
        } else {
          // Other elements -> treat as text content
          buffer += child.textContent || '';
        }
      }
    }
    flush();
  };

  walk(doc.body, 0, null);
  return blocks;
};

/**
 * Swiss Legal Document Pattern Detection
 * Post-processes blocks to detect legal document structure
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

/**
 * Detects if content matches Swiss legal heading patterns
 */
export const detectLegalHeadingType = (content: string): 'h1' | 'h2' | 'h3' | null => {
  const trimmed = content.trim();
  
  // Roman numeral sections are top-level (## in MD = h2)
  if (LEGAL_PATTERNS.romanSection.test(trimmed)) {
    return 'h2';
  }
  
  // Articles are subsections (### in MD = h3)
  if (LEGAL_PATTERNS.article.test(trimmed)) {
    return 'h3';
  }
  
  return null;
};

/**
 * Detects if content is a lettered list item (a., b., c.)
 */
export const detectLetteredItem = (content: string): boolean => {
  return LEGAL_PATTERNS.letteredItem.test(content.trim());
};

/**
 * Post-process blocks to apply Swiss legal document structure
 */
export const applyLegalPatterns = (blocks: Block[]): Block[] => {
  return blocks.flatMap(block => {
    let content = block.content;

    // 1. Superscript Normalization: "<sup>1</sup> Text" -> "1 Text"
    if (content.includes('<sup>')) {
       content = content.replace(/<sup>(\d+)<\/sup>/g, '$1 ');
       content = content.replace(/\s+/g, ' ').trim();
    }

    const detectedType = detectLegalHeadingType(content);
    
    if (detectedType && block.type === 'p') {
      return [{ ...block, content, type: detectedType }];
    }
    
    // GUARD: ol/abc blocks with ONLY bold content are section headers, not lists
    // e.g., <ol><li><strong>Wahlen</strong></li></ol> should become h2
    if ((block.type === 'ol' || block.type === 'abc') && 
        /^<strong>.*<\/strong>$/.test(content.trim())) {
      return [{ ...block, content, type: 'h2' as const }];
    }
    
    // 2. List Resurrection
    if (block.type === 'p') {
        // Normalize content for detection (strip tags, convert nbsp to space)
        const cleanText = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ').trim();

        // GUARD: Skip if content is primarily bold (likely a section header, not a list item)
        // e.g., "<strong>1. Landsgemeinde</strong>" should be a header, not ol
        const isBoldHeader = /^<(strong|b)>.*<\/(strong|b)>$/.test(content.trim()) ||
                             /^<ol><li><strong>/.test(content.trim()); // Nested bold in ol
        
        if (isBoldHeader) {
            // Treat as h2/h3 header instead
            return [{ ...block, content, type: 'h2' as const }];
        }

        // Numbered Lists (1. Item)
        if (/^\d+\.\s/.test(cleanText)) {
             // Attempt to strip the prefix from the actual HTML content
             // Pattern: Optional tags, Number, Dot, Optional closing tags, Whitespace/NBSP
             const prefixMatch = content.match(/^(\s*<[^>]+>)*\s*\d+\.(\s*<\/[^>]+>)*(\s|&nbsp;|\u00A0)+/);
             
             if (prefixMatch) {
                 return [{
                     ...block,
                     type: 'ol' as const,
                     content: content.replace(prefixMatch[0], '')
                 }];
             }
        }
        
        // Lettered Lists (a. Item)
        if (/^[a-z]\.\s/.test(cleanText)) {
             const prefixMatch = content.match(/^(\s*<[^>]+>)*\s*[a-z]\.(\s*<\/[^>]+>)*(\s|&nbsp;|\u00A0)+/);
             if (prefixMatch) {
                 return [{
                     ...block,
                     type: 'abc' as const,
                     content: content.replace(prefixMatch[0], '')
                 }];
             }
        }
    }
    
    return [{ ...block, content }];
  });
};

/**
 * Enhanced parseHtml with Swiss legal document support
 */
export const parseHtmlLegal = (html: string): Block[] => {
  const blocks = parseHtml(html);
  return applyLegalPatterns(blocks);
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
 * Stub language detection - hardcoded to 'de' for now
 */
export const detectLanguage = (): Language => {
  return 'de';
};

/**
 * Parse HTML to DocumentNode tree structure
 */
export const parseHtmlToTree = (html: string, language: Language = 'de'): ContainerDocumentNode => {
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
        const listItem: LeafDocumentNode = {
          id: generateId(),
          number: tagName === 'ol' ? `${index + 1}.` : null,
          type: 'list_item',
          contents: { [language]: getInnerHtml(li) },
        };
        list.children.push(listItem);
      });
      return;
    }

    // Paragraphs and divs - create content nodes
    if (tagName === 'p' || tagName === 'div') {
      const content = getInnerHtml(domNode);
      if (content) {
        const contentNode: LeafDocumentNode = {
          id: generateId(),
          number: null,
          type: 'content',
          contents: { [language]: content },
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
export const parseHtmlLegalToTree = (html: string, language: Language = 'de'): ContainerDocumentNode => {
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
          contents: { [language]: item.content },
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
        const listItem: LeafDocumentNode = {
          id: generateId(),
          number: tagName === 'ol' ? `${index + 1}.` : null,
          type: 'list_item',
          contents: { [language]: getInnerHtml(li) },
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
      const contentNode: LeafDocumentNode = {
        id: generateId(),
        number: null,
        type: 'content',
        contents: { [language]: content },
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

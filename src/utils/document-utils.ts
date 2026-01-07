import { Block, TreeNode } from '../types';
import DOMPurify from 'dompurify';

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const parseHtml = (html: string): Block[] => {
  // Sanitize before parsing
  const cleanHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 's', 'strike', 'span', 'code', 'sub', 'sup', 'p', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'br', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'type', 'rowspan', 'colspan'], // explicitly no on* attributes
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
        const isBlock = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'br', 'section', 'article', 'blockquote', 'header', 'footer', 'main', 'nav', 'table', 'thead', 'tbody', 'tr', 'td', 'th'].includes(childTag);
        
        if (isBlock) {
          flush();
          
          if (childTag === 'br') {
             // just flush
          } else if (childTag === 'table') {
             const tableEl = child as HTMLElement;
             const rows = Array.from(tableEl.querySelectorAll('tr'));
             const tableData = rows.map(tr => 
               Array.from(tr.querySelectorAll('td, th')).map(td => td.innerHTML.trim())
             );
             
             blocks.push({
               id: generateId(),
               content: 'Table', // Placeholder content
               type: 'table',
               depth: Math.min(depth, 5),
               tableData
             });
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
 * Detects if a table is a "layout table" (single column, multi-row, used for document structure)
 * vs a "data table" (2+ columns, used for actual tabular data)
 */
const isLayoutTable = (tableData: string[][]): boolean => {
  if (tableData.length < 2) return false; // Single row is not a layout table
  return tableData.every(row => row.length === 1);
};

/**
 * Explodes a layout table into individual blocks by parsing each cell's HTML
 */
const explodeLayoutTable = (tableData: string[][]): Block[] => {
  return tableData.flatMap(row => {
    const cellHtml = row[0];
    if (!cellHtml || !cellHtml.trim()) return []; // Skip empty cells
    return parseHtml(cellHtml); // Recursive parse
  });
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

    // 0. Table Explosion (FIRST - before other processing)
    if (block.type === 'table' && block.tableData) {
        // Single-column layout table -> Explode and recursively process
        if (isLayoutTable(block.tableData)) {
            const explodedBlocks = explodeLayoutTable(block.tableData);
            // Recursively apply legal patterns to exploded blocks
            return applyLegalPatterns(explodedBlocks);
        }
        
        // 2-column marker table -> Convert to list
        if (block.tableData.length === 1) {
            const row = block.tableData[0];
            if (row.length === 2) {
                const marker = row[0].replace(/&nbsp;/g, ' ').trim();
                const cellContent = row[1];
                
                if (/^\d+\.$/.test(marker)) {
                    return [{
                        ...block,
                        type: 'ol' as const,
                        content: cellContent,
                        tableData: undefined
                    }];
                }
                
                if (/^[a-z]\.$/.test(marker)) {
                    return [{
                        ...block,
                        type: 'abc' as const,
                        content: cellContent,
                        tableData: undefined
                    }];
                }
            }
        }
        
        // Real data table - keep as is
        return [block];
    }

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


export const convertToXml = (blocks: Block[]): string => {
    const escape = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<document>\n';
    blocks.forEach(block => {
        xml += `  <block id="${block.id}" type="${block.type}" depth="${block.depth}">\n`;
        xml += `    <content>${escape(block.content)}</content>\n`;
        xml += `  </block>\n`;
    });
    xml += '</document>';
    return xml;
};

export const convertToHtml = (blocks: Block[]): string => {
    const content = blocks.map(block => {
        const indent = block.depth * 20;
        
        if (block.type === 'table' && block.tableData) {
            const rows = block.tableData.map(row => 
                `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
            ).join('');
            return `<table data-id="${block.id}" style="margin-left: ${indent}px">${rows}</table>`;
        }
        
        if (block.type === 'abc') {
            return `<ol type="a" data-id="${block.id}" class="block-abc" style="margin-left: ${indent}px"><li>${block.content}</li></ol>`;
        }

        const tag = ['h1', 'h2', 'h3', 'p'].includes(block.type) ? block.type : 'div';
        if (block.type === 'ul') return `<ul data-id="${block.id}" style="margin-left: ${indent}px"><li>${block.content}</li></ul>`;
        if (block.type === 'ol') return `<ol data-id="${block.id}" style="margin-left: ${indent}px"><li>${block.content}</li></ol>`;

        return `<${tag} data-id="${block.id}" class="block-${block.type}" style="margin-left: ${indent}px">${block.content}</${tag}>`;
    }).join('\n');
    
    return `<!DOCTYPE html>
<html>
<head><title>Exported Document</title></head>
<body>
${content}
</body>
</html>`;
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

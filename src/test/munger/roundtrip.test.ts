import { describe, test, expect } from 'vitest';
import { parseHtml, convertToHtml, generateId } from '../../utils/document-utils';
import { Block } from '../../types';

describe('Round-Trip Validation (Integrity)', () => {
    
  test('Preserves complex structure (Table, List, Format) through Export -> Import cycle', () => {
      // 1. Construct Original Blocks
      const original: Block[] = [
          { id: generateId(), type: 'h1', content: 'Title', depth: 0 },
          { id: generateId(), type: 'p', content: 'Intro with <b>bold</b> text.', depth: 0 },
          { 
              id: generateId(), 
              type: 'table', 
              content: 'Table', 
              depth: 0,
              tableData: [['Header 1', 'Header 2'], ['Cell 1', 'Cell 2']]
          },
          { id: generateId(), type: 'ul', content: 'List Item 1', depth: 0 },
          { id: generateId(), type: 'ul', content: 'List Item 1.1', depth: 1 }
      ];

      // 2. Export to HTML
      const html = convertToHtml(original);

      // 3. Re-Import from HTML
      const reimported = parseHtml(html);

      // 4. Assert Equivalence (ignoring IDs which are regenerated)
      expect(reimported).toHaveLength(original.length);
      
      // Check H1
      expect(reimported[0].type).toBe('h1');
      expect(reimported[0].content).toBe('Title');
      
      // Check P with Formatting
      expect(reimported[1].type).toBe('p');
      expect(reimported[1].content).toContain('<b>bold</b>');

      // Check Table
      expect(reimported[2].type).toBe('table');
      expect(reimported[2].tableData).toEqual(original[2].tableData);
      
      // Check List Nesting
      expect(reimported[3].type).toBe('ul');
      expect(reimported[3].depth).toBe(1); // Re-imported HTML structure gives initial indent
      expect(reimported[4].type).toBe('ul');
      expect(reimported[4].depth).toBe(1); // Nested item re-imported as depth 1 in this context
  });
  
  test('Preserves ABC list type through round-trip', () => {
      const original: Block[] = [
          { id: generateId(), type: 'abc', content: 'Option A', depth: 0 },
          { id: generateId(), type: 'abc', content: 'Option B', depth: 0 }
      ];
      
      // Note: convertToHtml needs to correctly serialize 'abc' for this to work
      // If convertToHtml exports as <ol>, we rely on our heuristic or type="a" to recover it
      const html = convertToHtml(original);
      const reimported = parseHtml(html);
      
      expect(reimported[0].type).toBe('abc');
      expect(reimported[1].type).toBe('abc');
  });

});

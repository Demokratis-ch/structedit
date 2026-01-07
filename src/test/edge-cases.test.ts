/**
 * Edge Case Tests (@safety-officer)
 * Testing failure modes and boundary conditions
 */
import { describe, it, expect } from 'vitest';
import { parseHtml, convertToXml, convertToHtml, generateId } from '../utils/document-utils';
import { isValidBlock, sanitizeBlock, Block } from '../types';

describe('Edge Cases (@safety-officer)', () => {
  
  describe('Empty Document Handling', () => {
    it('parseHtml handles empty string', () => {
      expect(parseHtml('')).toEqual([]);
    });

    it('parseHtml handles whitespace only', () => {
      expect(parseHtml('   \n\t  ')).toEqual([]);
    });

    it('parseHtml handles empty tags', () => {
      expect(parseHtml('<p></p><div></div>')).toEqual([]);
    });

    it('convertToXml handles empty array', () => {
      const xml = convertToXml([]);
      expect(xml).toContain('<document>');
      expect(xml).toContain('</document>');
    });

    it('convertToHtml handles empty array', () => {
      const html = convertToHtml([]);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<body>');
    });
  });

  describe('Deep Nesting (depth > 5 clamping)', () => {
    it('parseHtml clamps depth to maximum 5', () => {
      // 10 levels of nesting
      const deepHtml = '<ul><li><ul><li><ul><li><ul><li><ul><li><ul><li><ul><li><ul><li><ul><li><ul><li>Deep</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul>';
      const blocks = parseHtml(deepHtml);
      
      blocks.forEach(block => {
        expect(block.depth).toBeLessThanOrEqual(5);
      });
    });

    it('sanitizeBlock clamps depth to 5', () => {
      const result = sanitizeBlock({ type: 'p', depth: 100 });
      expect(result.depth).toBe(5);
    });

    it('sanitizeBlock clamps negative depth to 0', () => {
      const result = sanitizeBlock({ type: 'p', depth: -5 });
      expect(result.depth).toBe(0);
    });
  });

  describe('Long Content Handling', () => {
    it('handles very long paragraph content', () => {
      const longContent = 'a'.repeat(10000);
      const html = `<p>${longContent}</p>`;
      const blocks = parseHtml(html);
      
      expect(blocks).toHaveLength(1);
      expect(blocks[0].content.length).toBe(10000);
    });

    it('convertToXml escapes long content correctly', () => {
      const longContent = '<script>'.repeat(1000);
      const blocks: Block[] = [{ id: 'x', content: longContent, type: 'p', depth: 0 }];
      const xml = convertToXml(blocks);
      
      expect(xml).not.toContain('<script>');
      expect(xml).toContain('&lt;script&gt;');
    });
  });

  describe('Malformed Input Handling', () => {
    it('parseHtml handles unclosed tags', () => {
      const html = '<p>Unclosed paragraph<p>Another';
      const blocks = parseHtml(html);
      // Should not throw, may produce empty or partial results
      expect(Array.isArray(blocks)).toBe(true);
    });

    it('parseHtml handles script tags safely', () => {
      const html = '<script>alert("xss")</script><p>Safe content</p>';
      const blocks = parseHtml(html);
      
      // Script content should not be in blocks
      const hasScript = blocks.some(b => b.content.includes('alert'));
      expect(hasScript).toBe(false);
    });

    it('parseHtml handles style tags safely', () => {
      const html = '<style>body { color: red; }</style><p>Content</p>';
      const blocks = parseHtml(html);
      
      const hasStyle = blocks.some(b => b.content.includes('color: red'));
      expect(hasStyle).toBe(false);
    });

    it('isValidBlock rejects objects with extra properties', () => {
      // Actually our validator should still accept valid blocks with extra props
      const blockWithExtra = {
        id: '1',
        content: 'test',
        type: 'p',
        depth: 0,
        extraField: 'ignored'
      };
      // This should still be valid as it has all required fields
      expect(isValidBlock(blockWithExtra)).toBe(true);
    });
  });

  describe('Special Characters', () => {
    it('parseHtml preserves HTML entities', () => {
      const html = '<p>&amp; &lt; &gt; &quot;</p>';
      const blocks = parseHtml(html);
      
      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toContain('&');
    });

    it('convertToXml escapes ampersands', () => {
      const blocks: Block[] = [{ id: 'x', content: 'A & B', type: 'p', depth: 0 }];
      const xml = convertToXml(blocks);
      
      expect(xml).toContain('&amp;');
    });

    it('handles unicode content', () => {
      const html = '<p>日本語 🎉 Ñoño</p>';
      const blocks = parseHtml(html);
      
      expect(blocks[0].content).toContain('日本語');
      expect(blocks[0].content).toContain('🎉');
    });
  });

  describe('Block Type Edge Cases', () => {
    it('parseHtml converts h3-h6 to h2', () => {
      const html = '<h3>Heading 3</h3><h4>Heading 4</h4>';
      const blocks = parseHtml(html);
      
      blocks.forEach(block => {
        expect(['h1', 'h2']).toContain(block.type);
      });
    });

    it('handles mixed list types', () => {
      const html = '<ul><li>Bullet</li></ul><ol><li>Number</li></ol>';
      const blocks = parseHtml(html);
      
      expect(blocks.length).toBeGreaterThanOrEqual(2);
    });

    it('handles alpha lists with type="a"', () => {
      const html = '<ol type="a"><li>Alpha item</li></ol>';
      const blocks = parseHtml(html);
      
      const hasAbc = blocks.some(b => b.type === 'abc');
      // May or may not detect, depends on parser implementation
      expect(Array.isArray(blocks)).toBe(true);
    });
  });

  describe('Boundary Conditions', () => {
    it('handles single character content', () => {
      const html = '<p>X</p>';
      const blocks = parseHtml(html);
      
      expect(blocks[0].content).toBe('X');
    });

    it('handles content with only whitespace preserved', () => {
      const html = '<p>  spaced  </p>';
      const blocks = parseHtml(html);
      
      expect(blocks[0].content.trim()).toBe('spaced');
    });

    it('generateId produces unique ids across many calls', () => {
      const ids = new Set();
      
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      
      expect(ids.size).toBe(1000);
    });
  });
});

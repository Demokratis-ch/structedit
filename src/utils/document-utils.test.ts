import { describe, it, expect } from 'vitest';
import { parseHtml, convertToXml, convertToHtml, generateId } from './document-utils';
import { Block } from '../types';

describe('Document Utils', () => {
  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('generates string IDs', () => {
      expect(typeof generateId()).toBe('string');
    });
  });

  describe('parseHtml', () => {
    it('parses simple paragraphs', () => {
      const html = '<p>Hello world</p>';
      const blocks = parseHtml(html);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toBe('Hello world');
      expect(blocks[0].type).toBe('p');
    });

    it('parses headings', () => {
      const html = '<h1>Title</h1><h2>Subtitle</h2>';
      const blocks = parseHtml(html);
      expect(blocks[0].type).toBe('h1');
      expect(blocks[1].type).toBe('h2');
    });

    it('parses unordered lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const blocks = parseHtml(html);
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(blocks[0].type).toBe('ul');
    });

    it('parses ordered lists', () => {
      const html = '<ol><li>First</li><li>Second</li></ol>';
      const blocks = parseHtml(html);
      expect(blocks[0].type).toBe('ol');
    });

    it('handles empty HTML', () => {
      const blocks = parseHtml('');
      expect(blocks).toHaveLength(0);
    });

    it('preserves inline formatting', () => {
      const html = '<p><b>Bold</b> and <i>italic</i></p>';
      const blocks = parseHtml(html);
      expect(blocks[0].content).toContain('<b>');
      expect(blocks[0].content).toContain('<i>');
    });

    it('enforces depth limit of 5', () => {
      const html = '<ul><li><ul><li><ul><li><ul><li><ul><li><ul><li>Deep</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul>';
      const blocks = parseHtml(html);
      blocks.forEach(block => {
        expect(block.depth).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('convertToXml', () => {
    it('converts blocks to valid XML', () => {
      const blocks: Block[] = [
        { id: 'a1', content: 'Hello', type: 'p', depth: 0 },
        { id: 'a2', content: 'World', type: 'h1', depth: 0 }
      ];
      const xml = convertToXml(blocks);
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<document>');
      expect(xml).toContain('</document>');
      expect(xml).toContain('id="a1"');
      expect(xml).toContain('type="p"');
    });

    it('escapes special characters', () => {
      const blocks: Block[] = [
        { id: 'x', content: '<script>&"test"</script>', type: 'p', depth: 0 }
      ];
      const xml = convertToXml(blocks);
      expect(xml).toContain('&lt;script&gt;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&quot;');
    });
  });

  describe('convertToHtml', () => {
    it('converts blocks to HTML document', () => {
      const blocks: Block[] = [
        { id: 'b1', content: 'Title', type: 'h1', depth: 0 },
        { id: 'b2', content: 'Paragraph', type: 'p', depth: 0 }
      ];
      const html = convertToHtml(blocks);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<h1');
      expect(html).toContain('Title');
      expect(html).toContain('<div');
    });

    it('applies indent based on depth', () => {
      const blocks: Block[] = [
        { id: 'c1', content: 'Nested', type: 'p', depth: 2 }
      ];
      const html = convertToHtml(blocks);
      expect(html).toContain('margin-left: 40px');
    });
  });

  describe('Round-trip (@struct-supervisor)', () => {
    it('parseHtml → convertToHtml → parseHtml produces equivalent structure', () => {
      const originalHtml = '<h1>Title</h1><p>Paragraph one</p><p>Paragraph two</p>';
      const blocks1 = parseHtml(originalHtml);
      const exportedHtml = convertToHtml(blocks1);
      const blocks2 = parseHtml(exportedHtml);

      expect(blocks2.length).toBe(blocks1.length);
      blocks1.forEach((block, i) => {
        expect(blocks2[i].type).toBe(block.type);
        expect(blocks2[i].content).toContain(block.content.replace(/<[^>]*>/g, '').trim().substring(0, 10));
      });
    });
  });
});

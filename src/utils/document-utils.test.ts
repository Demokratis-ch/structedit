import { describe, it, expect } from 'vitest';
import { parseHtml, generateId } from './document-utils';
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

});

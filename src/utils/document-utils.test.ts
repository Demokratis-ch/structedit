import { describe, it, expect } from 'vitest';
import { parseHtml, generateId, parseHtmlToTree, parseHtmlLegalToTree, detectLanguage } from './document-utils';
import { Block } from '../types';
import type { ContainerDocumentNode, HeadingDocumentNode, LeafDocumentNode } from '../types/document';
import { getNodeAtPath } from './tree-utils';

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

  describe('detectLanguage', () => {
    it('returns de by default', () => {
      expect(detectLanguage()).toBe('de');
    });

    it('returns de when given text', () => {
      expect(detectLanguage('some text')).toBe('de');
    });
  });

  describe('parseHtmlToTree', () => {
    it('creates document root', () => {
      const html = '<p>Hello</p>';
      const doc = parseHtmlToTree(html);
      expect(doc.type).toBe('document');
      expect(doc.id).toBeDefined();
      expect(doc.children).toBeDefined();
    });

    it('converts h1 to heading at depth 0', () => {
      const html = '<h1>Title</h1>';
      const doc = parseHtmlToTree(html);
      expect(doc.children.length).toBe(1);
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
      expect(heading.contents.de).toBe('Title');
    });

    it('converts h2 to heading nested under previous h1', () => {
      const html = '<h1>Chapter 1</h1><h2>Section 1.1</h2>';
      const doc = parseHtmlToTree(html);
      // h1 should be at root level
      expect(doc.children.length).toBe(1);
      const h1 = doc.children[0] as HeadingDocumentNode;
      expect(h1.type).toBe('heading');
      expect(h1.contents.de).toBe('Chapter 1');
      // h2 should be nested under h1
      expect(h1.children.length).toBe(1);
      const h2 = h1.children[0] as HeadingDocumentNode;
      expect(h2.type).toBe('heading');
      expect(h2.contents.de).toBe('Section 1.1');
    });

    it('converts h3 to heading nested under previous h2', () => {
      const html = '<h1>Chapter</h1><h2>Section</h2><h3>Subsection</h3>';
      const doc = parseHtmlToTree(html);
      const h1 = doc.children[0] as HeadingDocumentNode;
      const h2 = h1.children[0] as HeadingDocumentNode;
      const h3 = h2.children[0] as HeadingDocumentNode;
      expect(h3.type).toBe('heading');
      expect(h3.contents.de).toBe('Subsection');
    });

    it('converts p to content node', () => {
      const html = '<p>Some text</p>';
      const doc = parseHtmlToTree(html);
      expect(doc.children.length).toBe(1);
      const content = doc.children[0] as LeafDocumentNode;
      expect(content.type).toBe('content');
      expect(content.contents.de).toBe('Some text');
    });

    it('nests content under preceding heading', () => {
      const html = '<h1>Title</h1><p>Paragraph under title</p>';
      const doc = parseHtmlToTree(html);
      const h1 = doc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(1);
      const content = h1.children[0] as LeafDocumentNode;
      expect(content.type).toBe('content');
      expect(content.contents.de).toBe('Paragraph under title');
    });

    it('converts ul to list with list_item children', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const doc = parseHtmlToTree(html);
      expect(doc.children.length).toBe(1);
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      expect(list.children.length).toBe(2);
      const item1 = list.children[0] as LeafDocumentNode;
      expect(item1.type).toBe('list_item');
      expect(item1.contents.de).toBe('Item 1');
      expect(item1.number).toBeNull(); // ul has no numbering
    });

    it('converts ol with numbering in number field', () => {
      const html = '<ol><li>First</li><li>Second</li></ol>';
      const doc = parseHtmlToTree(html);
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      const item1 = list.children[0] as LeafDocumentNode;
      expect(item1.type).toBe('list_item');
      expect(item1.number).toBe('1.');
      const item2 = list.children[1] as LeafDocumentNode;
      expect(item2.number).toBe('2.');
    });

    it('preserves inline formatting in contents', () => {
      const html = '<p><b>Bold</b> and <i>italic</i></p>';
      const doc = parseHtmlToTree(html);
      const content = doc.children[0] as LeafDocumentNode;
      expect(content.contents.de).toContain('<b>');
      expect(content.contents.de).toContain('<i>');
    });

    it('uses de language by default', () => {
      const html = '<p>German text</p>';
      const doc = parseHtmlToTree(html);
      const content = doc.children[0] as LeafDocumentNode;
      expect(content.contents.de).toBe('German text');
      expect(content.contents.en).toBeUndefined();
    });

    it('handles multiple h1 headings', () => {
      const html = '<h1>Chapter 1</h1><p>Content 1</p><h1>Chapter 2</h1><p>Content 2</p>';
      const doc = parseHtmlToTree(html);
      // Both h1s should be at root level
      expect(doc.children.length).toBe(2);
      const ch1 = doc.children[0] as HeadingDocumentNode;
      const ch2 = doc.children[1] as HeadingDocumentNode;
      expect(ch1.contents.de).toBe('Chapter 1');
      expect(ch2.contents.de).toBe('Chapter 2');
      // Each should have their content nested
      expect(ch1.children.length).toBe(1);
      expect(ch2.children.length).toBe(1);
    });

    it('handles skipped heading levels (h1 then h3)', () => {
      const html = '<h1>Chapter</h1><h3>Subsection</h3>';
      const doc = parseHtmlToTree(html);
      const h1 = doc.children[0] as HeadingDocumentNode;
      // h3 should be nested directly under h1 (no phantom h2)
      expect(h1.children.length).toBe(1);
      const h3 = h1.children[0] as HeadingDocumentNode;
      expect(h3.type).toBe('heading');
      expect(h3.contents.de).toBe('Subsection');
    });
  });

  describe('parseHtmlLegalToTree', () => {
    it('detects Art. pattern as heading', () => {
      const html = '<p>Art. 1 Some article title</p><p>Article content here.</p>';
      const doc = parseHtmlLegalToTree(html);
      // Art. should become a heading
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
      expect(heading.contents.de).toContain('Art. 1');
    });

    it('detects roman numeral as heading', () => {
      const html = '<p>I. First Section</p><p>Content of section</p>';
      const doc = parseHtmlLegalToTree(html);
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
      expect(heading.contents.de).toContain('I.');
    });

    it('converts lettered items to list_item with number', () => {
      const html = '<p>a. First item</p><p>b. Second item</p>';
      const doc = parseHtmlLegalToTree(html);
      // Should be converted to a list with lettered items
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      const item1 = list.children[0] as LeafDocumentNode;
      expect(item1.type).toBe('list_item');
      expect(item1.number).toBe('a.');
    });
  });

});

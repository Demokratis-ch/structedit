import { describe, it, expect } from 'vitest';
import { parseHtmlLegal } from '../utils/document-utils';
import * as fs from 'fs';
import * as path from 'path';

// Helper to read fixture file
const readFixture = (filename: string) => {
  return fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf-8');
};

describe('Real Document Conversion (Mammoth Output)', () => {
  
  describe('Revision Personalverordnung (PeV)', () => {
    const html = readFixture('pev-real.html');
    const blocks = parseHtmlLegal(html);

    it('contains valid blocks', () => {
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('detects Art. headings', () => {
        // Look for any detected article headings
        const articles = blocks.filter(b => b.type === 'h3');
        // Note: Mammoth might wrap things differently than Docling, 
        // effectively testing robustness of our parser
        expect(articles.length).toBeGreaterThan(0); 
    });
    
    it('detects Roman numeral sections', () => {
         const sections = blocks.filter(b => b.type === 'h2');
         // We expect at least one section like "I." or "II."
         expect(sections.length).toBeGreaterThan(0);
    });
  });

  describe('Ref. VIV', () => {
    const html = readFixture('viv-real.html');
    const blocks = parseHtmlLegal(html);

    it('detects structure', () => {
       expect(blocks.length).toBeGreaterThan(10);
       
       // Check for verified known content
       const title = blocks.find(b => b.content.includes('Revision Verordnung'));
       expect(title).toBeDefined();
       
       const sectionI = blocks.find(b => b.content.trim() === 'I.');
       expect(sectionI?.type).toBe('h2');
    });
  });
  
  describe('Ref. VLG', () => {
      const html = readFixture('vlg-real.html');
      const blocks = parseHtmlLegal(html);
      
      it('has robust parsing', () => {
          expect(blocks.length).toBeGreaterThan(20);
      });
  });
});

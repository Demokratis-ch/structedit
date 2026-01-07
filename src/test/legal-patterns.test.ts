/**
 * Swiss Legal Document Pattern Tests
 * Tests for Art./Abs., Roman numerals, lettered items
 */
import { describe, it, expect } from 'vitest';
import { 
  detectLegalHeadingType, 
  detectLetteredItem, 
  applyLegalPatterns,
  parseHtmlLegal 
} from '../utils/document-utils';
import { Block } from '../types';

describe('Swiss Legal Document Patterns', () => {
  
  describe('detectLegalHeadingType', () => {
    it('detects Art. X as h3', () => {
      expect(detectLegalHeadingType('Art. 1')).toBe('h3');
      expect(detectLegalHeadingType('Art. 23')).toBe('h3');
      expect(detectLegalHeadingType('Art. 23a')).toBe('h3');
    });

    it('detects Art. X Abs. Y as h3', () => {
      expect(detectLegalHeadingType('Art. 1 Abs. 2')).toBe('h3');
      expect(detectLegalHeadingType('Art. 23 Abs. 1 (geändert)')).toBe('h3');
    });

    it('detects Roman numeral sections as h2', () => {
      expect(detectLegalHeadingType('I. Section title')).toBe('h2');
      expect(detectLegalHeadingType('II. Another section')).toBe('h2');
      expect(detectLegalHeadingType('III. Third')).toBe('h2');
      expect(detectLegalHeadingType('IV. Fourth')).toBe('h2');
      expect(detectLegalHeadingType('V. Fifth')).toBe('h2');
    });

    it('returns null for regular text', () => {
      expect(detectLegalHeadingType('Regular paragraph text')).toBeNull();
      expect(detectLegalHeadingType('Der Grosse Rat')).toBeNull();
    });
  });

  describe('detectLetteredItem', () => {
    it('detects a., b., c. items', () => {
      expect(detectLetteredItem('a. first item')).toBe(true);
      expect(detectLetteredItem('b. second item')).toBe(true);
      expect(detectLetteredItem('c. third item')).toBe(true);
    });

    it('does not detect non-lettered items', () => {
      expect(detectLetteredItem('1. numbered item')).toBe(false);
      expect(detectLetteredItem('A. uppercase')).toBe(false);
      expect(detectLetteredItem('Regular text')).toBe(false);
    });
  });

  describe('applyLegalPatterns', () => {
    it('converts Art. paragraphs to h3 headings', () => {
      const blocks: Block[] = [
        { id: '1', content: 'Art. 1 Abs. 2 (geändert)', type: 'p', depth: 0 }
      ];
      const result = applyLegalPatterns(blocks);
      expect(result[0].type).toBe('h3');
    });

    it('converts Roman numeral paragraphs to h2 headings', () => {
      const blocks: Block[] = [
        { id: '1', content: 'I. Änderung Personalverordnung', type: 'p', depth: 0 }
      ];
      const result = applyLegalPatterns(blocks);
      expect(result[0].type).toBe('h2');
    });

    it('converts lettered items to abc type', () => {
      const blocks: Block[] = [
        { id: '1', content: 'a. sie als Ratschreiber tätig sind;', type: 'p', depth: 0 }
      ];
      const result = applyLegalPatterns(blocks);
      expect(result[0].type).toBe('abc');
    });

    it('preserves existing heading types', () => {
      const blocks: Block[] = [
        { id: '1', content: 'Title', type: 'h1', depth: 0 }
      ];
      const result = applyLegalPatterns(blocks);
      expect(result[0].type).toBe('h1');
    });
  });

  describe('parseHtmlLegal (integration)', () => {
    it('parses HTML with legal patterns applied', () => {
      const html = `
        <p>I. Änderung Personalverordnung (PeV)</p>
        <p>Art. 1 Abs. 2 (geändert)</p>
        <p>Regular paragraph text.</p>
        <p>a. first subsection</p>
        <p>b. second subsection</p>
      `;
      const blocks = parseHtmlLegal(html);
      
      expect(blocks.find(b => b.content.includes('I. Änderung'))?.type).toBe('h2');
      expect(blocks.find(b => b.content.includes('Art. 1'))?.type).toBe('h3');
      expect(blocks.find(b => b.content.includes('Regular'))?.type).toBe('p');
      expect(blocks.find(b => b.content.includes('a. first'))?.type).toBe('abc');
    });
  });

  describe('Real AI Canton Document Patterns', () => {
    it('handles Revision Personalverordnung structure', () => {
      // Based on actual document structure
      const blocks: Block[] = [
        { id: '1', content: 'Arbeitsversion Revision Personalverordnung (PeV)', type: 'p', depth: 0 },
        { id: '2', content: 'Kanton Appenzell Innerrhoden 172.310-2025', type: 'p', depth: 0 },
        { id: '3', content: 'I. Änderung Personalverordnung (PeV) vom 30. November 1998:', type: 'p', depth: 0 },
        { id: '4', content: 'Art. 1 Abs. 2 (geändert)', type: 'p', depth: 0 },
        { id: '5', content: '2 Die Personalregelungen für die Mitarbeitenden...', type: 'p', depth: 0 },
        { id: '6', content: 'Art. 23a (neu)', type: 'p', depth: 0 },
        { id: '7', content: 'a. sie als Ratschreiber oder Departementssekretär tätig sind;', type: 'p', depth: 0 },
        { id: '8', content: 'b. sie ein Amt oder eine Dienststelle leiten;', type: 'p', depth: 0 },
        { id: '9', content: 'II.', type: 'p', depth: 0 },
      ];
      
      const result = applyLegalPatterns(blocks);
      
      // Check structure detection
      expect(result[2].type).toBe('h2'); // I. Änderung...
      expect(result[3].type).toBe('h3'); // Art. 1 Abs. 2
      expect(result[4].type).toBe('p');  // Regular numbered para
      expect(result[5].type).toBe('h3'); // Art. 23a
      expect(result[6].type).toBe('abc'); // a. item
      expect(result[7].type).toBe('abc'); // b. item
      expect(result[8].type).toBe('h2'); // II.
    });
  });

  describe('Full Document Integration (AI Canton Fixture)', () => {
    it('correctly detects types in full Revision Personalverordnung', async () => {
      // Dynamically import fixture to keep test file clean
      const { REVISION_PERSONALVERORDNUNG_HTML, EXPECTED_BLOCK_TYPES } = await import('./fixtures/ai-canton');
      
      const blocks = parseHtmlLegal(REVISION_PERSONALVERORDNUNG_HTML);
      
      // Verify we got blocks
      expect(blocks.length).toBeGreaterThan(30);
      
      // Check key patterns are detected
      const sectionI = blocks.find(b => b.content.startsWith('I. Änderung'));
      expect(sectionI?.type).toBe('h2');
      
      const art1 = blocks.find(b => b.content.startsWith('Art. 1 Abs.'));
      expect(art1?.type).toBe('h3');
      
      const letteredA = blocks.find(b => b.content.startsWith('a. sie als'));
      expect(letteredA?.type).toBe('abc');
      
      const sectionII = blocks.find(b => b.content === 'II.');
      expect(sectionII?.type).toBe('h2');
      
      const sectionIV = blocks.find(b => b.content === 'IV.');
      expect(sectionIV?.type).toBe('h2');
      
      // Count detected patterns
      const h2Count = blocks.filter(b => b.type === 'h2').length;
      const h3Count = blocks.filter(b => b.type === 'h3').length;
      const abcCount = blocks.filter(b => b.type === 'abc').length;
      
      expect(h2Count).toBeGreaterThanOrEqual(4); // I., II., III., IV.
      expect(h3Count).toBeGreaterThanOrEqual(6); // Art. 1, 2, 3, 7a, 23a, 26
      expect(abcCount).toBe(3); // a., b., c.
    });
  });
});

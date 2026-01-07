import { describe, test, expect } from 'vitest';
import { parseHtmlLegal } from '../../utils/document-utils';

describe('Table Explosion (Layout Tables)', () => {

  test('Explodes single-column layout table into individual blocks', () => {
    // Simulating a Swiss legal doc structure: single-column table with articles
    const html = `
      <table>
        <tr><td><p>Art. Regelungsbereich</p><p><sup>1</sup> Dieses Gesetz regelt...</p></td></tr>
        <tr><td><p>Art. Stimmrecht</p><p><sup>1</sup> Das Stimmrecht umfasst...</p></td></tr>
      </table>
    `;
    const blocks = parseHtmlLegal(html);
    
    // Should NOT be 1 table block
    // Should be exploded into multiple p blocks
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0].type).not.toBe('table');
    expect(blocks[0].type).toBe('p');
    expect(blocks[0].content).toContain('Art. Regelungsbereich');
  });

  test('Explodes layout table with embedded lists', () => {
    const html = `
      <table>
        <tr>
          <td>
            <p>Art. Einleitung</p>
          </td>
        </tr>
        <tr>
          <td>
            <p>Art. Änderungen</p>
            <ol>
              <li>Verschiebung oder Absage</li>
              <li>ersatzweise Anordnung</li>
            </ol>
          </td>
        </tr>
      </table>
    `;
    const blocks = parseHtmlLegal(html);
    
    // Should extract the paragraph and list items across both rows
    expect(blocks.length).toBeGreaterThan(2);
    
    // Find the list items
    const listBlocks = blocks.filter(b => b.type === 'ol');
    expect(listBlocks.length).toBe(2);
    expect(listBlocks[0].content).toContain('Verschiebung');
  });

  test('Keeps real data tables (2+ columns) as table blocks', () => {
    const html = `
      <table>
        <tr><th>Geltendes Recht</th><th>Revision</th></tr>
        <tr><td>Art. 1</td><td>Art. 1 (geändert)</td></tr>
      </table>
    `;
    const blocks = parseHtmlLegal(html);
    
    // Should remain as 1 table block
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('table');
    expect(blocks[0].tableData).toBeDefined();
    expect(blocks[0].tableData![0].length).toBe(2); // 2 columns
  });

  test('Converts 2-column marker table to list blocks', () => {
    // This is the existing behavior from legal_hierarchy.test.ts
    const html = `
      <table>
        <tr><td>1.</td><td>First item</td></tr>
      </table>
    `;
    const blocks = parseHtmlLegal(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('ol');
    expect(blocks[0].content).toBe('First item');
  });

});

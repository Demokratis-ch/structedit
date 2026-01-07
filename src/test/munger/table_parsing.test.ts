import { describe, test, expect } from 'vitest';
import { parseHtml } from '../../utils/document-utils';

describe('Table Parsing Logic', () => {
    
  test('Parses simple <table> into BlockType.table with 2D data', () => {
    const html = `
      <div>
        <p>Pre-text</p>
        <table>
          <tr><td>A1</td><td>B1</td></tr>
          <tr><td>A2</td><td>B2</td></tr>
        </table>
        <p>Post-text</p>
      </div>
    `;

    const blocks = parseHtml(html);
    
    // Expect 3 blocks: p, table, p
    expect(blocks.length).toBe(3);
    expect(blocks[1].type).toBe('table');
    expect(blocks[1].tableData).toBeDefined();
    
    // Verify Grid
    const grid = blocks[1].tableData;
    expect(grid).toEqual([
      ['A1', 'B1'],
      ['A2', 'B2']
    ]);
  });

  test('Handles table headers (th) matches', () => {
    const html = `
      <table>
        <tr><th>Header 1</th><th>Header 2</th></tr>
        <tr><td>Value 1</td><td>Value 2</td></tr>
      </table>
    `;
    
    const blocks = parseHtml(html);
    expect(blocks[0].type).toBe('table');
    expect(blocks[0].tableData).toEqual([
      ['Header 1', 'Header 2'],
      ['Value 1', 'Value 2']
    ]);
  });

});

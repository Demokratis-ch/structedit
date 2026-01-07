import { describe, test, expect } from 'vitest';
import { parseHtml } from '../../utils/document-utils';

describe('Table Header Parsing', () => {
    
  test('Preserves content inside <thead> and <th>', () => {
    const html = `
      <table>
        <thead>
          <tr>
            <th>Header 1</th>
            <th>Header 2</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cell 1</td>
            <td>Cell 2</td>
          </tr>
        </tbody>
      </table>
    `;

    const blocks = parseHtml(html);
    const tableBlock = blocks.find(b => b.type === 'table');
    
    expect(tableBlock).toBeDefined();
    expect(tableBlock?.tableData).toBeDefined();
    
    const data = tableBlock!.tableData!;
    
    // Check if header row exists
    expect(data.length).toBe(2); // Should be 2 rows
    expect(data[0][0]).toBe('Header 1');
    expect(data[0][1]).toBe('Header 2');
    
    // Check body row
    expect(data[1][0]).toBe('Cell 1');
  });

});

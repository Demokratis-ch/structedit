import { describe, test, expect } from 'vitest';
import { parseHtmlLegal } from '../../utils/document-utils';

describe('Legal Hierarchy Refinement', () => {

  test('Normalizes superscript paragraph numbers (<sup>1</sup> -> 1 )', () => {
    // Input simulating Mammoth output for legal text
    const html = `
      <p><sup>1</sup> Wird eine Person in ein Amt gewählt...</p>
    `;
    const blocks = parseHtmlLegal(html);
    
    expect(blocks).toHaveLength(1);
    // Should strip <sup> tags but keep the number
    expect(blocks[0].content).toBe('1 Wird eine Person in ein Amt gewählt...');
    // Should NOT contain <sup> tags
    expect(blocks[0].content).not.toContain('<sup>');
  });

  test('Resurrects flattened numbered lists (1. Item -> ol)', () => {
    const html = `
      <p>1. Sie teilt dem für die Wahl verantwortlichen Organ...</p>
      <p>2. Wird das neue Amt nicht angenommen...</p>
      <p>3.&nbsp;Unbreakable space variant</p>
      <p><strong>4.</strong> Bold number variant</p>
    `;
    const blocks = parseHtmlLegal(html);
    
    expect(blocks).toHaveLength(4);
    
    // Case 1: Standard space
    expect(blocks[0].type).toBe('ol');
    expect(blocks[0].content).toBe('Sie teilt dem für die Wahl verantwortlichen Organ...');
    
    // Case 2: Standard space
    expect(blocks[1].type).toBe('ol');
    
    // Case 3: NBSP
    expect(blocks[2].type).toBe('ol');
    expect(blocks[2].content).toBe('Unbreakable space variant');
    
    // Case 4: Bold tag
    expect(blocks[3].type).toBe('ol');
    expect(blocks[3].content).toBe('Bold number variant');
  });
  
  test('Resurrects lists from layout tables (Table -> ol)', () => {
    // Simulating a list that is actually a 2-column table
    const html = `
      <table>
        <tr>
          <td>1.</td>
          <td>Item from table</td>
        </tr>
      </table>
    `;
    const blocks = parseHtmlLegal(html);
    
    // Ideally, this should be detected as a list
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('ol');
    expect(blocks[0].content).toBe('Item from table');
  });

  test('Resurrects flattened lettered lists (a. Item -> abc)', () => {
    const html = `
      <p>a. text example</p>
      <p>b. another example</p>
    `;
    const blocks = parseHtmlLegal(html);
    
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('abc');
    // Content should strip the prefix "a. "
    // Note: The existing logic might keep it or strip it depending on implementation.
    // Ideally for 'abc' type blocks, we want the content without the marker if the renderer adds it.
    // Let's assume for now we clean it up.
    expect(blocks[0].content).toBe('text example');
  });

});

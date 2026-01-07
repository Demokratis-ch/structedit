import { describe, test, expect } from 'vitest';
import { parseHtml } from '../../utils/document-utils';

describe('Complex List Parsing', () => {
    
  test('Parses nested unordered lists (ul > li > ul)', () => {
    const html = `
      <ul>
        <li>Item 1</li>
        <li>
          Item 2
          <ul>
            <li>Item 2.1</li>
            <li>Item 2.2</li>
          </ul>
        </li>
      </ul>
    `;
    const blocks = parseHtml(html);
    // Expected: Item 1 (depth 0), Item 2 (depth 0), Item 2.1 (depth 1), Item 2.2 (depth 1)
    expect(blocks).toHaveLength(4);
    expect(blocks[2].depth).toBe(2);
    expect(blocks[2].type).toBe('ul');
  });

  test('Parses mixed lists (ul > li > ol)', () => {
    const html = `
      <ul>
        <li>Item 1</li>
        <li>
          Item 2
          <ol>
            <li>Item 2.1</li>
          </ol>
        </li>
      </ul>
    `;
    const blocks = parseHtml(html);
    expect(blocks).toHaveLength(3);
    expect(blocks[2].type).toBe('ol');
    expect(blocks[2].depth).toBe(2);
  });

  test('Detects lettered lists (type="a")', () => {
    const html = `
      <ol type="a">
        <li>Item a</li>
        <li>Item b</li>
      </ol>
    `;
    const blocks = parseHtml(html);
    // Ideally this should be 'abc' type, or at least 'ol'
    // Current implementation might default to 'ol'
    expect(blocks[0].type).toBe('abc'); 
  });

  test('Detects lettered lists via heuristics (a. Content)', () => {
    const html = `
      <ol>
        <li>a. First letter</li>
        <li>b. Second letter</li>
      </ol>
    `;
    const blocks = parseHtml(html);
    // Should detect 'abc' based on content pattern if attribute missing
    expect(blocks[0].type).toBe('abc');
  });

});

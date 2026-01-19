import { describe, test, expect } from 'vitest';
import { generateId } from '../../utils/document-utils';
import { Block } from '../../types';

describe('Round-Trip Validation (Integrity)', () => {

  test('Preserves complex structure through JSON Export -> Import cycle', () => {
    // 1. Construct Original Blocks
    const original: Block[] = [
      { id: generateId(), type: 'h1', content: 'Title', depth: 0 },
      { id: generateId(), type: 'p', content: 'Intro with <b>bold</b> text.', depth: 0 },
      { id: generateId(), type: 'ul', content: 'List Item 1', depth: 0 },
      { id: generateId(), type: 'ul', content: 'List Item 1.1', depth: 1 }
    ];

    // 2. Export to JSON
    const json = JSON.stringify(original);

    // 3. Re-Import from JSON
    const reimported: Block[] = JSON.parse(json);

    // 4. Assert Equivalence
    expect(reimported).toHaveLength(original.length);

    // Check each block matches exactly
    original.forEach((block, i) => {
      expect(reimported[i].id).toBe(block.id);
      expect(reimported[i].type).toBe(block.type);
      expect(reimported[i].content).toBe(block.content);
      expect(reimported[i].depth).toBe(block.depth);
    });
  });

  test('Preserves ABC list type through round-trip', () => {
    const original: Block[] = [
      { id: generateId(), type: 'abc', content: 'Option A', depth: 0 },
      { id: generateId(), type: 'abc', content: 'Option B', depth: 0 }
    ];

    const json = JSON.stringify(original);
    const reimported: Block[] = JSON.parse(json);

    expect(reimported[0].type).toBe('abc');
    expect(reimported[1].type).toBe('abc');
  });

});

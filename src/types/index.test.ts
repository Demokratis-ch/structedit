import { describe, it, expect } from 'vitest';
import { isValidBlockType, isValidBlock, sanitizeBlock } from './index';

describe('Type Validators', () => {
  describe('isValidBlockType', () => {
    it('returns true for valid block types', () => {
      expect(isValidBlockType('p')).toBe(true);
      expect(isValidBlockType('h1')).toBe(true);
      expect(isValidBlockType('h2')).toBe(true);
      expect(isValidBlockType('ul')).toBe(true);
      expect(isValidBlockType('ol')).toBe(true);
      expect(isValidBlockType('abc')).toBe(true);
    });

    it('returns false for invalid block types', () => {
      expect(isValidBlockType('invalid')).toBe(false);
      expect(isValidBlockType('')).toBe(false);
      expect(isValidBlockType('div')).toBe(false);
    });
  });

  describe('isValidBlock', () => {
    it('returns true for valid blocks', () => {
      expect(isValidBlock({
        id: 'abc123',
        content: 'Hello world',
        type: 'p',
        depth: 0
      })).toBe(true);
    });

    it('returns false for blocks with invalid type', () => {
      expect(isValidBlock({
        id: 'abc123',
        content: 'Hello',
        type: 'invalid',
        depth: 0
      })).toBe(false);
    });

    it('returns false for blocks with depth > 5', () => {
      expect(isValidBlock({
        id: 'abc123',
        content: 'Hello',
        type: 'p',
        depth: 6
      })).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isValidBlock(null)).toBe(false);
      expect(isValidBlock(undefined)).toBe(false);
    });

    it('returns false for missing fields', () => {
      expect(isValidBlock({ id: 'abc' })).toBe(false);
      expect(isValidBlock({ id: 'abc', content: 'x' })).toBe(false);
    });
  });

  describe('sanitizeBlock', () => {
    it('returns valid block unchanged', () => {
      const block = { id: 'abc', content: 'Hello', type: 'h1' as const, depth: 2 };
      expect(sanitizeBlock(block)).toEqual(block);
    });

    it('clamps depth to 0-5 range', () => {
      expect(sanitizeBlock({ type: 'p', depth: -1 })).toMatchObject({ depth: 0 });
      expect(sanitizeBlock({ type: 'p', depth: 10 })).toMatchObject({ depth: 5 });
    });

    it('defaults missing type to p', () => {
      expect(sanitizeBlock({})).toMatchObject({ type: 'p' });
    });

    it('generates id if missing', () => {
      const result = sanitizeBlock({});
      expect(result.id).toBeDefined();
      expect(result.id.length).toBeGreaterThan(0);
    });
  });
});

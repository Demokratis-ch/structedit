import { describe, it, expect } from 'vitest';
import { isValidNode, isValidDocument, exampleDocument } from './document';

describe('Document validation', () => {
  it('validates the example document', () => {
    expect(isValidDocument(exampleDocument)).toBe(true);
  });

  it('validates individual nodes', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'content',
      contents: { en: 'Hello' }
    })).toBe(true);
  });

  it('rejects nodes with invalid type', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'invalid',
      contents: {}
    })).toBe(false);
  });

  it('rejects nodes with duplicate ids', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        { id: '2', number: null, type: 'content', contents: { en: 'A' } },
        { id: '2', number: null, type: 'content', contents: { en: 'B' } }
      ]
    })).toBe(false);
  });

  it('rejects list_item outside of list', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        { id: '2', number: null, type: 'list_item', contents: { en: 'Item' } }
      ]
    })).toBe(false);
  });

  it('accepts list_item inside list', () => {
    expect(isValidDocument({
      id: '1',
      number: null,
      type: 'document',
      children: [
        {
          id: '2',
          number: null,
          type: 'list',
          children: [
            { id: '3', number: '1.', type: 'list_item', contents: { en: 'Item' } }
          ]
        }
      ]
    })).toBe(true);
  });

  it('rejects container nodes with contents', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'document',
      children: [],
      contents: { en: 'Should not have this' }
    })).toBe(false);
  });

  it('rejects leaf nodes with children', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'content',
      contents: { en: 'Text' },
      children: []
    })).toBe(false);
  });

  it('rejects invalid language keys in contents', () => {
    expect(isValidNode({
      id: '1',
      number: null,
      type: 'content',
      contents: { xyz: 'Invalid language' }
    })).toBe(false);
  });
});

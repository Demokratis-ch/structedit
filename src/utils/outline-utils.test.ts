import { describe, expect, test } from 'vitest';
import type { ContainerDocumentNode } from '../types/document';
import { getDocumentOutline } from './outline-utils';

const makeDoc = (...children: ContainerDocumentNode['children']): ContainerDocumentNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children,
});

describe('getDocumentOutline', () => {
  test('returns empty array for document with no headings', () => {
    const doc = makeDoc({
      id: 'c1',
      number: null,
      type: 'CONTENT',
      format: 'TEXT',
      contents: { de: 'Hello' },
      children: [],
    });
    expect(getDocumentOutline(doc, 'de')).toEqual([]);
  });

  test('extracts a single top-level heading', () => {
    const doc = makeDoc({
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Einleitung' },
      children: [],
    });
    expect(getDocumentOutline(doc, 'de')).toEqual([
      { id: 'h1', number: '1', text: 'Einleitung', depth: 0 },
    ]);
  });

  test('extracts nested headings with correct depths', () => {
    const doc = makeDoc({
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Top' },
      children: [
        {
          id: 'h2',
          number: '1.1',
          type: 'HEADING',
          format: 'TEXT',
          contents: { de: 'Nested' },
          children: [
            {
              id: 'h3',
              number: '1.1.1',
              type: 'HEADING',
              format: 'TEXT',
              contents: { de: 'Deep' },
              children: [],
            },
          ],
        },
      ],
    });
    expect(getDocumentOutline(doc, 'de')).toEqual([
      { id: 'h1', number: '1', text: 'Top', depth: 0 },
      { id: 'h2', number: '1.1', text: 'Nested', depth: 1 },
      { id: 'h3', number: '1.1.1', text: 'Deep', depth: 2 },
    ]);
  });

  test('uses specified language for text', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'German', fr: 'French' },
      children: [],
    });
    expect(getDocumentOutline(doc, 'fr')).toEqual([
      { id: 'h1', number: null, text: 'French', depth: 0 },
    ]);
  });

  test('falls back to first available language when specified language is missing', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { en: 'English only' },
      children: [],
    });
    expect(getDocumentOutline(doc, 'de')).toEqual([
      { id: 'h1', number: null, text: 'English only', depth: 0 },
    ]);
  });

  test('strips HTML tags from heading content', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: '<strong>Bold</strong> and <em>italic</em> text' },
      children: [],
    });
    expect(getDocumentOutline(doc, 'de')).toEqual([
      { id: 'h1', number: null, text: 'Bold and italic text', depth: 0 },
    ]);
  });

  test('includes heading number when present', () => {
    const doc = makeDoc(
      {
        id: 'h1',
        number: 'Art. 1',
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'With number' },
        children: [],
      },
      {
        id: 'h2',
        number: null,
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Without number' },
        children: [],
      }
    );
    const result = getDocumentOutline(doc, 'de');
    expect(result[0].number).toBe('Art. 1');
    expect(result[1].number).toBeNull();
  });

  test('ignores non-heading nodes (content, list, etc.)', () => {
    const doc = makeDoc(
      {
        id: 'c1',
        number: null,
        type: 'CONTENT',
        format: 'TEXT',
        contents: { de: 'Text' },
        children: [],
      },
      { id: 'l1', number: null, type: 'LIST', children: [] },
      {
        id: 'h1',
        number: null,
        type: 'HEADING',
        format: 'TEXT',
        contents: { de: 'Only heading' },
        children: [
          {
            id: 'c2',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'More text' },
            children: [],
          },
        ],
      }
    );
    expect(getDocumentOutline(doc, 'de')).toEqual([
      { id: 'h1', number: null, text: 'Only heading', depth: 0 },
    ]);
  });

  test('returns empty text for heading with no content in any language', () => {
    const doc = makeDoc({
      id: 'h1',
      number: null,
      type: 'HEADING',
      format: 'TEXT',
      contents: {},
      children: [],
    });
    expect(getDocumentOutline(doc, 'de')).toEqual([{ id: 'h1', number: null, text: '', depth: 0 }]);
  });
});

import { describe, expect, it } from 'vitest';
import type { HeadingDocumentNode } from '../../types/document';
import { headingNumberExtractTransform } from './heading-number-extract';
import { content, createDoc, heading } from './test-helpers';

describe('headingNumberExtractTransform', () => {
  it('extracts roman numeral from heading', () => {
    const input = createDoc([heading('I. Allgemeine Bestimmungen')]);

    const result = headingNumberExtractTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBe('I.');
    expect(h.contents.de).toBe('Allgemeine Bestimmungen');
  });

  it('extracts article number from heading', () => {
    const input = createDoc([heading('§ 31 Übergangsbestimmung')]);

    const result = headingNumberExtractTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBe('§ 31');
    expect(h.contents.de).toBe('Übergangsbestimmung');
  });

  it('extracts full article ref with Abs.', () => {
    const input = createDoc([heading('§ 10a Abs. 3')]);

    const result = headingNumberExtractTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBe('§ 10a Abs. 3');
    expect(h.contents.de).toBe('');
  });

  it('extracts uppercase letter section', () => {
    const input = createDoc([heading('A. Allgemeines')]);

    const result = headingNumberExtractTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBe('A.');
    expect(h.contents.de).toBe('Allgemeines');
  });

  it('extracts Bst. pattern', () => {
    const input = createDoc([heading('§ 29 Abs. 1 Bst. f')]);

    const result = headingNumberExtractTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBe('§ 29 Abs. 1 Bst. f');
    expect(h.contents.de).toBe('');
  });

  it('leaves heading unchanged if no pattern matches', () => {
    const input = createDoc([heading('Some title')]);

    const result = headingNumberExtractTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBeNull();
    expect(h.contents.de).toBe('Some title');
  });

  it('does not extract number from middle of text', () => {
    const input = createDoc([heading('Lorem § 10a ipsum')]);

    const result = headingNumberExtractTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBeNull();
    expect(h.contents.de).toBe('Lorem § 10a ipsum');
  });

  it('does not extract roman numeral from middle of text', () => {
    const input = createDoc([heading('See section I. for details')]);

    const result = headingNumberExtractTransform(input, 'de');

    const h = result.children[0] as HeadingDocumentNode;
    expect(h.number).toBeNull();
    expect(h.contents.de).toBe('See section I. for details');
  });

  it('does not re-extract number from heading that already has one', () => {
    const h: HeadingDocumentNode = {
      id: 'test',
      number: 'existing',
      type: 'heading',
      format: 'TEXT',
      contents: { de: 'I. Allgemeine Bestimmungen' },
      children: [],
    };
    const input = createDoc([h]);

    const result = headingNumberExtractTransform(input, 'de');

    const resultH = result.children[0] as HeadingDocumentNode;
    expect(resultH.number).toBe('existing');
    expect(resultH.contents.de).toBe('I. Allgemeine Bestimmungen');
  });

  it('recurses into heading children', () => {
    const inner = heading('§ 5 Title');
    const outer = heading('I. Section', [inner]);
    const input = createDoc([outer]);

    const result = headingNumberExtractTransform(input, 'de');

    const outerH = result.children[0] as HeadingDocumentNode;
    expect(outerH.number).toBe('I.');
    const innerH = outerH.children[0] as HeadingDocumentNode;
    expect(innerH.number).toBe('§ 5');
    expect(innerH.contents.de).toBe('Title');
  });

  it('preserves content nodes unchanged', () => {
    const input = createDoc([content('I. Not a heading')]);

    const result = headingNumberExtractTransform(input, 'de');

    expect(result.children[0].type).toBe('content');
    expect(result.children[0].number).toBeNull();
  });
});

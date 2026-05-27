import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DocumentNode, NumberedDocumentNode } from '../types/document';
import { processDocxFile } from './file-processing';

const FIXTURE_DIR = path.join(__dirname, '../test/fixtures/realistic/docx/without_table');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Install the jsdom shims `processDocxFile` needs (idempotent) and mute Mammoth's
 * console warnings via a spy the caller can later assert on.
 */
function setupBrowserShims(): ReturnType<typeof vi.spyOn> {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(this);
      });
    };
  }
  return warnSpy;
}

/** Read a DOCX fixture from FIXTURE_DIR and run it through processDocxFile. */
async function importFixture(filename: string) {
  const buffer = fs.readFileSync(path.join(FIXTURE_DIR, filename));
  const file = new File([buffer], filename, { type: DOCX_MIME });
  return processDocxFile(file);
}

/** Assert that the only console.warn calls came from the expected Mammoth prefix. */
function expectOnlyMammothWarnings(warnSpy: ReturnType<typeof vi.spyOn>) {
  for (const call of warnSpy.mock.calls) {
    expect(call[0]).toBe('Mammoth conversion warnings:');
  }
}

/** Recursively flatten every node in the tree, preserving all fields. */
function flattenTree(node: DocumentNode, result: DocumentNode[] = []): DocumentNode[] {
  result.push(node);
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      flattenTree(child, result);
    }
  }
  return result;
}

const textOf = (n: DocumentNode): string => ('contents' in n ? (n.contents.de ?? '') : '');

describe('file-processing integration', () => {
  describe('real DOCX: entwurf_zurich_2025', () => {
    let html: string;
    let allNodes: DocumentNode[];
    let headings: DocumentNode[];
    let contentNodes: DocumentNode[];
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeAll(async () => {
      warnSpy = setupBrowserShims();
      const result = await importFixture('entwurf_zurich_2025.docx');
      html = result.html!;
      allNodes = flattenTree(result.doc);
      headings = allNodes.filter((n) => n.type === 'HEADING');
      contentNodes = allNodes.filter((n) => n.type === 'CONTENT');
    });

    afterAll(() => {
      expectOnlyMammothWarnings(warnSpy);
      warnSpy.mockRestore();
    });

    it('produces non-empty HTML containing the law title', () => {
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('Gesetz über die politischen Rechte');
      expect(html).toContain('GPR');
    });

    it('HTML contains key phrases from the first page', () => {
      expect(html).toContain('Kantonsrat');
      expect(html).toContain('beschliesst');
      expect(html).toContain('Wahl- und Abstimmungswerbung');
      expect(html).toContain('öffentlichem Grund');
    });

    it('parses into a tree with headings and content nodes', () => {
      expect(headings.length).toBeGreaterThan(0);
      expect(contentNodes.length).toBeGreaterThan(0);
    });

    it('has the law title as a heading', () => {
      expect(
        headings.map(textOf).some((t) => t.includes('Gesetz über die politischen Rechte'))
      ).toBe(true);
    });

    it('contains § 6 a. content about Gemeinden', () => {
      expect(contentNodes.map(textOf).some((t) => t.includes('Gemeinden'))).toBe(true);
    });

    it('contains the Minderheitsantrag section', () => {
      expect(allNodes.map(textOf).some((t) => t.includes('Minderheitsantrag'))).toBe(true);
    });
  });

  describe('real DOCX: numbering_example (issue #63 — <sup> Absatznummern)', () => {
    let allNodes: DocumentNode[];
    let contentNodes: DocumentNode[];
    let headings: DocumentNode[];
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeAll(async () => {
      warnSpy = setupBrowserShims();
      const result = await importFixture('numbering_example.docx');
      allNodes = flattenTree(result.doc);
      contentNodes = allNodes.filter((n) => n.type === 'CONTENT');
      headings = allNodes.filter((n) => n.type === 'HEADING');
    });

    afterAll(() => {
      expectOnlyMammothWarnings(warnSpy);
      warnSpy.mockRestore();
    });

    it('imports <sup>-prefixed Absatznummern as content nodes, not list items', () => {
      // Find the converted Absätze by text. Each was a <li><sup>N</sup>…</li> in the
      // Mammoth HTML; after the fix it must be a `content` node, not a `list_item`.
      const lorem1 = contentNodes.find(
        (c) =>
          textOf(c).startsWith('Lorem ipsum dolor sit amet') &&
          (c as NumberedDocumentNode).number === '^1^'
      );
      const lorem3 = contentNodes.find(
        (c) =>
          textOf(c) === 'Lorem ipsum dolor sit amet.' &&
          (c as NumberedDocumentNode).number === '^3^'
      );
      expect(lorem1).toBeDefined();
      expect(lorem3).toBeDefined();
    });

    it('preserves the superscript formatting on the Absatznummer number field', () => {
      // The converted content node's number is the raw markdown source `^N^`. When
      // rendered through NumberMarkup (MARKDOWN_MINIMAL), this becomes <sup>N</sup>.
      const absatzNumbers = contentNodes
        .map((c) => (c as NumberedDocumentNode).number)
        .filter((n): n is string => typeof n === 'string' && /^\^\d+(?:bis|ter)?\^$/.test(n));

      // Three Absätze convert (Art. 1 Abs. 1 / 3, Art. 2 Abs. 2). The other two
      // Absätze (Art. 1 Abs. 2 and Art. 2 Abs. 1) have nested sublists and stay
      // as list_items — their numbers are extracted plain and aren't included
      // by this regex filter.
      expect(absatzNumbers.length).toBeGreaterThanOrEqual(3);
      expect(absatzNumbers).toContain('^1^');
      expect(absatzNumbers).toContain('^2^');
      expect(absatzNumbers).toContain('^3^');
    });

    it('strips the leading ^N^ markup from the content text', () => {
      for (const c of contentNodes) {
        expect(textOf(c)).not.toMatch(/^\^\d+(?:bis|ter)?\^\s/);
      }
    });

    it('keeps the list_item structure when the Absatznummer item has a nested sublist', () => {
      // Art. 1 Abs. 2 "Er gilt für:" + sublist a/b/c/d cannot collapse to a content
      // node because it has non-footnote children.
      const erGiltFuer = allNodes
        .filter((n) => n.type === 'LIST_ITEM')
        .find((li) => {
          if (!('children' in li)) return false;
          const firstContent = li.children.find((c) => c.type === 'CONTENT');
          return firstContent !== undefined && textOf(firstContent).includes('Er gilt für');
        });
      expect(erGiltFuer).toBeDefined();
      // Number is extracted plain (per the non-conversion path), and the nested list survives.
      expect(erGiltFuer?.number).toBe('2');
      expect('children' in erGiltFuer! && erGiltFuer.children.some((c) => c.type === 'LIST')).toBe(
        true
      );
    });

    it('downgrades format to TEXT after stripping when no other inline marks remain', () => {
      // The simple Absätze ("Lorem ipsum dolor sit amet.") have no other marks, so
      // their format must downgrade from MARKDOWN to TEXT.
      const plainAbsatz = contentNodes.find(
        (c) =>
          textOf(c) === 'Lorem ipsum dolor sit amet.' &&
          (c as NumberedDocumentNode).number === '^3^'
      );
      expect(plainAbsatz).toBeDefined();
      expect('format' in plainAbsatz! && plainAbsatz.format).toBe('TEXT');
    });

    // Issue #89: the bold `**I.**` and italic `*Art. 1 Lorem ipsum*` paragraphs
    // in the fixture must be promoted to headings by the legal transforms.
    it('detects the top-level Roman numeral section `I.` as a heading', () => {
      const romanSection = headings.find((h) => (h as NumberedDocumentNode).number === 'I.');
      expect(romanSection).toBeDefined();
    });

    it('detects `Art. 1 Lorem ipsum` as an article heading', () => {
      const article = headings.find((h) => (h as NumberedDocumentNode).number === 'Art. 1');
      expect(article).toBeDefined();
      expect(textOf(article!)).toBe('Lorem ipsum');
    });
  });
});

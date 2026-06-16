import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DocumentNode, NumberedDocumentNode } from '../types/document';
import { processDocxFile, processHtmlFile } from './file-processing';

const FIXTURE_DIR = path.join(__dirname, '../test/fixtures/realistic/docx/without_table');
const HTML_FIXTURE_DIR = path.join(__dirname, '../test/fixtures/realistic/html');
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
  if (!Blob.prototype.text) {
    Blob.prototype.text = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(this);
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

/** Read an HTML fixture from HTML_FIXTURE_DIR and run it through processHtmlFile. */
async function importHtmlFixture(filename: string) {
  const buffer = fs.readFileSync(path.join(HTML_FIXTURE_DIR, filename));
  const file = new File([buffer], filename, { type: 'text/html' });
  return processHtmlFile(file);
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

  // Schwyz cantonal law draft (Docling-serialized HTML). Every section/article title is an
  // `<h2>` in the source, so the legal transforms extract their numbers in place rather than
  // promoting content nodes. These assertions characterize the structure the pipeline extracts
  // today, so a regression that breaks this real document is caught.
  describe('real HTML: SZ digitale Verwaltung', () => {
    const FIXTURE_NAME =
      'SZ Gesetz über die digitale Verwaltung 2025 - Vernehmlassungsvorlage.html';

    let html: string;
    let allNodes: DocumentNode[];
    let headings: DocumentNode[];
    let contentNodes: DocumentNode[];
    let listNodes: DocumentNode[];
    let listItems: DocumentNode[];
    let warnSpy: ReturnType<typeof vi.spyOn>;

    const numberOf = (n: DocumentNode): string | null =>
      'number' in n ? ((n as NumberedDocumentNode).number ?? null) : null;
    const headingByNumber = (num: string) => headings.find((h) => numberOf(h) === num);

    beforeAll(async () => {
      warnSpy = setupBrowserShims();
      const result = await importHtmlFixture(FIXTURE_NAME);
      html = result.html!;
      allNodes = flattenTree(result.doc);
      headings = allNodes.filter((n) => n.type === 'HEADING');
      contentNodes = allNodes.filter((n) => n.type === 'CONTENT');
      listNodes = allNodes.filter((n) => n.type === 'LIST');
      listItems = allNodes.filter((n) => n.type === 'LIST_ITEM');
    });

    afterAll(() => {
      // The HTML pipeline (unlike the DOCX/Mammoth path) should emit no console warnings.
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('produces non-empty HTML containing the law title and a § marker', () => {
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('Gesetz über die digitale Verwaltung');
      expect(html).toContain('§ 1 Gegenstand');
    });

    it('parses into a tree with headings, content, and list nodes', () => {
      expect(headings.length).toBeGreaterThan(0);
      expect(contentNodes.length).toBeGreaterThan(0);
      expect(listNodes.length).toBeGreaterThan(0);
      expect(listItems.length).toBeGreaterThan(0);
    });

    it('turns each <h2> into a heading and promotes one § from a list item', () => {
      // The source has 49 <h2> elements, each parsed into a HEADING. The article transform
      // additionally promotes the embedded `<li>§ 76 Abs. 1 1</li>` amendment reference into a
      // heading, for 50 total.
      expect(headings.length).toBe(50);
      expect(headingByNumber('§ 76 Abs. 1')).toBeDefined();
    });

    it('keeps the law title as a numberless heading', () => {
      const title = headings.find((h) => textOf(h).includes('Gesetz über die digitale Verwaltung'));
      expect(title).toBeDefined();
      expect(numberOf(title!)).toBeNull();
    });

    it('detects the Roman-numeral sections I.–VI. as headings', () => {
      const romanTitles: Record<string, string> = {
        'I.': 'Allgemeine Bestimmungen',
        'II.': 'Zuständigkeiten',
        'III.': 'Basisdienste',
        'IV.': 'Informationssicherheit',
        'V.': 'Finanzierung',
        'VI.': 'Schlussbestimmungen',
      };
      for (const [num, title] of Object.entries(romanTitles)) {
        const heading = headingByNumber(num);
        expect(heading, `expected a heading numbered ${num}`).toBeDefined();
        expect(textOf(heading!)).toBe(title);
      }
    });

    it('extracts § article numbers and titles onto headings', () => {
      const articles: Record<string, string> = {
        '§ 1': 'Gegenstand',
        '§ 2': 'Geltungsbereich',
        '§ 5': 'Informationswiederverwendung',
        '§ 27': 'Massnahmen und Zusammenarbeit',
      };
      for (const [num, title] of Object.entries(articles)) {
        const heading = headingByNumber(num);
        expect(heading, `expected a heading numbered ${num}`).toBeDefined();
        expect(textOf(heading!)).toBe(title);
      }
    });

    it('detects most of the §-numbered articles', () => {
      // The fixture has ~37 §-numbered headings: the sequential articles §§ 1–34 plus a few
      // embedded amendment references (e.g. `§ 29 Abs. 1 Bst. f`, `§ 10a Abs. 3`, `§ 76 Abs. 1`).
      const paragraphHeadings = headings.filter((h) => /^§ \d+/.test(numberOf(h) ?? ''));
      expect(paragraphHeadings.length).toBeGreaterThanOrEqual(34);
    });

    it('detects the uppercase-letter subsections A. and B.', () => {
      const a = headingByNumber('A.');
      const b = headingByNumber('B.');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(textOf(a!)).toBe('Allgemeines');
      expect(textOf(b!)).toBe('Besondere Basisdienste');
    });

    it('keeps the a)/b)/c) enumerations as list items with text in content children', () => {
      expect(listItems.length).toBeGreaterThanOrEqual(50);
      // The lettered marker (derived from the source `list-style-type: 'a) '` CSS, not the
      // visible text) lands on the LIST_ITEM `number`; its text is a CONTENT child, since
      // LIST_ITEM nodes carry no `contents` of their own.
      const letteredItem = listItems.find(
        (li) =>
          numberOf(li) === 'a)' &&
          'children' in li &&
          li.children.some(
            (c) =>
              c.type === 'CONTENT' && textOf(c).includes('definiert die Prinzipien für die Nutzung')
          )
      );
      expect(letteredItem).toBeDefined();
    });

    // Characterization of a known partial-extraction quirk: when a § title is split across two
    // <h2> elements in the source (`<h2>§ 16</h2>` then `<h2>Grundsatz</h2>`), the number lands
    // on an otherwise-empty heading and the title stays a separate numberless heading.
    it('documents the split "§ 16" / "Grundsatz" headings', () => {
      const para16 = headingByNumber('§ 16');
      expect(para16).toBeDefined();
      expect(textOf(para16!)).toBe('');
      expect(headings.some((h) => numberOf(h) === null && textOf(h) === 'Grundsatz')).toBe(true);
    });
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ContentDocumentNode, HeadingDocumentNode } from '../types/document';
import { processDocxFile } from './file-processing';

describe('file-processing integration', () => {
  describe('real DOCX: entwurf_zurich_2025', () => {
    const docxPath = path.join(
      __dirname,
      '../test/fixtures/realistic/docx/without_table/entwurf_zurich_2025.docx'
    );

    let html: string;
    let allNodes: Array<{ type: string; contents?: Partial<Record<string, string>> }>;
    let headings: typeof allNodes;
    let contentNodes: typeof allNodes;

    // Run processDocxFile once, share across assertions
    beforeAll(async () => {
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      // jsdom polyfill — File.arrayBuffer() not implemented
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

      const buffer = fs.readFileSync(docxPath);
      const file = new File([buffer], 'entwurf_zurich_2025.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await processDocxFile(file);
      html = result.html!;

      allNodes = flattenTree(result.doc);
      headings = allNodes.filter((n) => n.type === 'heading');
      contentNodes = allNodes.filter((n) => n.type === 'content');
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
      const headingTexts = headings.map((h) => h.contents?.de ?? '');
      expect(headingTexts.some((t) => t.includes('Gesetz über die politischen Rechte'))).toBe(true);
    });

    it('contains § 6 a. content about Gemeinden', () => {
      const contentTexts = contentNodes.map((c) => c.contents?.de ?? '');
      expect(contentTexts.some((t) => t.includes('Gemeinden'))).toBe(true);
    });

    it('contains the Minderheitsantrag section', () => {
      const allTexts = allNodes.map((n) => n.contents?.de ?? '');
      expect(allTexts.some((t) => t.includes('Minderheitsantrag'))).toBe(true);
    });
  });
});

/** Recursively flatten all nodes in the tree */
function flattenTree(
  node: { type: string; children?: Array<{ type: string; children?: unknown[] }> },
  result: Array<{ type: string; contents?: Partial<Record<string, string>> }> = []
): Array<{ type: string; contents?: Partial<Record<string, string>> }> {
  result.push(node as (typeof result)[0]);
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      flattenTree(child as typeof node, result);
    }
  }
  return result;
}

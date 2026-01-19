import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import { parseHtml } from '../../utils/document-utils';
import { Block } from '../../types';

// Simple Levenshtein distance for CER
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function calculateCER(actual: string, expected: string): number {
  const dist = levenshtein(actual, expected);
  return dist / Math.max(actual.length, expected.length);
}

// Helper to convert blocks to loose markdown for comparison
function blocksToMarkdown(blocks: Block[]): string {
  return blocks.map(b => {
    let prefix = '';
    if (b.type === 'h1') prefix = '# ';
    if (b.type === 'h2') prefix = '## ';
    if (b.type === 'h3') prefix = '### ';
    if (b.type === 'ul') prefix = '- ';
    // Simple text extraction
    return `${prefix}${b.content.replace(/<[^>]+>/g, '')}`;
  }).join('\n');
}

describe('Munger Baseline Accuracy (Tier 2)', () => {
    throw new Error('TODO: add test samples and enable baseline accuracy tests');
    const importDir = path.resolve(__dirname, 'TODO/02_import/input texts');
    const expectedDir = path.resolve(__dirname, 'TODO/02_import/output_texts');

    // We only test files that have a matching expected output
    const testFiles = [
        { doc: 'Revision Personalverordnung.docx', md: 'Revision Personalverordnung.md' }
    ];

    test.each(testFiles)('Accuracy Check: %s', async ({ doc, md }) => {
        const docPath = path.join(importDir, doc);
        const mdPath = path.join(expectedDir, md);

        if (!fs.existsSync(docPath)) { console.warn(`SKIP: DOCX missing ${docPath}`); return; }
        if (!fs.existsSync(mdPath)) { console.warn(`SKIP: MD missing ${mdPath}`); return; }

        const buffer = fs.readFileSync(docPath);
        const expected = fs.readFileSync(mdPath, 'utf-8');

        // Mammoth API requires 'buffer' in an object for convertToHtml
        // For some versions it might vary, but standard usage is { buffer: Buffer }
        const result = await mammoth.convertToHtml({ buffer } as any);

        const blocks = parseHtml(result.value);
        const actualMD = blocksToMarkdown(blocks);

        // Normalize
        const cleanActual = actualMD.replace(/\s+/g, ' ').trim();
        const cleanExpected = expected.replace(/\s+/g, ' ').trim();

        console.log(`\n--- DEBUG: ${doc} ---`);
        console.log('ACTUAL LENGTH:', cleanActual.length);
        console.log('EXPECTED LENGTH:', cleanExpected.length);
        console.log('ACTUAL START:', cleanActual.substring(0, 100));
        console.log('EXPECTED START:', cleanExpected.substring(0, 100));

        const cer = calculateCER(cleanActual, cleanExpected);
        console.log(`CER for ${doc}: ${(cer * 100).toFixed(2)}%`);

        // Baseline Target: < 20% error initially (mammoth is rough)
        // We warn instead of failing to establish baseline
        if (cer > 0.2) {
            console.warn(`High Error Rate for ${doc}: ${(cer * 100).toFixed(2)}%`);
        }

        expect(cer).toBeLessThan(0.5); // Loose upper bound safety net
    });
});

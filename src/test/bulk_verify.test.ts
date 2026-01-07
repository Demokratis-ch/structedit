import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseHtmlLegal } from '../utils/document-utils';

const HTML_DIR = 'test_corpus/output_html';
const RESULTS_DIR = 'test_corpus/structural_analysis';

describe('Bulk Structural Analysis', () => {
    it('analyzes structural integrity of the collected corpus', () => {
        if (!fs.existsSync(HTML_DIR)) {
            console.warn('HTML corpus directory not found. Skipping analysis.');
            return;
        }

        if (!fs.existsSync(RESULTS_DIR)) {
            fs.mkdirSync(RESULTS_DIR, { recursive: true });
        }

        const files = fs.readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));
        console.log(`Analyzing ${files.length} documents...`);

        const summary: any[] = [];

        for (const f of files) {
            try {
                const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf-8');
                const blocks = parseHtmlLegal(html);

                const stats = {
                    file: f,
                    blocks: blocks.length,
                    h1: blocks.filter(b => b.type === 'h1').length,
                    h2: blocks.filter(b => b.type === 'h2').length,
                    h3: blocks.filter(b => b.type === 'h3').length,
                    p: blocks.filter(b => b.type === 'p').length,
                    lists: blocks.filter(b => ['ul', 'ol', 'abc'].includes(b.type)).length,
                    max_depth: Math.max(0, ...blocks.map(b => b.depth))
                };

                summary.push(stats);
                
                // Write detailed results for inspection
                fs.writeFileSync(
                    path.join(RESULTS_DIR, f + '.json'),
                    JSON.stringify(blocks, null, 2)
                );
            } catch (e) {
                console.error(`Failed to analyze ${f}:`, e);
            }
        }

        fs.writeFileSync(
            path.join(RESULTS_DIR, 'summary.json'),
            JSON.stringify(summary, null, 2)
        );

        console.table(summary.map(s => ({
            File: s.file.substring(0, 30),
            Blocks: s.blocks,
            'H1/H2': `${s.h1}/${s.h2}`,
            Articles: s.h3,
            Lists: s.lists,
            Depth: s.max_depth
        })));
    });
});

import * as mammoth from 'mammoth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentDocumentNode } from '../types/document';
import {
  createPlainTextDocument,
  deriveNameFromUrl,
  processDocxFile,
  processFile,
  processHtmlFile,
  processHtmlString,
  processJsonEnvelopeFile,
  processJsonEnvelopeString,
  processPdfFile,
  processTextInput,
} from './file-processing';

vi.mock('mammoth');

describe('file-processing', () => {
  describe('createPlainTextDocument', () => {
    it('creates a document with one empty content node for empty string', () => {
      const doc = createPlainTextDocument('');
      expect(doc.type).toBe('DOCUMENT');
      expect(doc.children).toHaveLength(1);
      expect(doc.children[0].type).toBe('CONTENT');
      expect((doc.children[0] as ContentDocumentNode).contents).toEqual({ de: '' });
    });

    it('creates a document with one content node for a single line', () => {
      const doc = createPlainTextDocument('Hello world');
      expect(doc.children).toHaveLength(1);
      expect(doc.children[0].type).toBe('CONTENT');
      expect((doc.children[0] as ContentDocumentNode).contents).toEqual({ de: 'Hello world' });
    });

    it('creates a content node per non-empty line', () => {
      const doc = createPlainTextDocument('Line one\n\nLine two\nLine three');
      expect(doc.children).toHaveLength(3);
      expect((doc.children[0] as ContentDocumentNode).contents).toEqual({ de: 'Line one' });
      expect((doc.children[1] as ContentDocumentNode).contents).toEqual({ de: 'Line two' });
      expect((doc.children[2] as ContentDocumentNode).contents).toEqual({ de: 'Line three' });
    });

    it('trims whitespace from lines', () => {
      const doc = createPlainTextDocument('  padded  \n  also padded  ');
      expect((doc.children[0] as ContentDocumentNode).contents).toEqual({ de: 'padded' });
      expect((doc.children[1] as ContentDocumentNode).contents).toEqual({ de: 'also padded' });
    });

    it('skips whitespace-only lines', () => {
      const doc = createPlainTextDocument('first\n   \nsecond');
      expect(doc.children).toHaveLength(2);
    });
  });

  describe('processTextInput', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    });

    it('returns a plain text document for non-HTML input', () => {
      const result = processTextInput('Hello world');
      expect(result.doc.type).toBe('DOCUMENT');
      expect((result.doc.children[0] as ContentDocumentNode).contents).toEqual({
        de: 'Hello world',
      });
      expect(result.sourceUrl).toBeNull();
      expect(result.html).toBeUndefined();
    });

    it('parses HTML input and returns sourceUrl and html', () => {
      const html = '<h1>Title</h1><p>Content</p>';
      const result = processTextInput(html);
      expect(result.doc.type).toBe('DOCUMENT');
      expect(result.doc.children.length).toBeGreaterThan(0);
      expect(result.sourceUrl).toBe('blob:fake-url');
      expect(result.html).toBe(html);
    });

    it('falls back to plain text when HTML parsing fails', () => {
      // A string that looks like HTML but is just angle brackets
      const text = '<not-a-real-tag>';
      const result = processTextInput(text);
      // Should not throw, should produce a document
      expect(result.doc.type).toBe('DOCUMENT');
    });

    it('generates an Untitled (timestamp) name and a 40+-char subtitle for pasted text', () => {
      const fixedNow = new Date(2026, 4, 12, 18, 4, 0); // 2026-05-12 18:04 local time
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      const source = 'Sehr geehrte Damen und Herren, hiermit teile ich Ihnen mit ...';
      const result = processTextInput(source);

      expect(result.name).toBe('Untitled (2026-05-12 18:04)');
      // Subtitle: first 40 chars (rounded to next word boundary) + " ..."
      expect(result.subtitle).toBe('Sehr geehrte Damen und Herren, hiermit teile ...');

      vi.useRealTimers();
    });

    it('subtitle is the trimmed source when it is short enough', () => {
      const result = processTextInput('Short.');
      expect(result.subtitle).toBe('Short.');
    });

    it('source.kind is "pasted-text" with text/plain mime and null filename', () => {
      const result = processTextInput('Some plain text');
      expect(result.source.kind).toBe('pasted-text');
      expect(result.source.mime).toBe('text/plain');
      expect(result.source.originalFilename).toBeNull();
      expect(result.source.bytes).toBe('Some plain text');
    });
  });

  describe('processHtmlFile', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      // jsdom's File doesn't implement .text(), polyfill it
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
    });

    it('parses HTML file and returns doc, sourceUrl, and html', async () => {
      const htmlContent = '<h1>Title</h1><p>Body text</p>';
      const file = new File([htmlContent], 'test.html', { type: 'text/html' });

      const result = await processHtmlFile(file);

      expect(result.doc.type).toBe('DOCUMENT');
      expect(result.doc.children.length).toBeGreaterThan(0);
      expect(result.sourceUrl).toBe('blob:fake-url');
      expect(result.html).toBe(htmlContent);
    });

    it('works with .htm extension', async () => {
      const file = new File(['<p>Content</p>'], 'doc.htm', { type: 'text/html' });
      const result = await processHtmlFile(file);
      expect(result.doc.type).toBe('DOCUMENT');
      expect(result.html).toBe('<p>Content</p>');
    });
  });

  describe('processDocxFile', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      // jsdom's File doesn't implement .arrayBuffer(), polyfill it
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
    });

    it('converts DOCX via mammoth and returns parsed document', async () => {
      const generatedHtml = '<h1>Title</h1><p>Body</p>';
      vi.mocked(mammoth.convertToHtml).mockResolvedValue({
        value: generatedHtml,
        messages: [],
      });

      const file = new File(['fake-docx-bytes'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await processDocxFile(file);

      expect(result.doc.type).toBe('DOCUMENT');
      expect(result.doc.children.length).toBeGreaterThan(0);
      expect(result.sourceUrl).toBe('blob:fake-url');
      expect(result.html).toBe(generatedHtml);
    });

    it('stores the converted HTML (not the original DOCX bytes) so resumed previews render inline', async () => {
      // Background: storing the raw DOCX ArrayBuffer with the DOCX MIME caused
      // Firefox to offer the blob URL for download instead of rendering it
      // inline when an entry was resumed. The converted HTML *is* what the
      // preview pane shows on fresh upload, so persist the same form.
      const generatedHtml = '<h1>Title</h1><p>Body</p>';
      vi.mocked(mammoth.convertToHtml).mockResolvedValue({
        value: generatedHtml,
        messages: [],
      });
      const file = new File(['fake-docx-bytes'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await processDocxFile(file);

      expect(result.source.kind).toBe('docx');
      expect(result.source.mime).toBe('text/html');
      expect(result.source.bytes).toBe(generatedHtml);
      expect(result.source.originalFilename).toBe('test.docx');
    });

    it('logs warnings from mammoth conversion', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(mammoth.convertToHtml).mockResolvedValue({
        value: '<p>ok</p>',
        messages: [{ type: 'warning', message: 'Unrecognized style' }],
      });

      const file = new File(['fake'], 'test.docx', { type: 'application/octet-stream' });
      await processDocxFile(file);

      expect(consoleSpy).toHaveBeenCalledWith('Mammoth conversion warnings:', expect.any(Array));
      consoleSpy.mockRestore();
    });
  });

  describe('processPdfFile', () => {
    it('throws an error indicating PDF conversion is not yet set up', async () => {
      const file = new File(['fake-pdf'], 'test.pdf', { type: 'application/pdf' });
      await expect(processPdfFile(file)).rejects.toThrow('TODO: set up backend for PDF conversion');
    });
  });

  describe('processFile', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      // jsdom polyfills
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
    });

    it('routes .docx files to processDocxFile', async () => {
      vi.mocked(mammoth.convertToHtml).mockResolvedValue({
        value: '<p>docx</p>',
        messages: [],
      });
      const file = new File(['fake'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = await processFile(file);
      expect(result.doc.type).toBe('DOCUMENT');
      expect(mammoth.convertToHtml).toHaveBeenCalled();
    });

    it('routes .html files to processHtmlFile', async () => {
      const file = new File(['<p>html</p>'], 'test.html', { type: 'text/html' });
      const result = await processFile(file);
      expect(result.doc.type).toBe('DOCUMENT');
      expect(result.html).toBe('<p>html</p>');
    });

    it('routes .htm files to processHtmlFile', async () => {
      const file = new File(['<p>htm</p>'], 'page.htm', { type: 'text/html' });
      const result = await processFile(file);
      expect(result.html).toBe('<p>htm</p>');
    });

    it('routes .pdf files to processPdfFile (which throws)', async () => {
      const file = new File(['fake-pdf'], 'test.pdf', { type: 'application/pdf' });
      await expect(processFile(file)).rejects.toThrow('TODO: set up backend for PDF conversion');
    });

    it('routes .json files to processJsonEnvelopeFile', async () => {
      const envelope = {
        DocTreeVersion: 1,
        metadata: { title: { de: 'Routed' } },
        document: { id: 'r', type: 'DOCUMENT', children: [] },
      };
      const file = new File([JSON.stringify(envelope)], 'doc.json', {
        type: 'application/json',
      });
      const result = await processFile(file);
      expect(result.doc.type).toBe('DOCUMENT');
      expect(result.source.kind).toBe('json-envelope');
    });

    it('throws for unsupported file types', async () => {
      const file = new File(['data'], 'test.csv', { type: 'text/csv' });
      await expect(processFile(file)).rejects.toThrow('Unsupported file type');
    });
  });

  describe('processHtmlString', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    });

    it('produces the same ProcessedDocument shape as a file upload for the same HTML', async () => {
      const html = '<h1>Title</h1><p>Body text</p>';

      const fromString = processHtmlString(html, {
        name: 'abc-123',
        originalFilename: null,
      });
      // jsdom's File needs a .text() polyfill (already installed by the
      // processHtmlFile describe's beforeEach when that block ran); re-add defensively.
      if (!Blob.prototype.text) {
        Blob.prototype.text = () => Promise.resolve(html);
      }
      const fromFile = await processHtmlFile(
        new File([html], 'abc-123.html', { type: 'text/html' })
      );

      expect(fromString.html).toBe(fromFile.html);
      expect(fromString.doc.type).toBe('DOCUMENT');
      expect(fromString.doc.children.length).toBe(fromFile.doc.children.length);
      expect(fromString.source.kind).toBe('html');
      expect(fromString.source.mime).toBe('text/html');
      expect(fromString.source.bytes).toBe(html);
    });

    it('uses the provided name, originalFilename, and a null subtitle', () => {
      const result = processHtmlString('<p>Hi</p>', {
        name: 'Demokratis document',
        originalFilename: null,
      });
      expect(result.name).toBe('Demokratis document');
      expect(result.source.originalFilename).toBeNull();
      expect(result.subtitle).toBeNull();
      expect(result.sourceUrl).toBe('blob:fake-url');
    });
  });

  describe('processJsonEnvelopeFile', () => {
    // A minimal but structurally valid DocTree envelope (DocTreeVersion 1).
    const makeEnvelope = (title: Record<string, string>) => ({
      DocTreeVersion: 1,
      metadata: { title },
      document: {
        id: 'root1',
        type: 'DOCUMENT',
        children: [
          {
            id: 'c1',
            number: null,
            type: 'CONTENT',
            format: 'TEXT',
            contents: { de: 'Hello envelope' },
            children: [],
          },
        ],
      },
    });

    const jsonFile = (body: string, name = 'doc.json') =>
      new File([body], name, { type: 'application/json' });

    beforeEach(() => {
      // jsdom's File doesn't implement .text(); polyfill via FileReader.
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
    });

    it('reconstructs the tree and metadata from a valid envelope', async () => {
      const file = jsonFile(JSON.stringify(makeEnvelope({ de: 'My Title' })));
      const result = await processJsonEnvelopeFile(file);

      expect(result.doc.type).toBe('DOCUMENT');
      expect((result.doc.children[0] as ContentDocumentNode).contents).toEqual({
        de: 'Hello envelope',
      });
      // A DocTree JSON *is* the tree — there is no separate original to preview.
      expect(result.sourceUrl).toBeNull();
      expect(result.html).toBeUndefined();
      expect(result.source.kind).toBe('json-envelope');
      expect(result.source.mime).toBe('application/json');
      expect(result.subtitle).toBeNull();
    });

    it('uses the German title as the display name', async () => {
      const file = jsonFile(JSON.stringify(makeEnvelope({ de: 'Verordnung X' })), 'whatever.json');
      const result = await processJsonEnvelopeFile(file);
      expect(result.name).toBe('Verordnung X');
    });

    it('falls back to the filename (without extension) when the title is empty', async () => {
      const file = jsonFile(JSON.stringify(makeEnvelope({})), 'my-law.json');
      const result = await processJsonEnvelopeFile(file);
      expect(result.name).toBe('my-law');
    });

    it('rejects malformed JSON', async () => {
      const file = jsonFile('{ not valid json', 'broken.json');
      await expect(processJsonEnvelopeFile(file)).rejects.toThrow(/not valid JSON/i);
    });

    it('rejects a structurally invalid envelope', async () => {
      const file = jsonFile(JSON.stringify({ DocTreeVersion: 1, metadata: {}, document: {} }));
      await expect(processJsonEnvelopeFile(file)).rejects.toThrow(
        /not a valid StructEdit document/i
      );
    });

    it('rejects an envelope from an unsupported DocTreeVersion', async () => {
      const envelope = { ...makeEnvelope({ de: 'X' }), DocTreeVersion: 2 };
      const file = jsonFile(JSON.stringify(envelope));
      await expect(processJsonEnvelopeFile(file)).rejects.toThrow(/version/i);
    });

    // The string entry point shared with the `loadFile` URL path. The file-based
    // tests above double as the characterization that the upload path is unchanged.
    describe('processJsonEnvelopeString', () => {
      it('reconstructs the tree from a valid envelope string', () => {
        const raw = JSON.stringify(makeEnvelope({ de: 'My Title' }));
        const result = processJsonEnvelopeString(raw, { name: 'abc-123', originalFilename: null });

        expect(result.doc.type).toBe('DOCUMENT');
        expect((result.doc.children[0] as ContentDocumentNode).contents).toEqual({
          de: 'Hello envelope',
        });
        // A DocTree JSON *is* the tree — no separate original to preview.
        expect(result.sourceUrl).toBeNull();
        expect(result.html).toBeUndefined();
        expect(result.source.kind).toBe('json-envelope');
        expect(result.source.mime).toBe('application/json');
        expect(result.source.bytes).toBe(raw);
        expect(result.source.originalFilename).toBeNull();
        expect(result.subtitle).toBeNull();
      });

      it('prefers the envelope title over the fallback name', () => {
        const raw = JSON.stringify(makeEnvelope({ de: 'Verordnung X' }));
        const result = processJsonEnvelopeString(raw, { name: 'abc-123', originalFilename: null });
        expect(result.name).toBe('Verordnung X');
      });

      it('falls back to the given name when the title is empty', () => {
        const raw = JSON.stringify(makeEnvelope({}));
        const result = processJsonEnvelopeString(raw, { name: 'abc-123', originalFilename: null });
        expect(result.name).toBe('abc-123');
      });

      it('throws on malformed JSON', () => {
        expect(() =>
          processJsonEnvelopeString('{ not valid json', { name: 'x', originalFilename: null })
        ).toThrow(/not valid JSON/i);
      });

      it('throws on a structurally invalid envelope', () => {
        const raw = JSON.stringify({ DocTreeVersion: 1, metadata: {}, document: {} });
        expect(() => processJsonEnvelopeString(raw, { name: 'x', originalFilename: null })).toThrow(
          /not a valid StructEdit document/i
        );
      });

      it('throws on an unsupported DocTreeVersion', () => {
        const raw = JSON.stringify({ ...makeEnvelope({ de: 'X' }), DocTreeVersion: 2 });
        expect(() => processJsonEnvelopeString(raw, { name: 'x', originalFilename: null })).toThrow(
          /version/i
        );
      });
    });
  });

  describe('deriveNameFromUrl', () => {
    it('uses the uuid from a /file/<uuid> path, ignoring the query string', () => {
      const url = 'https://demokratis.ch/file/abc-123?_expiration=999&_hash=deadbeef';
      expect(deriveNameFromUrl(url)).toBe('abc-123');
    });

    it('falls back to a default when there is no usable path segment', () => {
      expect(deriveNameFromUrl('https://demokratis.ch/')).toBe('Demokratis document');
      expect(deriveNameFromUrl('not a url')).toBe('Demokratis document');
    });
  });
});

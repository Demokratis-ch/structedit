import * as mammoth from 'mammoth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentDocumentNode } from '../types/document';
import {
  createPlainTextDocument,
  processDocxFile,
  processFile,
  processHtmlFile,
  processPdfFile,
  processTextInput,
} from './file-processing';

vi.mock('mammoth');

describe('file-processing', () => {
  describe('createPlainTextDocument', () => {
    it('creates a document with one empty content node for empty string', () => {
      const doc = createPlainTextDocument('');
      expect(doc.type).toBe('document');
      expect(doc.children).toHaveLength(1);
      expect(doc.children[0].type).toBe('content');
      expect((doc.children[0] as ContentDocumentNode).contents).toEqual({ de: '' });
    });

    it('creates a document with one content node for a single line', () => {
      const doc = createPlainTextDocument('Hello world');
      expect(doc.children).toHaveLength(1);
      expect(doc.children[0].type).toBe('content');
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
      expect(result.doc.type).toBe('document');
      expect((result.doc.children[0] as ContentDocumentNode).contents).toEqual({
        de: 'Hello world',
      });
      expect(result.sourceUrl).toBeNull();
      expect(result.html).toBeUndefined();
    });

    it('parses HTML input and returns sourceUrl and html', () => {
      const html = '<h1>Title</h1><p>Content</p>';
      const result = processTextInput(html);
      expect(result.doc.type).toBe('document');
      expect(result.doc.children.length).toBeGreaterThan(0);
      expect(result.sourceUrl).toBe('blob:fake-url');
      expect(result.html).toBe(html);
    });

    it('falls back to plain text when HTML parsing fails', () => {
      // A string that looks like HTML but is just angle brackets
      const text = '<not-a-real-tag>';
      const result = processTextInput(text);
      // Should not throw, should produce a document
      expect(result.doc.type).toBe('document');
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

      expect(result.doc.type).toBe('document');
      expect(result.doc.children.length).toBeGreaterThan(0);
      expect(result.sourceUrl).toBe('blob:fake-url');
      expect(result.html).toBe(htmlContent);
    });

    it('works with .htm extension', async () => {
      const file = new File(['<p>Content</p>'], 'doc.htm', { type: 'text/html' });
      const result = await processHtmlFile(file);
      expect(result.doc.type).toBe('document');
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

      expect(result.doc.type).toBe('document');
      expect(result.doc.children.length).toBeGreaterThan(0);
      expect(result.sourceUrl).toBe('blob:fake-url');
      expect(result.html).toBe(generatedHtml);
    });

    it('passes style map options to mammoth', async () => {
      vi.mocked(mammoth.convertToHtml).mockResolvedValue({
        value: '<p>ok</p>',
        messages: [],
      });

      const file = new File(['fake'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      await processDocxFile(file);

      expect(mammoth.convertToHtml).toHaveBeenCalledWith(
        { arrayBuffer: expect.any(ArrayBuffer) },
        expect.objectContaining({ styleMap: expect.any(Array) })
      );
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
      expect(result.doc.type).toBe('document');
      expect(mammoth.convertToHtml).toHaveBeenCalled();
    });

    it('routes .html files to processHtmlFile', async () => {
      const file = new File(['<p>html</p>'], 'test.html', { type: 'text/html' });
      const result = await processFile(file);
      expect(result.doc.type).toBe('document');
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

    it('throws for unsupported file types', async () => {
      const file = new File(['data'], 'test.csv', { type: 'text/csv' });
      await expect(processFile(file)).rejects.toThrow('Unsupported file type');
    });
  });
});

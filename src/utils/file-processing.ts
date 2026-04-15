import * as mammoth from 'mammoth';
import type { ContainerDocumentNode } from '../types/document';
import { generateId, parseHtmlLegalToTree } from './document-utils';

export interface ProcessedDocument {
  doc: ContainerDocumentNode;
  sourceUrl: string | null;
  html?: string;
}

export function createPlainTextDocument(text: string): ContainerDocumentNode {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return {
    id: generateId(),
    number: null,
    type: 'document',
    children:
      lines.length > 0
        ? lines.map((line) => ({
            id: generateId(),
            number: null,
            type: 'content' as const,
            contents: { de: line.trim() },
            children: [],
          }))
        : [
            {
              id: generateId(),
              number: null,
              type: 'content' as const,
              contents: { de: '' },
              children: [],
            },
          ],
  };
}

const HTML_DETECT_REGEX = /<(?=.*? .*?\/?>|br|hr|input|!--|!DOCTYPE)[a-z]+.*?>|<([a-z]+).*?<\/\1>/i;

export function processTextInput(text: string): ProcessedDocument {
  const isHtml = HTML_DETECT_REGEX.test(text);

  if (isHtml) {
    try {
      const doc = parseHtmlLegalToTree(text);
      const blob = new Blob([text], { type: 'text/html' });
      const sourceUrl = URL.createObjectURL(blob);
      return { doc, sourceUrl, html: text };
    } catch (e) {
      console.error('Failed to parse HTML', e);
      // Fallback to plain text if HTML parsing fails
      return { doc: createPlainTextDocument(text), sourceUrl: null };
    }
  }

  return { doc: createPlainTextDocument(text), sourceUrl: null };
}

export async function processHtmlFile(file: File): Promise<ProcessedDocument> {
  const html = await file.text();
  const blob = new Blob([html], { type: 'text/html' });
  const sourceUrl = URL.createObjectURL(blob);
  const doc = parseHtmlLegalToTree(html);
  return { doc, sourceUrl, html };
}

const MAMMOTH_STYLE_MAP = [
  "p[style-name='Erlasstitel'] => h1:fresh",
  "p[style-name='Titel Arbeitsversion'] => h1:fresh",
  "p[style-name='Abschnittstitel'] => h2:fresh",
  "p[style-name='Artikeltitel'] => h3:fresh",
  "p[style-name='Artikeltitel-Änderung'] => h3:fresh",
  "p[style-name='Ingress'] => p.ingress",
  "r[style-name='Fett'] => strong",
];

export async function processDocxFile(file: File): Promise<ProcessedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  // Browser mammoth uses `arrayBuffer`, Node mammoth uses `buffer` — pass both
  const input: Record<string, unknown> = { arrayBuffer };
  if (typeof Buffer !== 'undefined') {
    input.buffer = Buffer.from(arrayBuffer);
  }
  const result = await mammoth.convertToHtml(
    input as unknown as Parameters<typeof mammoth.convertToHtml>[0],
    {
      styleMap: MAMMOTH_STYLE_MAP,
    }
  );
  const html = result.value;

  if (result.messages.length > 0) {
    console.warn('Mammoth conversion warnings:', result.messages);
  }

  const blob = new Blob([html], { type: 'text/html' });
  const sourceUrl = URL.createObjectURL(blob);
  const doc = parseHtmlLegalToTree(html);
  return { doc, sourceUrl, html };
}

export async function processPdfFile(_file: File): Promise<ProcessedDocument> {
  // PDF Handling via Docling API (Fallback/Alternative)
  throw new Error('TODO: set up backend for PDF conversion');

  // placeholder for future PDF conversion implementation:
  //
  // const apiEndpoint = 'https://example.com/v1/convert/file'; // TODO: read endpoint from config/env
  // const formData = new FormData();
  // formData.append('files', _file);
  // formData.append('to_formats', 'html');

  // // 5s timeout per @safety-officer protocol
  // const controller = new AbortController();
  // const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased to 10s for PDF

  // const response = await fetch(apiEndpoint, {
  //   method: 'POST',
  //   body: formData,
  //   signal: controller.signal,
  // });

  // clearTimeout(timeoutId);

  // if (!response.ok) {
  //   const err = await response.text();
  //   throw new Error(`Conversion failed: ${response.status} ${err}`);
  // }

  // const result = await response.json();
  // if (result?.document?.html_content) {
  //   const htmlContent = result.document.html_content;
  //   const documentUrl = URL.createObjectURL(_file);
  //   const doc = parseHtmlLegalToTree(htmlContent);
  //   return { doc, sourceUrl: documentUrl, html: htmlContent };
  // }
  // throw new Error('Invalid response format');
}

export async function processFile(file: File): Promise<ProcessedDocument> {
  const nameLower = file.name.toLowerCase();

  if (
    nameLower.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return processDocxFile(file);
  }

  if (nameLower.endsWith('.html') || nameLower.endsWith('.htm') || file.type === 'text/html') {
    return processHtmlFile(file);
  }

  if (nameLower.endsWith('.pdf') || file.type === 'application/pdf') {
    return processPdfFile(file);
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}

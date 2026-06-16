import * as mammoth from 'mammoth';
import type { DocumentRootNode } from '../types/document';
import type { StoredEntrySource } from './document-storage';
import { generateId, parseHtmlLegalToTree } from './document-utils';

export interface ProcessedDocument {
  doc: DocumentRootNode;
  sourceUrl: string | null;
  html?: string;
  /** Bytes + metadata needed to persist the entry and rebuild the preview later. */
  source: StoredEntrySource;
  /** Display name: filename for uploads, generated "Untitled (...)" for pasted text. */
  name: string;
  /** First ~40 chars of the source for pasted text; null for files. */
  subtitle: string | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function generateUntitledName(at: Date = new Date()): string {
  return `Untitled (${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())} ${pad2(at.getHours())}:${pad2(at.getMinutes())})`;
}

export function makePastedSubtitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 40) return trimmed;
  // Take the first 40 chars then extend to the next word boundary so we don't
  // truncate mid-word. Append " ..." to signal the truncation.
  let cut = 40;
  while (cut < trimmed.length && /\S/.test(trimmed[cut])) cut++;
  return `${trimmed.slice(0, cut)} ...`;
}

export function createPlainTextDocument(text: string): DocumentRootNode {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return {
    id: generateId(),
    type: 'DOCUMENT',
    children:
      lines.length > 0
        ? lines.map((line) => ({
            id: generateId(),
            number: null,
            type: 'CONTENT' as const,
            format: 'TEXT' as const,
            contents: { de: line.trim() },
            children: [],
          }))
        : [
            {
              id: generateId(),
              number: null,
              type: 'CONTENT' as const,
              format: 'TEXT' as const,
              contents: { de: '' },
              children: [],
            },
          ],
  };
}

const HTML_DETECT_REGEX = /<(?=.*? .*?\/?>|br|hr|input|!--|!DOCTYPE)[a-z]+.*?>|<([a-z]+).*?<\/\1>/i;

export function processTextInput(text: string): ProcessedDocument {
  const isHtml = HTML_DETECT_REGEX.test(text);
  const name = generateUntitledName();
  const subtitle = makePastedSubtitle(text);

  if (isHtml) {
    try {
      const doc = parseHtmlLegalToTree(text);
      const blob = new Blob([text], { type: 'text/html' });
      const sourceUrl = URL.createObjectURL(blob);
      return {
        doc,
        sourceUrl,
        html: text,
        source: { kind: 'pasted-text', mime: 'text/html', bytes: text, originalFilename: null },
        name,
        subtitle,
      };
    } catch (e) {
      console.error('Failed to parse HTML', e);
      // Fallback to plain text if HTML parsing fails
      return {
        doc: createPlainTextDocument(text),
        sourceUrl: null,
        source: { kind: 'pasted-text', mime: 'text/plain', bytes: text, originalFilename: null },
        name,
        subtitle,
      };
    }
  }

  return {
    doc: createPlainTextDocument(text),
    sourceUrl: null,
    source: { kind: 'pasted-text', mime: 'text/plain', bytes: text, originalFilename: null },
    name,
    subtitle,
  };
}

/**
 * Build a {@link ProcessedDocument} from an HTML string. Shared by the file-upload path
 * ({@link processHtmlFile}) and the `loadFile` URL path, so fetched HTML goes through the
 * identical parse + source-blob pipeline. The caller supplies the display name, original
 * filename (null for fetched documents), and source kind.
 */
export function processHtmlString(
  html: string,
  options: { name: string; originalFilename: string | null; kind?: StoredEntrySource['kind'] }
): ProcessedDocument {
  const blob = new Blob([html], { type: 'text/html' });
  const sourceUrl = URL.createObjectURL(blob);
  const doc = parseHtmlLegalToTree(html);
  return {
    doc,
    sourceUrl,
    html,
    source: {
      kind: options.kind ?? 'html',
      mime: 'text/html',
      bytes: html,
      originalFilename: options.originalFilename,
    },
    name: options.name,
    subtitle: null,
  };
}

export async function processHtmlFile(file: File): Promise<ProcessedDocument> {
  const html = await file.text();
  return processHtmlString(html, { name: file.name, originalFilename: file.name });
}

/**
 * Derive a display name for a document fetched from a signed URL. Uses the last path
 * segment (the `<uuid>` from `/file/<uuid>`), ignoring the query string, and falls back
 * to a generic name when there is no usable segment or the URL doesn't parse.
 */
export function deriveNameFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'Demokratis document';
  } catch {
    return 'Demokratis document';
  }
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
  return {
    doc,
    sourceUrl,
    html,
    // Store the *converted HTML*, not the original DOCX bytes: the preview pane
    // renders the persisted blob inline, and browsers won't render
    // application/vnd.openxmlformats-officedocument.wordprocessingml.document —
    // Firefox offers it for download instead. `kind: 'docx'` still records that
    // the origin was DOCX. The original .docx is not used anywhere else.
    source: {
      kind: 'docx',
      mime: 'text/html',
      bytes: html,
      originalFilename: file.name,
    },
    name: file.name,
    subtitle: null,
  };
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

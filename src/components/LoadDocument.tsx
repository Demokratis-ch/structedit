import { ArrowRight, Loader2, Upload } from 'lucide-react';
import * as mammoth from 'mammoth';
import type React from 'react';
import { useRef, useState } from 'react';
import type { ContainerDocumentNode } from '../types/document';
import { generateId, parseHtmlLegalToTree } from '../utils/document-utils';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

interface LoadDocumentProps {
  onConvert: (
    doc: ContainerDocumentNode,
    url: string | null,
    html?: string,
    filename?: string | null
  ) => void;
}

export function LoadDocument({ onConvert }: LoadDocumentProps) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const processFile = async (file: File) => {
    setIsLoading(true);
    let pdfUrl: string | null = null;

    if (file.type === 'application/pdf') {
      pdfUrl = URL.createObjectURL(file);
    }

    // DOCX Handling via Mammoth (Client-Side)
    if (
      file.name.endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const options = {
          styleMap: [
            "p[style-name='Erlasstitel'] => h1:fresh",
            "p[style-name='Titel Arbeitsversion'] => h1:fresh",
            "p[style-name='Abschnittstitel'] => h2:fresh",
            "p[style-name='Artikeltitel'] => h3:fresh",
            "p[style-name='Artikeltitel-Änderung'] => h3:fresh",
            "p[style-name='Ingress'] => p.ingress",
            "r[style-name='Fett'] => strong",
          ],
        };
        const result = await mammoth.convertToHtml({ arrayBuffer }, options);
        const html = result.value; // The generated HTML
        const messages = result.messages; // Any warnings
        // console.log('Mammoth conversion result:', { html, messages });

        if (messages.length > 0) {
          console.warn('Mammoth conversion warnings:', messages);
        }

        // Create a Blob URL for the HTML content to serve as the "Source Preview"
        const blob = new Blob([html], { type: 'text/html' });
        const sourceUrl = URL.createObjectURL(blob);

        setText(html);
        const doc = parseHtmlLegalToTree(html);
        onConvert(doc, sourceUrl, html, file.name); // Pass HTML for persistence
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      } catch (err) {
        console.error('Mammoth conversion failed', err);
        alert(`Failed to convert DOCX: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    // HTML Handling (Client-Side)
    const nameLower = file.name.toLowerCase();
    if (nameLower.endsWith('.html') || nameLower.endsWith('.htm') || file.type === 'text/html') {
      try {
        const html = await file.text();
        const blob = new Blob([html], { type: 'text/html' });
        const sourceUrl = URL.createObjectURL(blob);

        setText(html);
        const doc = parseHtmlLegalToTree(html);
        onConvert(doc, sourceUrl, html, file.name);
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      } catch (err) {
        console.error('HTML parsing failed', err);
        alert(`Failed to parse HTML: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    // PDF Handling via Docling API (Fallback/Alternative)
    try {
      throw new Error('TODO: set up backend for PDF conversion');

      // biome-ignore lint/correctness/noUnreachable: placeholder for future PDF conversion implementation
      const apiEndpoint = 'https://example.com/v1/convert/file'; // TODO: read endpoint from config/env
      const formData = new FormData();
      formData.append('files', file);
      formData.append('to_formats', 'html');

      // 5s timeout per @safety-officer protocol
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased to 10s for PDF

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Conversion failed: ${response.status} ${err}`);
      }

      const result = await response.json();
      if (result?.document?.html_content) {
        const htmlContent = result.document.html_content;
        setText(htmlContent);

        const doc = parseHtmlLegalToTree(htmlContent);
        onConvert(doc, pdfUrl, undefined, file.name);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('File upload error', error);
      alert(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleConvert = () => {
    const isHtml = /<(?=.*? .*?\/?>|br|hr|input|!--|!DOCTYPE)[a-z]+.*?>|<([a-z]+).*?<\/\1>/i.test(
      text
    );

    let doc: ContainerDocumentNode;
    if (isHtml) {
      try {
        doc = parseHtmlLegalToTree(text);
        const blob = new Blob([text], { type: 'text/html' });
        const sourceUrl = URL.createObjectURL(blob);
        onConvert(doc, sourceUrl, text, null);
        return;
      } catch (e) {
        console.error('Failed to parse HTML', e);
        // Fallback: wrap plain text in simple document
        doc = createPlainTextDocument(text);
      }
    } else {
      doc = createPlainTextDocument(text);
    }

    onConvert(doc, null, undefined, null);
  };

  const createPlainTextDocument = (text: string): ContainerDocumentNode => {
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
  };

  return (
    <div
      className="min-h-screen flex flex-col relative"
      data-testid="drop-zone"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/90 border-4 border-dashed border-green-mid rounded-lg">
          <div className="text-center">
            <Upload className="w-16 h-16 mx-auto mb-4 text-green-mid" />
            <p className="text-xl font-medium text-gray-700">Drop your document here</p>
            <p className="text-gray-500">DOCX or HTML files supported</p>
          </div>
        </div>
      )}
      <div className="flex-grow p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h2 className="font-serif text-3xl mb-2">
              StructEdit &mdash; Structured Document Editor
            </h2>
          </div>

          <div className="space-y-6">
            <div className="flex gap-4">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".docx,.doc,.html,.htm"
                onChange={handleFileInputChange}
              />
              <Button
                size="2xl"
                className="py-3 px-8 my-8 text-lg cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="animate-spin w-5 h-5 mr-2" />
                ) : (
                  <Upload className="w-5 h-5 mr-2" />
                )}
                Upload File (DOCX or HTML)
              </Button>
            </div>

            <p>or paste your unstructured OCR, PDF text, or HTML below:</p>

            <div className="relative">
              <Textarea
                placeholder="Paste unstructured text or HTML here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[400px] resize-none border border-gray-200 bg-white focus-visible:ring-green-mid rounded-lg p-4 pb-8"
              />
              <div className="absolute bottom-2 right-3">
                <span className="text-sm text-gray-500">{text.length} chars</span>
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="btn flex-1 rounded-lg hover:opacity-90"
                onClick={handleConvert}
                disabled={!text.trim() || isLoading}
              >
                Convert Text
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

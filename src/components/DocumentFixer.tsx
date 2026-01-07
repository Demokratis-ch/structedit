import React, { useState, useRef } from 'react';
import { Upload, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { parseHtmlLegal, generateId } from '../utils/document-utils';
import { Block } from '../types';
import * as mammoth from 'mammoth';

interface DocumentFixerProps {
  onConvert: (blocks: Block[], url: string | null, html?: string) => void;
}

export function DocumentFixer({ onConvert }: DocumentFixerProps) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    let pdfUrl: string | null = null;

    if (file.type === 'application/pdf') {
      pdfUrl = URL.createObjectURL(file);
    }

    // DOCX Handling via Mammoth (Client-Side)
    if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
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
            "r[style-name='Fett'] => strong"
          ]
        };
        const result = await mammoth.convertToHtml({ arrayBuffer }, options);
        const html = result.value; // The generated HTML
        const messages = result.messages; // Any warnings

        if (messages.length > 0) {
          console.warn("Mammoth conversion warnings:", messages);
        }


        // Create a Blob URL for the HTML content to serve as the "Source Preview"
        const blob = new Blob([html], { type: 'text/html' });
        const sourceUrl = URL.createObjectURL(blob);

        setText(html);
        let newBlocks = parseHtmlLegal(html);
        if (newBlocks.length === 0) {
          newBlocks = [{ id: generateId(), content: 'No structured content found in DOCX.', type: 'p', depth: 0 }];
        }
        onConvert(newBlocks, sourceUrl, html); // Pass HTML for persistence
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;

      } catch (err) {
        console.error("Mammoth conversion failed", err);
        alert(`Failed to convert DOCX: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    // PDF Handling via Docling API (Fallback/Alternative)
    try {
      throw new Error('TODO: set up backend for PDF conversion');

      const apiEndpoint = 'https://example.com/v1/convert/file';  // TODO: read endpoint from config/env
      const formData = new FormData();
      formData.append('files', file);
      formData.append('to_formats', 'html');

      // 5s timeout per @safety-officer protocol
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased to 10s for PDF

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Conversion failed: ${response.status} ${err}`);
      }

      const result = await response.json();
      if (result && result.document && result.document.html_content) {
        const htmlContent = result.document.html_content;
        setText(htmlContent);

        let newBlocks = parseHtmlLegal(htmlContent);
        if (newBlocks.length === 0) {
          newBlocks = [{ id: generateId(), content: 'No structured content found.', type: 'p', depth: 0 }];
        }

        onConvert(newBlocks, pdfUrl);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error("File upload error", error);
      alert(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConvert = () => {
    let newBlocks: Block[] = [];
    const isHtml = /<(?=.*? .*?\/?>|br|hr|input|!--|!DOCTYPE)[a-z]+.*?>|<([a-z]+).*?<\/\1>/i.test(text);

    if (isHtml) {
      try {
        newBlocks = parseHtmlLegal(text);
      } catch (e) {
        console.error("Failed to parse HTML", e);
      }
    }

    if (newBlocks.length === 0) {
      const lines = text.split('\n');
      newBlocks = lines.map((line) => ({
        id: generateId(),
        content: line.trim(),
        type: 'p' as const,
        depth: 0,
      })).filter(b => b.content.length > 0);
    }

    if (newBlocks.length === 0) {
      newBlocks.push({ id: generateId(), content: '', type: 'p', depth: 0 });
    }

    onConvert(newBlocks, null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-grow p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h2 className="font-serif text-3xl mb-2">Fix Broken Documents</h2>
            <p className="text-gray-500 text-lg">Paste your unstructured OCR, PDF text, or HTML below.</p>
          </div>

          <div className="space-y-6">
            <div className="relative">
              <Textarea
                placeholder="Paste unstructured text or HTML here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[400px] resize-none border border-gray-200 bg-white focus-visible:ring-green-mid rounded-lg p-4 pb-8"
              />
              <div className="absolute bottom-2 right-3">
                <span className="text-sm text-gray-500">
                  {text.length} chars
                </span>
              </div>
            </div>

            <div className="flex gap-4">
              <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,.doc" onChange={handleFileUpload} />
              <Button
                variant="outline"
                className="bg-white hover:bg-gray-50 border border-gray-300 rounded-lg px-6"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                Upload File
              </Button>
              <Button
                className="btn btn-primary flex-1 rounded-lg text-white hover:opacity-90"
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

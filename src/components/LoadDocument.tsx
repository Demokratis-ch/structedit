import { ArrowRight, Loader2, Upload } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import type { ContainerDocumentNode } from '../types/document';
import { processFile, processTextInput } from '../utils/file-processing';
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

  const handleFile = async (file: File) => {
    setIsLoading(true);
    try {
      const result = await processFile(file);
      setText(result.html ?? '');
      onConvert(result.doc, result.sourceUrl, result.html, file.name);
    } catch (error) {
      console.error('File processing error', error);
      alert(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
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
      handleFile(file);
    }
  };

  const handleConvert = () => {
    const result = processTextInput(text);
    onConvert(result.doc, result.sourceUrl, result.html, null);
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

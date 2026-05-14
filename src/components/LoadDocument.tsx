import { ArrowRight, Loader2, Upload } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import type { ContainerDocumentNode } from '../types/document';
import {
  createEntry,
  formatQuotaMessage,
  type RecentEntry,
  StorageQuotaUnresolvableError,
} from '../utils/document-storage';
import { processFile, processTextInput } from '../utils/file-processing';
import { RecentDocumentsList } from './RecentDocumentsList';
import { Button } from './ui/button';
import { useToast } from './ui/Toast';
import { Textarea } from './ui/textarea';

interface LoadDocumentProps {
  onConvert: (
    doc: ContainerDocumentNode,
    url: string | null,
    html: string | undefined,
    filename: string | null,
    entryId: string | null
  ) => void;
  recents?: RecentEntry[];
  onLoadRecent?: (id: string) => void;
  onDeleteRecent?: (id: string) => void;
}

export function LoadDocument({
  onConvert,
  recents = [],
  onLoadRecent,
  onDeleteRecent,
}: LoadDocumentProps) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const { showToast } = useToast();

  const persistInitialEntry = async (
    name: string,
    subtitle: string | null,
    tree: ContainerDocumentNode,
    source: ReturnType<typeof processTextInput>['source']
  ): Promise<string | null> => {
    const id = crypto.randomUUID();
    try {
      await createEntry({ id, name, subtitle, language: 'de', tree, source });
      return id;
    } catch (err) {
      // Quota errors get the same user-visible toast that autosave uses; other failures
      // fall back to a console warning. In either case the editor still opens so the
      // user can keep working in memory (and can Download JSON to save).
      if (err instanceof StorageQuotaUnresolvableError) {
        showToast(formatQuotaMessage(err));
      } else {
        console.warn('Failed to persist initial entry; autosave disabled.', err);
      }
      return null;
    }
  };

  const handleFile = async (file: File) => {
    setIsLoading(true);
    try {
      const result = await processFile(file);
      setText(result.html ?? '');
      const entryId = await persistInitialEntry(
        result.name,
        result.subtitle,
        result.doc,
        result.source
      );
      onConvert(result.doc, result.sourceUrl, result.html, result.name, entryId);
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
    if (isLoading) return;
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleConvert = async () => {
    const result = processTextInput(text);
    const entryId = await persistInitialEntry(
      result.name,
      result.subtitle,
      result.doc,
      result.source
    );
    onConvert(result.doc, result.sourceUrl, result.html, result.name, entryId);
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="flex-grow p-6">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h2 className="font-serif text-3xl mb-2">
              StructEdit <span className="text-gray-400">&mdash; Structured Document Editor</span>
            </h2>
          </div>

          {recents.length > 0 && onLoadRecent && onDeleteRecent && (
            <>
              <section className="space-y-3">
                <h3 className="font-serif text-xl text-gray-800">Resume a recent document</h3>
                <RecentDocumentsList
                  entries={recents}
                  onLoad={onLoadRecent}
                  onDelete={onDeleteRecent}
                />
              </section>
              <OrSeparator />
            </>
          )}

          <section className="space-y-3">
            <h3 className="font-serif text-xl text-gray-800">Upload a file</h3>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".docx,.doc,.html,.htm"
              onChange={handleFileInputChange}
            />
            <button
              type="button"
              data-testid="drop-zone"
              data-dragging={isDragging || undefined}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              disabled={isLoading}
              className={`w-full rounded-lg border-2 border-dashed py-12 px-6 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
                isDragging
                  ? 'border-green-mid bg-green-50'
                  : 'border-gray-300 hover:border-green-mid hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading ? (
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              ) : (
                <Upload className="w-8 h-8 text-gray-400" />
              )}
              <span className="text-base font-medium text-gray-700">
                Click or drop a document to upload
              </span>
              <span className="text-xs text-gray-500">DOCX or HTML supported</span>
            </button>
          </section>

          <OrSeparator />

          <section className="space-y-3">
            <h3 className="font-serif text-xl text-gray-800">Paste text</h3>
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
            <Button
              variant="outline"
              className="btn rounded-lg hover:opacity-90"
              onClick={handleConvert}
              disabled={!text.trim() || isLoading}
            >
              Convert Text
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}

function OrSeparator() {
  return (
    <div className="flex items-center gap-4 text-gray-400" aria-hidden="true">
      <div className="flex-grow h-px bg-gray-200" />
      <span className="text-xs uppercase tracking-wider">or</span>
      <div className="flex-grow h-px bg-gray-200" />
    </div>
  );
}

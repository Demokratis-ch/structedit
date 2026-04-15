import { useState } from 'react';
import { EditorInterface } from './components/EditorInterface';
import { Header } from './components/Header';
import { LoadDocument } from './components/LoadDocument';
import type { ContainerDocumentNode } from './types/document';

function App() {
  const [document, setDocument] = useState<ContainerDocumentNode | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [view, setView] = useState<'upload' | 'editor'>('upload');

  const handleConvert = (
    doc: ContainerDocumentNode,
    url: string | null,
    _html?: string,
    filename?: string | null
  ) => {
    setDocument(doc);
    setDocumentUrl(url);
    setFileName(filename ?? null);
    setView('editor');
  };

  const handleBack = () => {
    if (window.confirm('Are you sure you want to go back? Unsaved changes will be lost.')) {
      setView('upload');
      setDocument(null);
      setDocumentUrl(null);
      setFileName(null);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans text-gray-900 overflow-hidden">
      <Header documentName={fileName} />

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 bg-white">
          {view === 'upload' ? (
            <div className="flex-1 overflow-auto p-8">
              <LoadDocument onConvert={handleConvert} />
            </div>
          ) : document ? (
            <EditorInterface
              initialDocument={document}
              documentUrl={documentUrl}
              documentName={fileName}
              onBack={handleBack}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;

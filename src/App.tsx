import { useState } from 'react';
import { DocumentFixer } from './components/DocumentFixer';
import { Header } from './components/Header';
import { TreeEditor } from './components/TreeEditor';
import type { ContainerDocumentNode } from './types/document';

function App() {
  const [document, setDocument] = useState<ContainerDocumentNode | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [view, setView] = useState<'upload' | 'editor'>('upload');

  const handleConvert = (doc: ContainerDocumentNode, url: string | null) => {
    setDocument(doc);
    setPdfUrl(url);
    setView('editor');
  };

  const handleBack = () => {
    if (window.confirm('Are you sure you want to go back? Unsaved changes will be lost.')) {
      setView('upload');
      setDocument(null);
      setPdfUrl(null);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans text-gray-900 overflow-hidden">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 bg-white">
          {view === 'upload' ? (
            <div className="flex-1 overflow-auto p-8">
              <DocumentFixer onConvert={handleConvert} />
            </div>
          ) : document ? (
            <TreeEditor initialDocument={document} pdfUrl={pdfUrl} onBack={handleBack} />
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;

import { useState } from 'react';
import { Header } from './components/Header';
import { DocumentFixer } from './components/DocumentFixer';
import { Editor } from './components/Editor';
import { Block } from './types';

function App() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [view, setView] = useState<'upload' | 'editor'>('upload');

  const handleConvert = (newBlocks: Block[], url: string | null) => {
    setBlocks(newBlocks);
    setPdfUrl(url);
    setView('editor');
  };

  const handleBack = () => {
    if (window.confirm('Are you sure you want to go back? Unsaved changes will be lost.')) {
      setView('upload');
      setBlocks([]);
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
          ) : (
            <Editor 
              initialBlocks={blocks} 
              pdfUrl={pdfUrl} 
              onBack={handleBack} 
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;

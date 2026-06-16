import { useEffect, useState } from 'react';
import { EditorInterface } from './components/EditorInterface';
import { Header } from './components/Header';
import { LoadDocument } from './components/LoadDocument';
import { RemoteLoadErrorView, RemoteLoadingView } from './components/RemoteDocumentStatus';
import { Toast } from './components/ui/Toast';
import { useLoadFromUrl } from './hooks/useLoadFromUrl';
import { useRecentDocuments } from './hooks/useRecentDocuments';
import type { DocumentRootNode } from './types/document';

function App() {
  const [document, setDocument] = useState<DocumentRootNode | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [view, setView] = useState<'upload' | 'editor'>('upload');

  // Revoke object URLs whenever they're replaced or the component unmounts.
  useEffect(() => {
    if (!documentUrl) return;
    return () => {
      URL.revokeObjectURL(documentUrl);
    };
  }, [documentUrl]);

  const { entries, loadEntry, deleteEntry, refresh: refreshRecents } = useRecentDocuments();

  const handleConvert = (
    doc: DocumentRootNode,
    url: string | null,
    _html: string | undefined,
    name: string | null,
    entryId: string | null
  ) => {
    setDocument(doc);
    setDocumentUrl(url);
    setFileName(name);
    setCurrentEntryId(entryId);
    setView('editor');
  };

  // When opened with `?loadFile=<signed URL>`, fetch + load that document into the editor.
  // Reuses `handleConvert` for the success path; surfaces loading/error states otherwise.
  const { state: remoteLoad, dismiss: dismissRemoteLoad } = useLoadFromUrl(handleConvert);

  const handleResume = async (id: string) => {
    const loaded = await loadEntry(id);
    if (!loaded) return;
    setDocument(loaded.entry.tree);
    setDocumentUrl(loaded.documentUrl);
    setFileName(loaded.entry.name);
    setCurrentEntryId(loaded.entry.id);
    setView('editor');
  };

  const handleBack = () => {
    setView('upload');
    setDocument(null);
    setDocumentUrl(null);
    setFileName(null);
    setCurrentEntryId(null);
    // updateEntryTree doesn't fire the structural notifier (autosave writes
    // would otherwise getAll-storm during typing), so we refresh on return so
    // the just-closed entry appears at the top of the picker with its latest
    // updatedAt. EditorInterface awaits its autosave flush before calling this
    // handler, so by now the entry's updatedAt reflects the user's last edit.
    refreshRecents();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans text-gray-900 overflow-hidden">
      <Header documentName={fileName} />

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 bg-white">
          {view === 'editor' && document ? (
            <EditorInterface
              initialDocument={document}
              documentUrl={documentUrl}
              documentName={fileName}
              currentEntryId={currentEntryId}
              onBack={handleBack}
            />
          ) : remoteLoad.status === 'loading' ? (
            <RemoteLoadingView />
          ) : remoteLoad.status === 'error' ? (
            <RemoteLoadErrorView reason={remoteLoad.reason} onGoToUpload={dismissRemoteLoad} />
          ) : (
            <div className="flex-1 overflow-auto p-8">
              <LoadDocument
                onConvert={handleConvert}
                recents={entries}
                onLoadRecent={handleResume}
                onDeleteRecent={deleteEntry}
              />
            </div>
          )}
        </main>
      </div>
      <Toast />
    </div>
  );
}

export default App;

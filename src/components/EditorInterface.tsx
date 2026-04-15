import { useCallback, useRef } from 'react';
import { useTreeEditor } from '../hooks/useTreeEditor';
import type { ContainerDocumentNode, Language } from '../types/document';
import { deriveJsonFilename, downloadFile } from '../utils/document-utils';
import { LeftPane } from './LeftPane';
import { Toolbar } from './Toolbar';
import { TreeEditor } from './TreeEditor';

interface EditorInterfaceProps {
  initialDocument: ContainerDocumentNode;
  documentUrl: string | null;
  documentName?: string | null;
  language?: Language;
  onBack: () => void;
}

export function EditorInterface({
  initialDocument,
  documentUrl,
  documentName,
  language = 'de',
  onBack,
}: EditorInterfaceProps) {
  const editor = useTreeEditor(initialDocument, language);

  const scrollToNodeRef = useRef<((nodeId: string) => void) | null>(null);

  const handleRegisterScrollToNode = useCallback((scrollFn: (nodeId: string) => void) => {
    scrollToNodeRef.current = scrollFn;
  }, []);

  const handleOutlineHeadingClick = useCallback(
    (nodeId: string) => {
      editor.store.setSelection(new Set([nodeId]));
      requestAnimationFrame(() => {
        scrollToNodeRef.current?.(nodeId);
      });
    },
    [editor.store]
  );

  const handleDownload = () => {
    downloadFile(
      JSON.stringify(editor.document, null, 2),
      deriveJsonFilename(documentName),
      'application/json'
    );
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <Toolbar
        onBack={onBack}
        onUndo={editor.undo}
        onRedo={editor.redo}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        historyIndex={editor.historyIndex}
        historyLength={editor.historyLength}
        onDownload={handleDownload}
      />
      <div className="flex-1 flex overflow-hidden">
        <LeftPane
          documentUrl={documentUrl}
          document={editor.document}
          language={language}
          onHeadingClick={handleOutlineHeadingClick}
        />
        <TreeEditor
          editor={editor}
          language={language}
          onScrollToNode={handleRegisterScrollToNode}
        />
      </div>
    </div>
  );
}

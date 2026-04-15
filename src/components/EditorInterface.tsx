import { useCallback, useLayoutEffect, useRef } from 'react';
import { useResizable } from '../hooks/useResizable';
import { useTreeEditor } from '../hooks/useTreeEditor';
import type { ContainerDocumentNode, Language } from '../types/document';
import { deriveJsonFilename, downloadFile } from '../utils/document-utils';
import { DragHandle } from './DragHandle';
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
  const resizable = useResizable({ defaultSize: 0, minSize: 300 });
  const initializedRef = useRef(false);

  // Set initial size to 50% of container on first layout
  useLayoutEffect(() => {
    if (!initializedRef.current && resizable.containerRef.current) {
      initializedRef.current = true;
      resizable.setSize(Math.floor(resizable.containerRef.current.clientWidth / 2));
    }
  });

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
      <div className="flex-1 flex overflow-hidden" ref={resizable.containerRef}>
        <div style={{ width: resizable.size, flexShrink: 0 }} className="min-w-0">
          <LeftPane
            documentUrl={documentUrl}
            document={editor.document}
            language={language}
            onHeadingClick={handleOutlineHeadingClick}
          />
        </div>
        <DragHandle handleProps={resizable.handleProps} isDragging={resizable.isDragging} />
        <TreeEditor
          editor={editor}
          language={language}
          onScrollToNode={handleRegisterScrollToNode}
        />
      </div>
    </div>
  );
}

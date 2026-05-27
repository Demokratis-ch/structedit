import { useMemo } from 'react';
import { useResizable } from '../hooks/useResizable';
import type { DocumentRootNode, Language } from '../types/document';
import { getDocumentOutline } from '../utils/outline-utils';
import { FootnoteSection, PreviewNode } from './PreviewNodeRenderers';
import { PreviewToc } from './PreviewToc';

interface DocumentPreviewProps {
  document: DocumentRootNode;
  language: Language;
  onHeadingClick?: (nodeId: string) => void;
}

export function DocumentPreview({ document, language, onHeadingClick }: DocumentPreviewProps) {
  const footnotes = document.children.filter((c) => c.type === 'FOOTNOTE');
  const otherChildren = document.children.filter((c) => c.type !== 'FOOTNOTE');
  const outline = useMemo(() => getDocumentOutline(document, language), [document, language]);
  const resizable = useResizable({ defaultSize: 512, minSize: 200, maxSize: 800 });

  const handleTocClick = (nodeId: string) => {
    onHeadingClick?.(nodeId);
    const el = globalThis.document.getElementById(nodeId);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex h-full">
      {outline.length > 0 && (
        <PreviewToc
          entries={outline}
          onEntryClick={handleTocClick}
          tocWidth={resizable.size}
          handleProps={resizable.handleProps}
          isDragging={resizable.isDragging}
          onWidthRestore={resizable.setSize}
        />
      )}
      <div
        className="p-6 overflow-y-auto flex-1 min-w-0"
        style={{ fontFamily: "'Source Serif 4', serif" }}
      >
        <div className="max-w-3xl mx-auto">
          {otherChildren.map((child) => (
            <PreviewNode key={child.id} node={child} language={language} headingDepth={1} />
          ))}
          {footnotes.length > 0 && <FootnoteSection footnotes={footnotes} language={language} />}
        </div>
      </div>
    </div>
  );
}

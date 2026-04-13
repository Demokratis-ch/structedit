import { useMemo } from 'react';
import type { ContainerDocumentNode, Language } from '../types/document';
import { getDocumentOutline } from '../utils/outline-utils';

interface DocumentOutlineProps {
  document: ContainerDocumentNode;
  language: Language;
  onHeadingClick: (nodeId: string) => void;
}

export function DocumentOutline({ document, language, onHeadingClick }: DocumentOutlineProps) {
  const entries = useMemo(() => getDocumentOutline(document, language), [document, language]);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No headings in this document.
      </div>
    );
  }

  return (
    <nav aria-label="Document outline" className="p-4 overflow-y-auto h-full">
      <ul className="space-y-0.5">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 transition-colors text-sm cursor-pointer"
              style={{ paddingLeft: `${entry.depth * 16 + 8}px` }}
              onClick={() => onHeadingClick(entry.id)}
            >
              {entry.number && (
                <span className="text-gray-400 mr-1.5 font-mono text-xs">{entry.number}</span>
              )}
              <span className={entry.depth === 0 ? 'font-semibold' : ''}>{entry.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

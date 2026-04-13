import * as Tabs from '@radix-ui/react-tabs';
import type { ContainerDocumentNode, Language } from '../types/document';
import { DocumentOutline } from './DocumentOutline';
import { SourcePreview } from './SourcePreview';

interface LeftPaneProps {
  pdfUrl: string | null;
  document: ContainerDocumentNode;
  language: Language;
  onHeadingClick: (nodeId: string) => void;
}

const tabTriggerClass =
  'px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 transition-colors';

export function LeftPane({ pdfUrl, document, language, onHeadingClick }: LeftPaneProps) {
  return (
    <div className="flex-1 border-r border-gray-200 bg-gray-50 flex flex-col min-w-0 w-1/2">
      <Tabs.Root defaultValue={pdfUrl ? 'original' : 'outline'} className="flex flex-col h-full">
        <Tabs.List className="flex border-b border-gray-200 bg-white px-2 shrink-0">
          {pdfUrl && (
            <Tabs.Trigger value="original" className={tabTriggerClass}>
              Original
            </Tabs.Trigger>
          )}
          <Tabs.Trigger value="outline" className={tabTriggerClass}>
            Outline
          </Tabs.Trigger>
        </Tabs.List>
        {pdfUrl && (
          <Tabs.Content value="original" className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs shrink-0">
              This preview has been processed and may not correspond to the original document
              exactly.
            </div>
            <div className="flex-1 min-h-0">
              <SourcePreview url={pdfUrl} />
            </div>
          </Tabs.Content>
        )}
        <Tabs.Content value="outline" className="flex-1 overflow-hidden">
          <DocumentOutline
            document={document}
            language={language}
            onHeadingClick={onHeadingClick}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

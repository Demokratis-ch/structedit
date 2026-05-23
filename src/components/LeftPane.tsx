import * as Tabs from '@radix-ui/react-tabs';
import type { DocumentRootNode, Language } from '../types/document';
import { DocumentPreview } from './DocumentPreview';
import { SourcePreview } from './SourcePreview';

interface LeftPaneProps {
  documentUrl: string | null;
  document: DocumentRootNode;
  language: Language;
  onHeadingClick: (nodeId: string) => void;
}

const tabTriggerClass =
  'px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 transition-colors';

export function LeftPane({ documentUrl, document, language, onHeadingClick }: LeftPaneProps) {
  return (
    <div className="h-full border-r border-gray-200 bg-gray-50 flex flex-col min-w-0">
      <Tabs.Root
        defaultValue={documentUrl ? 'original' : 'preview'}
        className="flex flex-col h-full"
      >
        <Tabs.List className="flex border-b border-gray-200 bg-white px-2 shrink-0">
          {documentUrl && (
            <Tabs.Trigger value="original" className={tabTriggerClass}>
              Original
            </Tabs.Trigger>
          )}
          <Tabs.Trigger value="preview" className={tabTriggerClass}>
            Preview
          </Tabs.Trigger>
        </Tabs.List>
        {documentUrl && (
          <Tabs.Content value="original" className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs shrink-0">
              This preview has been processed and may not correspond to the original document
              exactly.
            </div>
            <div className="flex-1 min-h-0">
              <SourcePreview url={documentUrl} />
            </div>
          </Tabs.Content>
        )}
        <Tabs.Content value="preview" className="flex-1 overflow-hidden">
          <DocumentPreview
            document={document}
            language={language}
            onHeadingClick={onHeadingClick}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

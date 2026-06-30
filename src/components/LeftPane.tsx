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
        {/*
          Both panels stay mounted (forceMount) and laid out across tab switches so their scroll
          positions survive. The inactive panel is hidden with `invisible` (visibility:hidden)
          rather than `display:none`: display:none would reset the iframe's scroll to 0 and let
          scroll-anchoring drift the rendered preview. The panels are absolutely stacked inside a
          relative wrapper so the hidden one stays sized but doesn't take up flow.
        */}
        <div className="relative flex-1 min-h-0">
          {documentUrl && (
            <Tabs.Content
              forceMount
              value="original"
              className="absolute inset-0 flex flex-col overflow-hidden data-[state=inactive]:invisible data-[state=inactive]:pointer-events-none"
            >
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs shrink-0">
                This preview has been processed and may not correspond to the original document
                exactly.
              </div>
              <div className="flex-1 min-h-0">
                <SourcePreview url={documentUrl} />
              </div>
            </Tabs.Content>
          )}
          <Tabs.Content
            forceMount
            value="preview"
            className="absolute inset-0 overflow-hidden data-[state=inactive]:invisible data-[state=inactive]:pointer-events-none"
          >
            <DocumentPreview
              document={document}
              language={language}
              onHeadingClick={onHeadingClick}
            />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

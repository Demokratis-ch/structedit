import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useResizable } from '../hooks/useResizable';
import type {
  ContainerDocumentNode,
  DocumentNode,
  Language,
  ListItemDocumentNode,
  NodeFormat,
} from '../types/document';
import { renderContent } from '../utils/format-render';
import { getDocumentOutline, type OutlineEntry } from '../utils/outline-utils';
import { DragHandle } from './DragHandle';
import { NumberMarkup } from './NumberMarkup';

/**
 * MARKDOWN is the only format whose rendered output may contain block-level tags
 * (<p>, <ul>, <blockquote>, …) — those can't legally nest inside a <p>, so any
 * call site that would otherwise wrap in a <p> needs to switch to a <div>.
 */
const isBlockFormat = (format: NodeFormat): boolean => format === 'MARKDOWN';

function MarkupSpan({ source, format }: { source: string; format: NodeFormat }) {
  return (
    <span
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderContent sanitizes via DOMPurify
      dangerouslySetInnerHTML={{ __html: renderContent(source, format) }}
    />
  );
}

function MarkupBlock({ source, format }: { source: string; format: NodeFormat }) {
  return (
    <div
      className="markdown-rendered"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderContent sanitizes via DOMPurify
      dangerouslySetInnerHTML={{ __html: renderContent(source, format) }}
    />
  );
}

interface DocumentPreviewProps {
  document: ContainerDocumentNode;
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

function PreviewToc({
  entries,
  onEntryClick,
  tocWidth,
  handleProps,
  isDragging,
  onWidthRestore,
}: {
  entries: OutlineEntry[];
  onEntryClick: (nodeId: string) => void;
  tocWidth: number;
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    role: 'separator';
    'aria-orientation': 'vertical';
  };
  isDragging: boolean;
  onWidthRestore: (size: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const lastExpandedWidth = useRef(tocWidth);
  const tree = useMemo(() => buildTocTree(entries), [entries]);

  // Track the latest expanded width for restore on expand
  useEffect(() => {
    if (!collapsed) {
      lastExpandedWidth.current = tocWidth;
    }
  }, [collapsed, tocWidth]);

  const handleCollapse = () => setCollapsed(true);
  const handleExpand = () => {
    onWidthRestore(lastExpandedWidth.current);
    setCollapsed(false);
  };

  return (
    <>
      <nav
        aria-label="Inhaltsverzeichnis"
        style={collapsed ? undefined : { width: tocWidth, flexShrink: 0 }}
        className={`${collapsed ? 'w-10 p-2' : 'p-4'} shrink-0 sticky top-0 self-start overflow-y-auto max-h-full text-sm text-gray-500`}
      >
        {collapsed ? (
          <button
            type="button"
            aria-label="Expand table of contents"
            title="Expand table of contents"
            className="p-1 rounded hover:bg-gray-200 cursor-pointer"
            onClick={handleExpand}
          >
            ▶
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-700">Inhaltsverzeichnis</h3>
              <button
                type="button"
                aria-label="Collapse table of contents"
                title="Collapse table of contents"
                className="p-1 rounded hover:bg-gray-200 cursor-pointer"
                onClick={handleCollapse}
              >
                ◀
              </button>
            </div>
            <TocList nodes={tree} onEntryClick={onEntryClick} />
          </>
        )}
      </nav>
      {!collapsed && <DragHandle handleProps={handleProps} isDragging={isDragging} />}
    </>
  );
}

interface TocTreeNode {
  entry: OutlineEntry;
  children: TocTreeNode[];
}

function buildTocTree(entries: OutlineEntry[]): TocTreeNode[] {
  const root: TocTreeNode[] = [];
  const stack: { node: TocTreeNode; depth: number }[] = [];

  for (const entry of entries) {
    const treeNode: TocTreeNode = { entry, children: [] };

    // Pop stack until we find a parent at a shallower depth
    while (stack.length > 0 && stack[stack.length - 1].depth >= entry.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(treeNode);
    } else {
      stack[stack.length - 1].node.children.push(treeNode);
    }

    stack.push({ node: treeNode, depth: entry.depth });
  }

  return root;
}

function TocList({
  nodes,
  onEntryClick,
}: {
  nodes: TocTreeNode[];
  onEntryClick: (nodeId: string) => void;
}) {
  return (
    <ul className="py-1">
      {nodes.map((node) => (
        <TocListItem key={node.entry.id} node={node} onEntryClick={onEntryClick} />
      ))}
    </ul>
  );
}

function TocListItem({
  node,
  onEntryClick,
}: {
  key?: string;
  node: TocTreeNode;
  onEntryClick: (nodeId: string) => void;
}) {
  const { entry, children } = node;
  return (
    <li>
      <button
        type="button"
        className="block w-full text-left py-1 -my-1 px-2 rounded text-nowrap text-ellipsis overflow-hidden hover:bg-gray-200 cursor-pointer"
        onClick={() => onEntryClick(entry.id)}
      >
        {entry.number && <NumberMarkup value={entry.number} className="font-bold mr-1" />}
        {entry.text}
      </button>
      {children.length > 0 && (
        <ul className="ml-4">
          {children.map((child) => (
            <TocListItem key={child.entry.id} node={child} onEntryClick={onEntryClick} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface PreviewNodeProps {
  key?: string;
  node: DocumentNode;
  language: Language;
  headingDepth: number;
}

function PreviewNode({ node, language, headingDepth }: PreviewNodeProps) {
  switch (node.type) {
    case 'HEADING':
      return <HeadingNode node={node} language={language} depth={headingDepth} />;
    case 'CONTENT':
      return <ContentNode node={node} language={language} />;
    case 'LIST':
      return <ListNode node={node} language={language} headingDepth={headingDepth} />;
    case 'LIST_ITEM':
      return <ListItemNode node={node} language={language} headingDepth={headingDepth} />;
    case 'FOOTNOTE':
      return null; // Footnotes are rendered by their parent content node
    case 'IMAGE':
      return null;
    default:
      return null;
  }
}

const HEADING_STYLES: Record<number, string> = {
  1: 'text-3xl font-semibold mt-8 first:mt-0',
  2: 'text-2xl font-semibold mt-6 first:mt-0',
  3: 'text-xl font-semibold mt-4 first:mt-0',
  4: 'text-lg font-semibold mt-3 first:mt-0',
};

function HeadingNode({
  node,
  language,
  depth,
}: {
  node: Extract<DocumentNode, { type: 'HEADING' }>;
  language: Language;
  depth: number;
}) {
  const level = Math.min(depth, 4) as 1 | 2 | 3 | 4;
  const Tag = `h${level}` as const;
  const text = node.contents[language] ?? '';
  const className = HEADING_STYLES[level];

  const footnotes = node.children.filter((c) => c.type === 'FOOTNOTE');
  const otherChildren = node.children.filter((c) => c.type !== 'FOOTNOTE');

  return (
    <section id={node.id} className="mb-2">
      <Tag className={className}>
        {node.number && <NumberMarkup value={node.number} className="mr-2" />}
        <MarkupSpan source={text} format={node.format} />
      </Tag>
      {otherChildren.map((child) => (
        <PreviewNode key={child.id} node={child} language={language} headingDepth={depth + 1} />
      ))}
      {footnotes.length > 0 && <FootnoteSection footnotes={footnotes} language={language} />}
    </section>
  );
}

function ContentNode({
  node,
  language,
}: {
  node: Extract<DocumentNode, { type: 'CONTENT' }>;
  language: Language;
}) {
  const text = node.contents[language] ?? '';
  const footnotes = node.children.filter((c) => c.type === 'FOOTNOTE');
  const numberBadge = node.number && (
    <NumberMarkup value={node.number} className="font-bold mr-1" />
  );

  return (
    <div className="my-1">
      {isBlockFormat(node.format) ? (
        <div className="leading-relaxed">
          {numberBadge}
          <MarkupBlock source={text} format={node.format} />
        </div>
      ) : (
        <p className="leading-relaxed">
          {numberBadge}
          <MarkupSpan source={text} format={node.format} />
        </p>
      )}
      {footnotes.length > 0 && <FootnoteSection footnotes={footnotes} language={language} />}
    </div>
  );
}

function ListNode({
  node,
  language,
  headingDepth,
}: {
  node: ContainerDocumentNode;
  language: Language;
  headingDepth: number;
}) {
  return (
    <div className="pl-4">
      {node.children.map((child) => (
        <PreviewNode key={child.id} node={child} language={language} headingDepth={headingDepth} />
      ))}
    </div>
  );
}

function ListItemNode({
  node,
  language,
  headingDepth,
}: {
  node: ListItemDocumentNode;
  language: Language;
  headingDepth: number;
}) {
  const footnotes = node.children.filter((c) => c.type === 'FOOTNOTE');
  const otherChildren = node.children.filter((c) => c.type !== 'FOOTNOTE');

  // Find the first content child to render inline with the marker
  const firstContent =
    otherChildren.length > 0 && otherChildren[0].type === 'CONTENT' ? otherChildren[0] : null;
  const remainingChildren = firstContent ? otherChildren.slice(1) : otherChildren;
  const firstContentText = firstContent ? (firstContent.contents[language] ?? '') : '';
  const firstContentFootnotes = firstContent
    ? firstContent.children.filter((c) => c.type === 'FOOTNOTE')
    : [];
  const firstContentIsBlock = firstContent ? isBlockFormat(firstContent.format) : false;

  const marker = node.number ? (
    <NumberMarkup value={node.number} className="font-bold mr-1" />
  ) : (
    <span className="mr-2">•</span>
  );

  return (
    <div className="my-1">
      {firstContent && firstContentIsBlock ? (
        <div className="leading-relaxed">
          {marker}
          <MarkupBlock source={firstContentText} format={firstContent.format} />
        </div>
      ) : (
        <p className="leading-relaxed">
          {marker}
          {firstContent && <MarkupSpan source={firstContentText} format={firstContent.format} />}
        </p>
      )}
      {firstContentFootnotes.length > 0 && (
        <FootnoteSection footnotes={firstContentFootnotes} language={language} />
      )}
      {remainingChildren.map((child) => (
        <PreviewNode key={child.id} node={child} language={language} headingDepth={headingDepth} />
      ))}
      {footnotes.length > 0 && <FootnoteSection footnotes={footnotes} language={language} />}
    </div>
  );
}

function FootnoteSection({
  footnotes,
  language,
}: {
  footnotes: DocumentNode[];
  language: Language;
}) {
  const FOOTNOTE_LABELS: Record<Language, [string, string]> = {
    de: ['Fussnote', 'Fussnoten'],
    fr: ['note de bas de page', 'notes de bas de page'],
    it: ['nota a piè di pagina', 'note a piè di pagina'],
    en: ['footnote', 'footnotes'],
    rm: ['notiz da pè da pagina', 'notizas da pè da pagina'],
  };
  const [singular, plural] = FOOTNOTE_LABELS[language];
  const label = `${footnotes.length} ${footnotes.length === 1 ? singular : plural}`;

  return (
    <details className="my-2">
      <summary className="text-sm font-semibold text-green-700 cursor-pointer">{label}</summary>
      <div className="flex flex-col gap-2 my-2 pl-4 border-l-2 border-gray-300">
        {footnotes.map((fn) => {
          if (fn.type !== 'FOOTNOTE') return null;
          const text = fn.contents[language] ?? '';
          const numberBadge = fn.number && (
            <NumberMarkup value={fn.number} className="font-bold mr-1" />
          );
          if (isBlockFormat(fn.format)) {
            return (
              <div key={fn.id} className="text-sm">
                {numberBadge}
                <MarkupBlock source={text} format={fn.format} />
              </div>
            );
          }
          return (
            <p key={fn.id} className="text-sm">
              {numberBadge}
              <MarkupSpan source={text} format={fn.format} />
            </p>
          );
        })}
      </div>
    </details>
  );
}

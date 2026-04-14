import { useMemo } from 'react';
import type { ContainerDocumentNode, DocumentNode, Language } from '../types/document';
import { getDocumentOutline, type OutlineEntry } from '../utils/outline-utils';

interface DocumentPreviewProps {
  document: ContainerDocumentNode;
  language: Language;
  onHeadingClick?: (nodeId: string) => void;
}

export function DocumentPreview({ document, language, onHeadingClick }: DocumentPreviewProps) {
  const footnotes = document.children.filter((c) => c.type === 'footnote');
  const otherChildren = document.children.filter((c) => c.type !== 'footnote');
  const outline = useMemo(() => getDocumentOutline(document, language), [document, language]);

  const handleTocClick = (nodeId: string) => {
    onHeadingClick?.(nodeId);
    const el = globalThis.document.getElementById(nodeId);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex h-full">
      {outline.length > 0 && <PreviewToc entries={outline} onEntryClick={handleTocClick} />}
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
}: {
  entries: OutlineEntry[];
  onEntryClick: (nodeId: string) => void;
}) {
  // Build a tree structure from the flat entries for nested <ul> rendering
  const tree = useMemo(() => buildTocTree(entries), [entries]);

  return (
    <nav
      aria-label="Inhaltsverzeichnis"
      className="w-[32rem] shrink-0 sticky top-0 self-start overflow-y-auto max-h-full p-4 text-sm text-gray-500"
    >
      <h3 className="font-medium mb-2 text-gray-700">Inhaltsverzeichnis</h3>
      <TocList nodes={tree} onEntryClick={onEntryClick} />
    </nav>
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
        {entry.number && <strong className="mr-1">{entry.number}</strong>}
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
  node: DocumentNode;
  language: Language;
  headingDepth: number;
}

function PreviewNode({ node, language, headingDepth }: PreviewNodeProps) {
  switch (node.type) {
    case 'heading':
      return <HeadingNode node={node} language={language} depth={headingDepth} />;
    case 'content':
      return <ContentNode node={node} language={language} />;
    case 'list':
      return <ListNode node={node} language={language} headingDepth={headingDepth} />;
    case 'list_item':
      return <ListItemNode node={node} language={language} headingDepth={headingDepth} />;
    case 'footnote':
      return null; // Footnotes are rendered by their parent content node
    case 'image':
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
  node: Extract<DocumentNode, { type: 'heading' }>;
  language: Language;
  depth: number;
}) {
  const level = Math.min(depth, 4) as 1 | 2 | 3 | 4;
  const Tag = `h${level}` as const;
  const text = node.contents[language] ?? '';
  const className = HEADING_STYLES[level];

  const footnotes = node.children.filter((c) => c.type === 'footnote');
  const otherChildren = node.children.filter((c) => c.type !== 'footnote');

  return (
    <section id={node.id} className="mb-2">
      <Tag className={className}>
        {node.number && <span className="mr-2">{node.number}</span>}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content from user-uploaded documents */}
        <span dangerouslySetInnerHTML={{ __html: text }} />
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
  node: Extract<DocumentNode, { type: 'content' }>;
  language: Language;
}) {
  const text = node.contents[language] ?? '';
  const footnotes = node.children.filter((c) => c.type === 'footnote');

  return (
    <div className="my-1">
      <p className="leading-relaxed">
        {node.number && <sup className="font-bold mr-1">{node.number}</sup>}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content from user-uploaded documents */}
        <span dangerouslySetInnerHTML={{ __html: text }} />
      </p>
      {footnotes.length > 0 && <FootnoteSection footnotes={footnotes} language={language} />}
    </div>
  );
}

function ListNode({
  node,
  language,
  headingDepth,
}: {
  node: Extract<DocumentNode, { type: 'list' }>;
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
  node: Extract<DocumentNode, { type: 'list_item' }>;
  language: Language;
  headingDepth: number;
}) {
  const footnotes = node.children.filter((c) => c.type === 'footnote');
  const otherChildren = node.children.filter((c) => c.type !== 'footnote');

  // Find the first content child to render inline with the marker
  const firstContent =
    otherChildren.length > 0 && otherChildren[0].type === 'content' ? otherChildren[0] : null;
  const remainingChildren = firstContent ? otherChildren.slice(1) : otherChildren;
  const firstContentText = firstContent ? (firstContent.contents[language] ?? '') : '';
  const firstContentFootnotes = firstContent
    ? firstContent.children.filter((c) => c.type === 'footnote')
    : [];

  const marker = node.number ? (
    <sup className="font-bold mr-1">{node.number}</sup>
  ) : (
    <span className="mr-2">•</span>
  );

  return (
    <div className="my-1">
      <p className="leading-relaxed">
        {marker}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content from user-uploaded documents */}
        {firstContent && <span dangerouslySetInnerHTML={{ __html: firstContentText }} />}
      </p>
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
          if (fn.type !== 'footnote') return null;
          const text = fn.contents[language] ?? '';
          return (
            <p key={fn.id} className="text-sm">
              {fn.number && <sup className="font-bold mr-1">{fn.number}</sup>}
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content from user-uploaded documents */}
              <span dangerouslySetInnerHTML={{ __html: text }} />
            </p>
          );
        })}
      </div>
    </details>
  );
}

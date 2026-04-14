import type { ContainerDocumentNode, DocumentNode, Language } from '../types/document';

interface DocumentPreviewProps {
  document: ContainerDocumentNode;
  language: Language;
}

export function DocumentPreview({ document, language }: DocumentPreviewProps) {
  const footnotes = document.children.filter((c) => c.type === 'footnote');
  const otherChildren = document.children.filter((c) => c.type !== 'footnote');

  return (
    <div
      className="p-6 overflow-y-auto h-full max-w-3xl mx-auto"
      style={{ fontFamily: "'Source Serif 4', serif" }}
    >
      {otherChildren.map((child) => (
        <PreviewNode key={child.id} node={child} language={language} headingDepth={1} />
      ))}
      {footnotes.length > 0 && <FootnoteSection footnotes={footnotes} language={language} />}
    </div>
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
    <section className="mb-2">
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

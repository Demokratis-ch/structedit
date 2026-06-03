import type {
  DocumentNode,
  Language,
  ListDocumentNode,
  ListItemDocumentNode,
  NodeFormat,
} from '../types/document';
import { renderContent } from '../utils/format-render';
import { NumberBadgeDisplay } from './NumberBadge';

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

interface PreviewNodeProps {
  key?: string;
  node: DocumentNode;
  language: Language;
  headingDepth: number;
}

export function PreviewNode({ node, language, headingDepth }: PreviewNodeProps) {
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

export function HeadingNode({
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
        <NumberBadgeDisplay value={node.number} className="mr-2" />
        <MarkupSpan source={text} format={node.format} />
      </Tag>
      {otherChildren.map((child) => (
        <PreviewNode key={child.id} node={child} language={language} headingDepth={depth + 1} />
      ))}
      {footnotes.length > 0 && <FootnoteSection footnotes={footnotes} language={language} />}
    </section>
  );
}

export function ContentNode({
  node,
  language,
}: {
  node: Extract<DocumentNode, { type: 'CONTENT' }>;
  language: Language;
}) {
  const text = node.contents[language] ?? '';
  const footnotes = node.children.filter((c) => c.type === 'FOOTNOTE');
  const numberBadge = <NumberBadgeDisplay value={node.number} className="font-bold mr-1" />;

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

export function ListNode({
  node,
  language,
  headingDepth,
}: {
  node: ListDocumentNode;
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

export function ListItemNode({
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

  const marker = <NumberBadgeDisplay value={node.number} className="font-bold mr-1" bullet />;

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

export function FootnoteSection({
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
          const numberBadge = <NumberBadgeDisplay value={fn.number} className="font-bold mr-1" />;
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

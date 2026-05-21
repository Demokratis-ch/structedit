import type { ContainerDocumentNode, DocumentNode, Language } from '../types/document';

export interface OutlineEntry {
  id: string;
  number: string | null;
  text: string;
  depth: number;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function getTextContent(
  contents: Partial<{ [K in Language]: string }>,
  language: Language
): string {
  const text = contents[language] ?? Object.values(contents)[0] ?? '';
  return stripHtml(text);
}

export function getDocumentOutline(
  root: ContainerDocumentNode,
  language: Language
): OutlineEntry[] {
  const result: OutlineEntry[] = [];

  function walk(node: DocumentNode, depth: number) {
    if (node.type === 'HEADING') {
      result.push({
        id: node.id,
        number: node.number,
        text: getTextContent(node.contents, language),
        depth,
      });
      // Recurse into heading children to find nested headings
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    } else if ('children' in node && node.children) {
      // For container nodes (document, list, list_item), look inside for headings
      for (const child of node.children) {
        walk(child, depth);
      }
    }
  }

  for (const child of root.children) {
    walk(child, 0);
  }

  return result;
}

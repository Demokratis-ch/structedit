import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  DocumentNode,
  HeadingDocumentNode,
  Language,
} from '../../types/document';
import { generateId } from '../document-utils';

/**
 * Create a document root node for testing
 */
export function createDoc(children: DocumentNode[]): ContainerDocumentNode {
  return {
    id: generateId(),
    type: 'DOCUMENT',
    children,
  };
}

/**
 * Create a content node for testing
 */
export function content(text: string, lang: Language = 'de'): ContentDocumentNode {
  return {
    id: generateId(),
    number: null,
    type: 'CONTENT',
    format: 'TEXT',
    contents: { [lang]: text },
    children: [],
  };
}

/**
 * Create a heading node for testing
 */
export function heading(
  text: string,
  children: DocumentNode[] = [],
  lang: Language = 'de'
): HeadingDocumentNode {
  return {
    id: generateId(),
    number: null,
    type: 'HEADING',
    format: 'TEXT',
    contents: { [lang]: text },
    children,
  };
}

/**
 * Create a list node for testing
 */
export function list(items: { number: string | null; content: string }[]): ContainerDocumentNode {
  return {
    id: generateId(),
    number: null,
    type: 'LIST',
    children: items.map((item) => ({
      id: generateId(),
      number: item.number,
      type: 'LIST_ITEM' as const,
      children: [content(item.content)],
    })),
  };
}

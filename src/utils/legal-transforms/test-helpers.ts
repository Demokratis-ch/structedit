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
    number: null,
    type: 'document',
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
    type: 'content',
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
    type: 'heading',
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
    type: 'list',
    children: items.map((item) => ({
      id: generateId(),
      number: item.number,
      type: 'list_item' as const,
      children: [content(item.content)],
    })),
  };
}

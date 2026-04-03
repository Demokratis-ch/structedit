import type {
  ContainerDocumentNode,
  ContentDocumentNode,
  DocumentNode,
  HeadingDocumentNode,
  Language,
} from '../../types/document';
import { generateId } from '../document-utils';
import { extractCleanText, matchArticle } from './patterns';
import type { TreeTransform } from './types';

/**
 * Check if a node is a content node with article pattern.
 * Returns the extracted number and rest if matched.
 */
function getArticleMatch(node: DocumentNode): { number: string; rest: string } | null {
  if (node.type !== 'content') return null;
  const contentNode = node as ContentDocumentNode;
  const text = extractCleanText(contentNode.contents.de || '');
  const result = matchArticle(text);
  if (result.matched && result.number && result.rest !== undefined) {
    return { number: result.number, rest: result.rest };
  }
  return null;
}

/**
 * Process children of a container, converting article patterns to headings
 */
function processChildren(children: DocumentNode[], _language: Language): DocumentNode[] {
  const newChildren: DocumentNode[] = [];
  let currentArticle: HeadingDocumentNode | null = null;

  for (const child of children) {
    // First, recursively transform any nested containers
    let processedChild = child;
    if ('children' in child && child.children && child.children.length > 0) {
      const containerChild = child as ContainerDocumentNode | HeadingDocumentNode;
      processedChild = {
        ...containerChild,
        children: processChildren(containerChild.children, _language),
      };
    }

    // Then check for article pattern at this level
    const articleMatch = getArticleMatch(processedChild);
    if (articleMatch) {
      // Flush previous article
      if (currentArticle) {
        newChildren.push(currentArticle);
      }
      // Start new article heading with number extracted
      const contentNode = processedChild as ContentDocumentNode;
      const language = Object.keys(contentNode.contents)[0] as Language;
      currentArticle = {
        id: generateId(),
        number: articleMatch.number,
        type: 'heading',
        contents: { [language]: articleMatch.rest },
        children: [],
      };
    } else if (currentArticle && processedChild.type === 'content') {
      // Nest content under current article
      currentArticle.children.push(processedChild);
    } else {
      // Not content, or no current article - flush and add as sibling
      if (currentArticle) {
        newChildren.push(currentArticle);
        currentArticle = null;
      }
      newChildren.push(processedChild);
    }
  }

  // Flush final article
  if (currentArticle) {
    newChildren.push(currentArticle);
  }

  return newChildren;
}

/**
 * Transforms content nodes matching article patterns (Art. X, § X)
 * into heading nodes nested under the current parent.
 *
 * Applies recursively to all container nodes in the tree.
 *
 * @example
 * Input tree:
 *   heading("I. Section")
 *     content("Art. 1 Title")
 *     content("Article content")
 *
 * Output tree:
 *   heading("I. Section")
 *     heading("Art. 1 Title")
 *       content("Article content")
 */
export const articleTransform: TreeTransform = (
  root: ContainerDocumentNode,
  language: Language
): ContainerDocumentNode => {
  return {
    ...root,
    children: processChildren(root.children, language),
  };
};

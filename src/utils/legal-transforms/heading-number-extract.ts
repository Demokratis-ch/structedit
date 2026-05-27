import type { DocumentNode, DocumentRootNode, Language } from '../../types/document';
import { withMappedChildren } from '../tree-utils';
import {
  extractCleanText,
  matchArticle,
  matchRomanSection,
  matchUppercaseLetterSection,
} from './patterns';
import type { TreeTransform } from './types';

/**
 * Try to extract a number from heading text using legal patterns.
 * Tries matchers in priority order: romanSection → article → uppercaseLetterSection.
 */
function tryExtractNumber(text: string): { number: string; rest: string } | null {
  const roman = matchRomanSection(text);
  if (roman.matched && roman.number && roman.rest !== undefined) {
    return { number: roman.number, rest: roman.rest };
  }

  const article = matchArticle(text);
  if (article.matched && article.number && article.rest !== undefined) {
    return { number: article.number, rest: article.rest };
  }

  const letter = matchUppercaseLetterSection(text);
  if (letter.matched && letter.number && letter.rest !== undefined) {
    return { number: letter.number, rest: letter.rest };
  }

  return null;
}

/**
 * Process a single node, extracting number from headings and recursing into children.
 */
function processNode(node: DocumentNode, language: Language): DocumentNode {
  if (node.type === 'HEADING') {
    const withProcessedChildren = withMappedChildren(node, (children) =>
      children.map((child) => processNode(child, language))
    );

    if (node.number !== null) {
      return withProcessedChildren;
    }

    const lang = (Object.keys(node.contents)[0] as Language) || language;
    const text = extractCleanText(node.contents[lang] || '');
    const extracted = tryExtractNumber(text);

    if (extracted) {
      return {
        ...withProcessedChildren,
        number: extracted.number,
        contents: { ...node.contents, [lang]: extracted.rest },
      };
    }

    return withProcessedChildren;
  }

  if ('children' in node && Array.isArray(node.children)) {
    return withMappedChildren(node, (children) =>
      children.map((child) => processNode(child, language))
    );
  }

  return node;
}

/**
 * Extracts numbers from existing heading nodes that have number === null.
 *
 * Walks the tree recursively and applies pattern matching to heading content text.
 * Does not create new headings or restructure the tree — only populates the
 * `number` field on headings that already exist.
 */
export const headingNumberExtractTransform: TreeTransform = (
  root: DocumentRootNode,
  language: Language
): DocumentRootNode => {
  return withMappedChildren(root, (children) =>
    children.map((child) => processNode(child, language))
  );
};

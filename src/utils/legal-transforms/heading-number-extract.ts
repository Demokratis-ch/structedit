import type {
  ContainerDocumentNode,
  DocumentNode,
  HeadingDocumentNode,
  Language,
} from '../../types/document';
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
    const heading = node as HeadingDocumentNode;
    const processedChildren = heading.children.map((child) => processNode(child, language));

    if (heading.number !== null) {
      return { ...heading, children: processedChildren };
    }

    const lang = (Object.keys(heading.contents)[0] as Language) || language;
    const text = extractCleanText(heading.contents[lang] || '');
    const extracted = tryExtractNumber(text);

    if (extracted) {
      return {
        ...heading,
        number: extracted.number,
        contents: { ...heading.contents, [lang]: extracted.rest },
        children: processedChildren,
      };
    }

    return { ...heading, children: processedChildren };
  }

  if ('children' in node && Array.isArray((node as ContainerDocumentNode).children)) {
    const container = node as ContainerDocumentNode;
    return {
      ...container,
      children: container.children.map((child) => processNode(child, language)),
    };
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
  root: ContainerDocumentNode,
  language: Language
): ContainerDocumentNode => {
  return {
    ...root,
    children: root.children.map((child) => processNode(child, language)),
  };
};

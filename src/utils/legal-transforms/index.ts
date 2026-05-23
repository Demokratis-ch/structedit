import type { DocumentRootNode, Language } from '../../types/document';
import { articleTransform } from './article';
import { headingNumberExtractTransform } from './heading-number-extract';
import { letteredItemsTransform } from './lettered-items';
import { listNumberDedupTransform } from './list-number-dedup';
import { mergeAdjacentListsTransform } from './merge-adjacent-lists';
import { romanSectionTransform } from './roman-section';
import type { TreeTransform } from './types';

export { articleTransform } from './article';
export { headingNumberExtractTransform } from './heading-number-extract';
export { letteredItemsTransform } from './lettered-items';
export { listNumberDedupTransform } from './list-number-dedup';
export { mergeAdjacentListsTransform } from './merge-adjacent-lists';
export { LEGAL_PATTERNS } from './patterns';
export { romanSectionTransform } from './roman-section';
// Re-export types
export type { TreeTransform } from './types';

/**
 * Configuration for the legal transform pipeline
 */
export interface LegalTransformConfig {
  /** Merge adjacent list siblings into one list (fixes Mammoth's page-split lists). Default: true */
  mergeAdjacentLists?: boolean;
  /** Enable heading number extraction from existing headings. Default: true */
  headingNumberExtract?: boolean;
  /** Enable roman numeral section detection (I., II., etc.). Default: true */
  romanSections?: boolean;
  /** Enable article pattern detection (Art. X, § X). Default: true */
  articles?: boolean;
  /** Enable lettered item grouping (a., b., c.). Default: true */
  letteredItems?: boolean;
  /** Enable list number deduplication (removes leading numbers from list item text). Default: true */
  listNumberDedup?: boolean;
}

/**
 * Compose multiple transforms into a single transform.
 * Applies transforms left-to-right.
 */
export function composeTransforms(...transforms: TreeTransform[]): TreeTransform {
  return (root: DocumentRootNode, language: Language): DocumentRootNode =>
    transforms.reduce((tree, transform) => transform(tree, language), root);
}

/**
 * Apply Swiss legal document transforms to a tree.
 *
 * Transform order matters:
 * 1. Merge adjacent lists - Fixes page-split lists from Mammoth (must run before dedup so
 *    list items end up in one container before number extraction)
 * 2. Heading number extract - Populates number field on existing headings
 * 3. List number dedup - Fixes duplicate numbering from Mammoth's ol/sup output
 * 4. Roman sections - Creates top-level structure (I., II., III.)
 * 5. Articles - Creates nested structure within sections (Art. 1, Art. 2)
 * 6. Lettered items last - Groups items within articles (a., b., c.)
 *
 * @param root - The document tree to transform
 * @param language - The language of the document content
 * @param config - Optional configuration to enable/disable specific transforms
 * @returns A new transformed tree
 */
export function applySwissLegalTransforms(
  root: DocumentRootNode,
  language: Language,
  config: LegalTransformConfig = {}
): DocumentRootNode {
  const {
    mergeAdjacentLists = true,
    headingNumberExtract = true,
    romanSections = true,
    articles = true,
    letteredItems = true,
    listNumberDedup = true,
  } = config;

  const transforms: TreeTransform[] = [];

  if (mergeAdjacentLists) {
    transforms.push(mergeAdjacentListsTransform);
  }
  if (headingNumberExtract) {
    transforms.push(headingNumberExtractTransform);
  }
  if (listNumberDedup) {
    transforms.push(listNumberDedupTransform);
  }
  if (romanSections) {
    transforms.push(romanSectionTransform);
  }
  if (articles) {
    transforms.push(articleTransform);
  }
  if (letteredItems) {
    transforms.push(letteredItemsTransform);
  }

  return composeTransforms(...transforms)(root, language);
}

import type { ContainerDocumentNode, Language } from '../../types/document';
import { articleTransform } from './article';
import { headingNumberExtractTransform } from './heading-number-extract';
import { letteredItemsTransform } from './lettered-items';
import { listNumberDedupTransform } from './list-number-dedup';
import { romanSectionTransform } from './roman-section';
import type { TreeTransform } from './types';

export { articleTransform } from './article';
export { headingNumberExtractTransform } from './heading-number-extract';
export { letteredItemsTransform } from './lettered-items';
export { listNumberDedupTransform } from './list-number-dedup';
export { LEGAL_PATTERNS } from './patterns';
export { romanSectionTransform } from './roman-section';
// Re-export types
export type { TreeTransform } from './types';

/**
 * Configuration for the legal transform pipeline
 */
export interface LegalTransformConfig {
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
  return (root: ContainerDocumentNode, language: Language): ContainerDocumentNode =>
    transforms.reduce((tree, transform) => transform(tree, language), root);
}

/**
 * Apply Swiss legal document transforms to a tree.
 *
 * Transform order matters:
 * 1. Heading number extract - Populates number field on existing headings
 * 2. List number dedup - Fixes duplicate numbering from Mammoth's ol/sup output
 * 3. Roman sections - Creates top-level structure (I., II., III.)
 * 4. Articles - Creates nested structure within sections (Art. 1, Art. 2)
 * 5. Lettered items last - Groups items within articles (a., b., c.)
 *
 * @param root - The document tree to transform
 * @param language - The language of the document content
 * @param config - Optional configuration to enable/disable specific transforms
 * @returns A new transformed tree
 */
export function applySwissLegalTransforms(
  root: ContainerDocumentNode,
  language: Language,
  config: LegalTransformConfig = {}
): ContainerDocumentNode {
  const {
    headingNumberExtract = true,
    romanSections = true,
    articles = true,
    letteredItems = true,
    listNumberDedup = true,
  } = config;

  const transforms: TreeTransform[] = [];

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

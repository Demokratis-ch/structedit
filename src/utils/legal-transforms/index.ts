import type { ContainerDocumentNode, Language } from '../../types/document';
import { articleTransform } from './article';
import { letteredItemsTransform } from './lettered-items';
import { romanSectionTransform } from './roman-section';
import type { TreeTransform } from './types';

export { articleTransform } from './article';
export { letteredItemsTransform } from './lettered-items';
export { LEGAL_PATTERNS } from './patterns';
export { romanSectionTransform } from './roman-section';
// Re-export types
export type { TreeTransform } from './types';

/**
 * Configuration for the legal transform pipeline
 */
export interface LegalTransformConfig {
  /** Enable roman numeral section detection (I., II., etc.). Default: true */
  romanSections?: boolean;
  /** Enable article pattern detection (Art. X, § X). Default: true */
  articles?: boolean;
  /** Enable lettered item grouping (a., b., c.). Default: true */
  letteredItems?: boolean;
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
 * 1. Roman sections first - Creates top-level structure (I., II., III.)
 * 2. Articles second - Creates nested structure within sections (Art. 1, Art. 2)
 * 3. Lettered items last - Groups items within articles (a., b., c.)
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
  const { romanSections = true, articles = true, letteredItems = true } = config;

  const transforms: TreeTransform[] = [];

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

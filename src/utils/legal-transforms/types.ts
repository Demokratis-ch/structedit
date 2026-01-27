import type { ContainerDocumentNode, Language } from '../../types/document';

/**
 * Tree transformation function type.
 *
 * A TreeTransform takes a document tree and returns a new transformed tree.
 * Transforms are composable and should be pure functions.
 */
export type TreeTransform = (
  root: ContainerDocumentNode,
  language: Language
) => ContainerDocumentNode;

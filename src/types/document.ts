/**
 * ================================ Document tree types ================================
 */

export type Language = 'en' | 'de' | 'fr' | 'it' | 'rm';

/**
 * Per-node formatting mode. Values match the Demokratis platform spec
 * (`SCREAMING_SNAKE_CASE`) so JSON crossing the boundary needs no translation.
 */
export type NodeFormat = 'TEXT' | 'NEWLINES' | 'MARKDOWN_MINIMAL' | 'MARKDOWN_INLINE' | 'MARKDOWN';

export type ContentBearingNodeType = 'HEADING' | 'CONTENT' | 'FOOTNOTE' | 'IMAGE';

export const ALLOWED_FORMATS: Record<ContentBearingNodeType, NodeFormat[]> = {
  HEADING: ['TEXT', 'NEWLINES', 'MARKDOWN_MINIMAL'],
  CONTENT: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  FOOTNOTE: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  IMAGE: ['TEXT', 'NEWLINES'],
};

export const DEFAULT_FORMAT: Record<ContentBearingNodeType, NodeFormat> = {
  HEADING: 'TEXT',
  CONTENT: 'TEXT',
  FOOTNOTE: 'TEXT',
  IMAGE: 'TEXT',
};

export const canHaveFormat = (nodeType: ContentBearingNodeType, format: NodeFormat): boolean => {
  const allowed = ALLOWED_FORMATS[nodeType];
  return Array.isArray(allowed) && allowed.includes(format);
};

/**
 * Container-only nodes have children but no content of their own.
 */
export type ContainerDocumentNodeType =
  | 'DOCUMENT' // Tree root
  | 'LIST'
  | 'LIST_ITEM'; // List item container; text content goes in child 'CONTENT' node

export interface ContainerDocumentNode {
  id: string;
  number: string | null;
  type: ContainerDocumentNodeType;
  children: DocumentNode[];
}

/**
 * Leaf-only nodes have content but no children.
 */
export type LeafDocumentNodeType = 'IMAGE' | 'FOOTNOTE';

export interface LeafDocumentNode {
  id: string;
  number: string | null;
  type: LeafDocumentNodeType;
  contents: Partial<{ [K in Language]: string }>;
  format: NodeFormat;
}

/**
 * Heading nodes have both content and children because they define the tree structure.
 */
export interface HeadingDocumentNode {
  id: string;
  number: string | null;
  type: 'HEADING';
  contents: Partial<{ [K in Language]: string }>;
  children: DocumentNode[];
  format: NodeFormat;
}

/**
 * Content nodes have both content and optional footnote children.
 * Similar to heading, but can only contain footnote nodes as children.
 */
export interface ContentDocumentNode {
  id: string;
  number: string | null;
  type: 'CONTENT';
  contents: Partial<{ [K in Language]: string }>;
  children: DocumentNode[]; // Can only contain FOOTNOTE nodes
  format: NodeFormat;
}

export type DocumentNode =
  | ContainerDocumentNode
  | LeafDocumentNode
  | HeadingDocumentNode
  | ContentDocumentNode;

/**
 * ================================ Example ================================
 */

export const exampleDocument: ContainerDocumentNode = {
  id: '001',
  number: null,
  type: 'DOCUMENT',
  children: [
    {
      id: '002',
      number: '1',
      type: 'HEADING',
      contents: { en: 'Introduction' },
      format: 'TEXT',
      children: [
        {
          id: '003',
          number: null,
          type: 'CONTENT',
          contents: { en: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
          format: 'TEXT',
          children: [
            {
              id: '004',
              number: 'i.',
              type: 'FOOTNOTE',
              contents: { en: 'This is a footnote.', de: 'Dies ist eine Fussnote.' },
              format: 'TEXT',
            },
          ],
        },
      ],
    },
  ],
};

/**
 * ================================ Validation ================================
 */

const VALID_LANGUAGES: Language[] = ['en', 'de', 'fr', 'it', 'rm'];
const CONTAINER_TYPES: ContainerDocumentNodeType[] = ['DOCUMENT', 'LIST', 'LIST_ITEM'];
const LEAF_TYPES: LeafDocumentNodeType[] = ['IMAGE', 'FOOTNOTE'];
const VALID_FORMATS: NodeFormat[] = [
  'TEXT',
  'NEWLINES',
  'MARKDOWN_MINIMAL',
  'MARKDOWN_INLINE',
  'MARKDOWN',
];

/**
 * Mapping of parent types to their allowed child types.
 */
const ALLOWED_CHILDREN: Record<
  ContainerDocumentNodeType | 'HEADING' | 'CONTENT',
  DocumentNode['type'][]
> = {
  DOCUMENT: ['HEADING', 'LIST', 'CONTENT', 'FOOTNOTE', 'IMAGE'],
  HEADING: ['HEADING', 'LIST', 'CONTENT', 'FOOTNOTE', 'IMAGE'],
  LIST_ITEM: ['HEADING', 'LIST', 'CONTENT', 'FOOTNOTE', 'IMAGE'],
  LIST: ['LIST_ITEM'],
  CONTENT: ['FOOTNOTE'],
};

export type ParentType = ContainerDocumentNodeType | 'HEADING' | 'CONTENT' | null;

/**
 * Check if a node type can be a valid child of a parent type.
 */
export const canBeChildOf = (childType: DocumentNode['type'], parentType: ParentType): boolean => {
  // Root level (null parent) uses DOCUMENT rules
  const effectiveParentType = parentType ?? 'DOCUMENT';
  const allowedChildren = ALLOWED_CHILDREN[effectiveParentType];
  return allowedChildren?.includes(childType) ?? false;
};

const isValidContents = (contents: unknown): contents is Partial<{ [K in Language]: string }> => {
  if (typeof contents !== 'object' || contents === null) return false;
  const c = contents as Record<string, unknown>;
  return Object.keys(c).every(
    (key) => VALID_LANGUAGES.includes(key as Language) && typeof c[key] === 'string'
  );
};

const isValidNodeInternal = (
  obj: unknown,
  parentType: ParentType,
  seenIds: Set<string>
): boolean => {
  if (typeof obj !== 'object' || obj === null) return false;
  const node = obj as Record<string, unknown>;

  // Check common fields
  if (typeof node.id !== 'string') return false;
  if (node.number !== null && typeof node.number !== 'string') return false;
  if (typeof node.type !== 'string') return false;

  // Check for duplicate ids
  if (seenIds.has(node.id)) return false;
  seenIds.add(node.id);

  const type = node.type as DocumentNode['type'];

  // Check parent-child relationship
  if (parentType !== null && !canBeChildOf(type, parentType)) return false;

  // Container nodes
  if (CONTAINER_TYPES.includes(type as ContainerDocumentNodeType)) {
    if (!Array.isArray(node.children)) return false;
    if ('contents' in node) return false;
    if ('format' in node) return false;
    return node.children.every((child) =>
      isValidNodeInternal(child, type as ContainerDocumentNodeType, seenIds)
    );
  }

  // Validate format on every content-bearing node
  const isValidFormatForType = (nodeType: ContentBearingNodeType): boolean => {
    if (typeof node.format !== 'string') return false;
    if (!VALID_FORMATS.includes(node.format as NodeFormat)) return false;
    return canHaveFormat(nodeType, node.format as NodeFormat);
  };

  // Leaf nodes
  if (LEAF_TYPES.includes(type as LeafDocumentNodeType)) {
    if (!isValidContents(node.contents)) return false;
    if ('children' in node) return false;
    if (!isValidFormatForType(type as ContentBearingNodeType)) return false;
    return true;
  }

  // Heading nodes
  if (type === 'HEADING') {
    if (!isValidContents(node.contents)) return false;
    if (!Array.isArray(node.children)) return false;
    if (!isValidFormatForType('HEADING')) return false;
    return node.children.every((child) => isValidNodeInternal(child, 'HEADING', seenIds));
  }

  // Content nodes (hybrid - has contents AND children, but children must be FOOTNOTEs only)
  if (type === 'CONTENT') {
    if (!isValidContents(node.contents)) return false;
    if (!Array.isArray(node.children)) return false;
    if (!isValidFormatForType('CONTENT')) return false;
    return node.children.every((child) => isValidNodeInternal(child, 'CONTENT', seenIds));
  }

  return false;
};

export const isValidNode = (obj: unknown): obj is DocumentNode => {
  return isValidNodeInternal(obj, null, new Set());
};

export const isValidDocument = (obj: unknown): obj is DocumentNode => {
  return (obj as any)?.type === 'DOCUMENT' && isValidNodeInternal(obj, null, new Set());
};

/**
 * ================================ DocTree envelope ================================
 *
 * Versioned wrapper around an exported document tree. Lets the export format
 * evolve (and later carry attachments or other metadata) without breaking
 * downstream consumers.
 */

export const DOC_TREE_VERSION = 1 as const;

export interface DocTreeMetadata {
  title: Partial<{ [K in Language]: string }>;
}

export interface DocTreeEnvelope {
  DocTreeVersion: typeof DOC_TREE_VERSION;
  metadata: DocTreeMetadata;
  document: ContainerDocumentNode;
}

export const isValidDocTreeEnvelope = (obj: unknown): obj is DocTreeEnvelope => {
  if (typeof obj !== 'object' || obj === null) return false;
  const env = obj as Record<string, unknown>;
  if (env.DocTreeVersion !== DOC_TREE_VERSION) return false;
  if (typeof env.metadata !== 'object' || env.metadata === null) return false;
  const metadata = env.metadata as Record<string, unknown>;
  // Title shares the language-keyed shape of node `contents`, so we reuse the same validator.
  if (!isValidContents(metadata.title)) return false;
  if (!isValidDocument(env.document)) return false;
  return true;
};

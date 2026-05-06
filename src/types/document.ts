/**
 * ================================ Document tree types ================================
 */

export type Language = 'en' | 'de' | 'fr' | 'it' | 'rm';

/**
 * Per-node formatting mode. Values match the Demokratis platform spec
 * (`SCREAMING_SNAKE_CASE`) so JSON crossing the boundary needs no translation.
 */
export type NodeFormat = 'TEXT' | 'NEWLINES' | 'MARKDOWN_MINIMAL' | 'MARKDOWN_INLINE' | 'MARKDOWN';

export type ContentBearingNodeType = 'heading' | 'content' | 'footnote' | 'image';

export const ALLOWED_FORMATS: Record<ContentBearingNodeType, NodeFormat[]> = {
  heading: ['TEXT', 'NEWLINES', 'MARKDOWN_MINIMAL'],
  content: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  footnote: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  image: ['TEXT', 'NEWLINES'],
};

export const DEFAULT_FORMAT: Record<ContentBearingNodeType, NodeFormat> = {
  heading: 'TEXT',
  content: 'TEXT',
  footnote: 'TEXT',
  image: 'TEXT',
};

export const canHaveFormat = (nodeType: ContentBearingNodeType, format: NodeFormat): boolean => {
  const allowed = ALLOWED_FORMATS[nodeType];
  return Array.isArray(allowed) && allowed.includes(format);
};

/**
 * Container-only nodes have children but no content of their own.
 */
export type ContainerDocumentNodeType =
  | 'document' // Tree root
  | 'list'
  | 'list_item'; // List item container; text content goes in child 'content' node

export interface ContainerDocumentNode {
  id: string;
  number: string | null;
  type: ContainerDocumentNodeType;
  children: DocumentNode[];
}

/**
 * Leaf-only nodes have content but no children.
 */
export type LeafDocumentNodeType = 'image' | 'footnote';

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
  type: 'heading';
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
  type: 'content';
  contents: Partial<{ [K in Language]: string }>;
  children: DocumentNode[]; // Can only contain footnote nodes
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
  type: 'document',
  children: [
    {
      id: '002',
      number: '1',
      type: 'heading',
      contents: { en: 'Introduction' },
      format: 'TEXT',
      children: [
        {
          id: '003',
          number: null,
          type: 'content',
          contents: { en: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
          format: 'TEXT',
          children: [
            {
              id: '004',
              number: 'i.',
              type: 'footnote',
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
const CONTAINER_TYPES: ContainerDocumentNodeType[] = ['document', 'list', 'list_item'];
const LEAF_TYPES: LeafDocumentNodeType[] = ['image', 'footnote'];
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
  ContainerDocumentNodeType | 'heading' | 'content',
  DocumentNode['type'][]
> = {
  document: ['heading', 'list', 'content', 'footnote', 'image'],
  heading: ['heading', 'list', 'content', 'footnote', 'image'],
  list_item: ['heading', 'list', 'content', 'footnote', 'image'],
  list: ['list_item'],
  content: ['footnote'],
};

export type ParentType = ContainerDocumentNodeType | 'heading' | 'content' | null;

/**
 * Check if a node type can be a valid child of a parent type.
 */
export const canBeChildOf = (childType: DocumentNode['type'], parentType: ParentType): boolean => {
  // Root level (null parent) uses document rules
  const effectiveParentType = parentType ?? 'document';
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
  if (type === 'heading') {
    if (!isValidContents(node.contents)) return false;
    if (!Array.isArray(node.children)) return false;
    if (!isValidFormatForType('heading')) return false;
    return node.children.every((child) => isValidNodeInternal(child, 'heading', seenIds));
  }

  // Content nodes (hybrid - has contents AND children, but children must be footnotes only)
  if (type === 'content') {
    if (!isValidContents(node.contents)) return false;
    if (!Array.isArray(node.children)) return false;
    if (!isValidFormatForType('content')) return false;
    return node.children.every((child) => isValidNodeInternal(child, 'content', seenIds));
  }

  return false;
};

export const isValidNode = (obj: unknown): obj is DocumentNode => {
  return isValidNodeInternal(obj, null, new Set());
};

export const isValidDocument = (obj: unknown): obj is DocumentNode => {
  return (obj as any)?.type === 'document' && isValidNodeInternal(obj, null, new Set());
};

/**
 * ============================================================================================
 * DocTree — the tree-structured document format
 * ============================================================================================
 *
 * This module is the canonical reference for the DocTree data model. It is organised as:
 *   1. Type definitions  — the node interfaces and supporting type aliases.
 *   2. Constants         — format allow-lists, defaults, and validation tables.
 *   3. Functions         — `canHaveFormat`, `canBeChildOf`, and the runtime validators.
 *   4. Example           — a small, valid document used in tests and as living documentation.
 *
 * A DocTree is a tree of `DocumentNode`s rooted at a single `DocumentRootNode` (`type:
 * 'DOCUMENT'`). Only `id` and `type` are present on every node type; all other fields differ
 * per type (see the individual interfaces below).
 *
 * The node type set and the parent→child rules mirror the Demokratis platform's DocTree exactly
 * as its JSON envelope exposes them (`DocNodeType::getAllowedChildTypes()` and the
 * `JsonEnvelopeV1Parser` / `JsonEnvelopeV1Serializer` pair in the Demokratis repo), so a tree
 * valid here is importable there and vice versa.
 */

/**
 * ================================ 1. Type definitions ================================
 */

/**
 * Languages a node's `contents` (and a document's `title`) may be keyed by. The runtime list is
 * the single source of truth; the `Language` type is derived from it so the two never drift.
 */
export const LANGUAGES = ['en', 'de', 'fr', 'it', 'rm'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Language-keyed text. Each present language holds the same content in that language. */
export type LocalizedText = Partial<{ [K in Language]: string }>;

/**
 * Per-node formatting mode. Values match the Demokratis platform spec
 * (`SCREAMING_SNAKE_CASE`) so JSON crossing the boundary needs no translation.
 *
 * Each level has a deterministic rendering contract (see `renderContent` and the spec at
 * `openspec/changes/add-per-node-formatting-mode/specs/node-formatting/spec.md`):
 *
 * - `TEXT`             — plain text. Newlines are collapsed to a space and all HTML is escaped.
 * - `NEWLINES`         — plain text where `\n` becomes `<br>`; all other HTML is escaped.
 * - `MARKDOWN_MINIMAL` — single-line inline Markdown supporting only bold/italic/strike/sup/sub.
 *                        Newlines are collapsed to a space (never preserved as `<br>`).
 * - `MARKDOWN_INLINE`  — CommonMark inline + strike/sup/sub, no block elements, no bare HTML.
 * - `MARKDOWN`         — full CommonMark + GFM (paragraphs, lists, tables, …) with bare HTML
 *                        disabled (raw `<tag>` in the source is dropped, not rendered). A single
 *                        `\n` renders as a `<br>` line break (`breaks: true`).
 *
 * Which levels a node may use depends on its type — see {@link ALLOWED_FORMATS}.
 */
export type NodeFormat = 'TEXT' | 'NEWLINES' | 'MARKDOWN_MINIMAL' | 'MARKDOWN_INLINE' | 'MARKDOWN';

/**
 * Node types that carry `contents` and a `format` on the wire. This is the envelope-level
 * notion: it includes `CONTENT_GROUP`, whose fields exist only because the platform emits and
 * requires them (see {@link ContentGroupDocumentNode}). For "does the user edit this node's
 * text?" use {@link hasEditableText} instead.
 */
export type ContentBearingNodeType =
  | 'HEADING'
  | 'CONTENT'
  | 'FOOTNOTE'
  | 'IMAGE'
  | 'TABLE'
  | 'DEFINITION_LIST'
  | 'CONTENT_GROUP';

/** The content-bearing types whose text is edited in the tree — everything except a group. */
export type EditableTextNodeType = Exclude<ContentBearingNodeType, 'CONTENT_GROUP'>;

/**
 * The tree root. There is exactly one per document, and — unlike every other node type — it
 * carries no `number` (it is not a numbered element of the document) and no `contents`/`format`.
 */
export interface DocumentRootNode {
  id: string;
  type: 'DOCUMENT';
  children: BlockDocumentNode[];
}

/** An ordered or unordered list. Its children are exclusively `LIST_ITEM` nodes. */
export interface ListDocumentNode {
  id: string;
  number: string | null;
  type: 'LIST';
  children: ListItemDocumentNode[];
}

/**
 * A single item within a `LIST`. Its own text lives in a child `CONTENT` node. It may hold
 * everything a heading may, except a `CONTENT_GROUP` (platform rule).
 */
export interface ListItemDocumentNode {
  id: string;
  number: string | null;
  type: 'LIST_ITEM';
  children: ListItemChildNode[];
}

/** A heading. Has both content and children because headings define the document's structure. */
export interface HeadingDocumentNode {
  id: string;
  number: string | null;
  type: 'HEADING';
  contents: LocalizedText;
  format: NodeFormat;
  children: BlockDocumentNode[];
}

/**
 * A block of content (e.g. a paragraph). Has text and may carry `FOOTNOTE` children only,
 * making it a hybrid of a content node and a container.
 */
export interface ContentDocumentNode {
  id: string;
  number: string | null;
  type: 'CONTENT';
  contents: LocalizedText;
  format: NodeFormat;
  children: FootnoteDocumentNode[];
}

/** A footnote. A leaf: it has text but no children. */
export interface FootnoteDocumentNode {
  id: string;
  number: string | null;
  type: 'FOOTNOTE';
  contents: LocalizedText;
  format: NodeFormat;
}

/** An image. A leaf: `contents` holds the source/alt text, keyed by language. */
export interface ImageDocumentNode {
  id: string;
  number: string | null;
  type: 'IMAGE';
  contents: LocalizedText;
  format: NodeFormat;
}

/**
 * A content group ("Absatzgruppe" on the platform): a numbered container for one Absatz — its
 * text as a `CONTENT` child, lettered sub-items as a `LIST`, optionally images. The platform
 * renders the group's `number` inline before its first `CONTENT` child.
 *
 * `contents` and `format` are **wire fields only**: the platform has no text on a group, but
 * its serializer emits them (empty strings per language) and its parser requires them, so they
 * must be present for the envelope to round-trip. StructEdit never shows or edits them; a group
 * created here carries `contents: {}` and `format: 'TEXT'`. See the `add-platform-node-types`
 * design (D1) for the rationale and the planned follow-up should the platform change.
 */
export interface ContentGroupDocumentNode {
  id: string;
  number: string | null;
  type: 'CONTENT_GROUP';
  contents: LocalizedText;
  format: NodeFormat;
  children: ContentGroupChildNode[];
}

/**
 * A table. A leaf whose `contents` is a GFM pipe table in `MARKDOWN` (the only allowed format).
 * The platform stores but does not display a table's `number`; it is kept for model uniformity.
 */
export interface TableDocumentNode {
  id: string;
  number: string | null;
  type: 'TABLE';
  contents: LocalizedText;
  format: NodeFormat;
}

/**
 * A definition list ("Begriffsliste"). A leaf whose `contents` is one `Term :: Value` pair per
 * line in `MARKDOWN` (the only allowed format); see `utils/definition-list.ts` for the
 * separator rule shared with the platform. `number` is kept for model uniformity.
 */
export interface DefinitionListDocumentNode {
  id: string;
  number: string | null;
  type: 'DEFINITION_LIST';
  contents: LocalizedText;
  format: NodeFormat;
}

/** Any node in a DocTree, including the tree root. */
export type DocumentNode =
  | DocumentRootNode
  | ListDocumentNode
  | ListItemDocumentNode
  | HeadingDocumentNode
  | ContentDocumentNode
  | FootnoteDocumentNode
  | ImageDocumentNode
  | ContentGroupDocumentNode
  | TableDocumentNode
  | DefinitionListDocumentNode;

/**
 * The block-level nodes allowed directly under `DOCUMENT` and `HEADING` (the `children` element
 * type of both). This is the typed counterpart of the `ALLOWED_CHILDREN` rows for those
 * parents; a compile-time guard keeps the two in sync (see below).
 */
export type BlockDocumentNode =
  | HeadingDocumentNode
  | ListDocumentNode
  | ContentDocumentNode
  | FootnoteDocumentNode
  | ImageDocumentNode
  | ContentGroupDocumentNode
  | TableDocumentNode
  | DefinitionListDocumentNode;

/** The nodes allowed directly under `LIST_ITEM`: every block-level node except a content group. */
export type ListItemChildNode = Exclude<BlockDocumentNode, ContentGroupDocumentNode>;

/** The nodes allowed directly under `CONTENT_GROUP`. */
export type ContentGroupChildNode = ListDocumentNode | ContentDocumentNode | ImageDocumentNode;

/**
 * Every node that carries a `children` array — i.e. the nodes a tree path can descend through.
 * Used by the generic immutable tree helpers (see `withMappedChildren` in `tree-utils.ts`).
 */
export type ParentDocumentNode =
  | DocumentRootNode
  | ListDocumentNode
  | ListItemDocumentNode
  | HeadingDocumentNode
  | ContentDocumentNode
  | ContentGroupDocumentNode;

/**
 * Any node that carries a `number` — i.e. every node type except the tree root. The root is the
 * only node without a number, so this is exactly the set of nodes one can read `.number` from.
 */
export type NumberedDocumentNode = Exclude<DocumentNode, DocumentRootNode>;

/** Any node that carries `contents` and a `format` (see {@link ContentBearingNodeType}). */
export type ContentBearingNode = Extract<DocumentNode, { type: ContentBearingNodeType }>;

/** Any node whose text the user edits in the tree (see {@link EditableTextNodeType}). */
export type EditableTextNode = Extract<DocumentNode, { type: EditableTextNodeType }>;

/** A node type that may legally contain children, plus `null` for the document's root level. */
export type ParentType =
  | 'DOCUMENT'
  | 'LIST'
  | 'LIST_ITEM'
  | 'HEADING'
  | 'CONTENT'
  | 'CONTENT_GROUP'
  | null;

/**
 * Versioned wrapper around an exported document tree. Lets the export format evolve (and later
 * carry attachments or other metadata) without breaking downstream consumers.
 */
export interface DocTreeMetadata {
  title: LocalizedText;
}

export interface DocTreeEnvelope {
  DocTreeVersion: typeof DOC_TREE_VERSION;
  metadata: DocTreeMetadata;
  document: DocumentRootNode;
}

/**
 * ================================ 2. Constants ================================
 */

/**
 * Allowed formats per content-bearing node type — the single source of truth used by validation,
 * the renderer, and the UI, mirroring the platform's `DocNodeType::getAllowedContentFormats()`.
 * Headings are single-line, so they top out at `MARKDOWN_MINIMAL`; images carry no rich text, so
 * they allow only `TEXT`/`NEWLINES`. Tables and definition lists are structured Markdown blocks
 * and allow nothing else; a content group's format is a wire field (see
 * {@link ContentGroupDocumentNode}).
 */
export const ALLOWED_FORMATS: Record<ContentBearingNodeType, NodeFormat[]> = {
  HEADING: ['TEXT', 'NEWLINES', 'MARKDOWN_MINIMAL'],
  CONTENT: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  FOOTNOTE: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  IMAGE: ['TEXT', 'NEWLINES'],
  TABLE: ['MARKDOWN'],
  DEFINITION_LIST: ['MARKDOWN'],
  CONTENT_GROUP: ['TEXT', 'NEWLINES'],
};

/** Default format assigned to each content-bearing node type at creation/import. */
export const DEFAULT_FORMAT: Record<ContentBearingNodeType, NodeFormat> = {
  HEADING: 'TEXT',
  CONTENT: 'TEXT',
  FOOTNOTE: 'TEXT',
  IMAGE: 'TEXT',
  TABLE: 'MARKDOWN',
  DEFINITION_LIST: 'MARKDOWN',
  CONTENT_GROUP: 'TEXT',
};

/** Runtime list of {@link ContentBearingNodeType}, derived from the allow-list table. */
export const CONTENT_BEARING_TYPES: readonly ContentBearingNodeType[] = Object.keys(
  ALLOWED_FORMATS
) as ContentBearingNodeType[];

/** Runtime list of {@link EditableTextNodeType}. */
export const EDITABLE_TEXT_TYPES: readonly EditableTextNodeType[] = CONTENT_BEARING_TYPES.filter(
  (t): t is EditableTextNodeType => t !== 'CONTENT_GROUP'
);

export const DOC_TREE_VERSION = 1 as const;

/** Types that carry neither `contents` nor `format` (the pure containers). */
const CONTAINER_TYPES: ('DOCUMENT' | 'LIST' | 'LIST_ITEM')[] = ['DOCUMENT', 'LIST', 'LIST_ITEM'];
/** Content-bearing types that must not carry `children`. */
const LEAF_TYPES: ('IMAGE' | 'FOOTNOTE' | 'TABLE' | 'DEFINITION_LIST')[] = [
  'IMAGE',
  'FOOTNOTE',
  'TABLE',
  'DEFINITION_LIST',
];
const VALID_FORMATS: NodeFormat[] = [
  'TEXT',
  'NEWLINES',
  'MARKDOWN_MINIMAL',
  'MARKDOWN_INLINE',
  'MARKDOWN',
];

/**
 * Mapping of parent types to their allowed child types. `as const` preserves each row's literal
 * element types so the drift guard below can compare them against the typed `children` unions.
 */
const ALLOWED_CHILDREN = {
  DOCUMENT: [
    'HEADING',
    'LIST',
    'CONTENT',
    'FOOTNOTE',
    'IMAGE',
    'CONTENT_GROUP',
    'TABLE',
    'DEFINITION_LIST',
  ],
  HEADING: [
    'HEADING',
    'LIST',
    'CONTENT',
    'FOOTNOTE',
    'IMAGE',
    'CONTENT_GROUP',
    'TABLE',
    'DEFINITION_LIST',
  ],
  LIST_ITEM: ['HEADING', 'LIST', 'CONTENT', 'FOOTNOTE', 'IMAGE', 'TABLE', 'DEFINITION_LIST'],
  CONTENT_GROUP: ['LIST', 'CONTENT', 'IMAGE'],
  LIST: ['LIST_ITEM'],
  CONTENT: ['FOOTNOTE'],
} as const satisfies Record<NonNullable<ParentType>, DocumentNode['type'][]>;

/**
 * Compile-time guard: the runtime `ALLOWED_CHILDREN` table and the typed `children` unions encode
 * the same parent→child rules, so they cannot silently drift. If a child type is added to one but
 * not the other, the corresponding `SameSet` resolves to `false` and this alias fails to compile.
 * Type-only — erased at runtime.
 */
type AllowedChildType<P extends keyof typeof ALLOWED_CHILDREN> =
  (typeof ALLOWED_CHILDREN)[P][number];
type TypedChildType<P extends ParentDocumentNode> = P['children'][number]['type'];
type SameSet<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertTrue<T extends true> = T;
export type _AllowedChildrenMatchesTypes = AssertTrue<
  SameSet<AllowedChildType<'DOCUMENT'>, TypedChildType<DocumentRootNode>>
> &
  AssertTrue<SameSet<AllowedChildType<'HEADING'>, TypedChildType<HeadingDocumentNode>>> &
  AssertTrue<SameSet<AllowedChildType<'LIST_ITEM'>, TypedChildType<ListItemDocumentNode>>> &
  AssertTrue<SameSet<AllowedChildType<'CONTENT_GROUP'>, TypedChildType<ContentGroupDocumentNode>>> &
  AssertTrue<SameSet<AllowedChildType<'LIST'>, TypedChildType<ListDocumentNode>>> &
  AssertTrue<SameSet<AllowedChildType<'CONTENT'>, TypedChildType<ContentDocumentNode>>>;

/**
 * ================================ 3. Functions ================================
 */

/** Whether a content-bearing node type may use a given format (see {@link ALLOWED_FORMATS}). */
export const canHaveFormat = (nodeType: ContentBearingNodeType, format: NodeFormat): boolean => {
  const allowed = ALLOWED_FORMATS[nodeType];
  return Array.isArray(allowed) && allowed.includes(format);
};

/** Whether a node carries `contents` and a `format` on the wire. */
export const isContentBearingNode = (node: DocumentNode): node is ContentBearingNode =>
  (CONTENT_BEARING_TYPES as readonly string[]).includes(node.type);

/**
 * Whether the user edits this node's text in the tree. False for the pure containers and for a
 * `CONTENT_GROUP`, whose `contents` exist only for the wire — a group is edited by its number,
 * like a list item. The single predicate behind every text-edit vs. number-edit decision.
 */
export const hasEditableText = (node: DocumentNode): node is EditableTextNode =>
  (EDITABLE_TEXT_TYPES as readonly string[]).includes(node.type);

/** Check if a node type can be a valid child of a parent type. */
export const canBeChildOf = (childType: DocumentNode['type'], parentType: ParentType): boolean => {
  // Root level (null parent) uses DOCUMENT rules
  const effectiveParentType = parentType ?? 'DOCUMENT';
  // Widen the `as const` row to a plain type[] so `.includes` accepts any node type.
  const allowedChildren: readonly DocumentNode['type'][] = ALLOWED_CHILDREN[effectiveParentType];
  return allowedChildren?.includes(childType) ?? false;
};

const isValidContents = (contents: unknown): contents is LocalizedText => {
  if (typeof contents !== 'object' || contents === null) return false;
  const c = contents as Record<string, unknown>;
  return Object.keys(c).every(
    (key) => LANGUAGES.includes(key as Language) && typeof c[key] === 'string'
  );
};

const isValidNodeInternal = (
  obj: unknown,
  parentType: ParentType,
  seenIds: Set<string>
): boolean => {
  if (typeof obj !== 'object' || obj === null) return false;
  const node = obj as Record<string, unknown>;

  // Check common fields (id and type are the only fields present on every node type).
  if (typeof node.id !== 'string') return false;
  if (typeof node.type !== 'string') return false;

  const type = node.type as DocumentNode['type'];

  // The document root carries no number; tolerate an explicit null for documents persisted
  // before the field was removed, but reject any other value. Every other node type still
  // requires a number field (null or a string label).
  if (type === 'DOCUMENT') {
    if ('number' in node && node.number !== null) return false;
  } else {
    if (node.number !== null && typeof node.number !== 'string') return false;
  }

  // Check for duplicate ids
  if (seenIds.has(node.id)) return false;
  seenIds.add(node.id);

  // Check parent-child relationship
  if (parentType !== null && !canBeChildOf(type, parentType)) return false;

  // Container nodes
  if (CONTAINER_TYPES.includes(type as 'DOCUMENT' | 'LIST' | 'LIST_ITEM')) {
    if (!Array.isArray(node.children)) return false;
    if ('contents' in node) return false;
    if ('format' in node) return false;
    return node.children.every((child) =>
      isValidNodeInternal(child, type as 'DOCUMENT' | 'LIST' | 'LIST_ITEM', seenIds)
    );
  }

  // Validate format on every content-bearing node
  const isValidFormatForType = (nodeType: ContentBearingNodeType): boolean => {
    if (typeof node.format !== 'string') return false;
    if (!VALID_FORMATS.includes(node.format as NodeFormat)) return false;
    return canHaveFormat(nodeType, node.format as NodeFormat);
  };

  // Leaf nodes
  if (LEAF_TYPES.includes(type as 'IMAGE' | 'FOOTNOTE' | 'TABLE' | 'DEFINITION_LIST')) {
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

  // Content groups: a numbered container that also carries the platform's wire fields. The
  // contents are accepted as any localized strings (a platform export may carry text there)
  // but are never rendered — see ContentGroupDocumentNode.
  if (type === 'CONTENT_GROUP') {
    if (!isValidContents(node.contents)) return false;
    if (!Array.isArray(node.children)) return false;
    if (!isValidFormatForType('CONTENT_GROUP')) return false;
    return node.children.every((child) => isValidNodeInternal(child, 'CONTENT_GROUP', seenIds));
  }

  return false;
};

export const isValidNode = (obj: unknown): obj is DocumentNode => {
  return isValidNodeInternal(obj, null, new Set());
};

export const isValidDocument = (obj: unknown): obj is DocumentRootNode => {
  return (
    (obj as { type?: unknown })?.type === 'DOCUMENT' && isValidNodeInternal(obj, null, new Set())
  );
};

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

/**
 * ================================ 4. Example ================================
 *
 * One valid document that uses every node type once, in the shape a Swiss legal draft takes:
 * an article heading, a numbered Absatz with a footnote, a grouped Absatz whose number renders
 * inline before its text and whose lettered items form a list, then a table, a definition list
 * and an image.
 */

export const exampleDocument: DocumentRootNode = {
  id: '001',
  type: 'DOCUMENT',
  children: [
    {
      id: '002',
      number: 'Art. 1',
      type: 'HEADING',
      contents: { en: 'Purpose' },
      format: 'TEXT',
      children: [
        {
          id: '003',
          number: '1',
          type: 'CONTENT',
          contents: { en: 'This act regulates the matter.' },
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
        {
          // A grouped Absatz: the group carries the number "2", its first child the text, and
          // the lettered items sit in a list below. `contents`/`format` are wire fields only.
          id: '005',
          number: '2',
          type: 'CONTENT_GROUP',
          contents: {},
          format: 'TEXT',
          children: [
            {
              id: '006',
              number: null,
              type: 'CONTENT',
              contents: { en: 'It applies to:' },
              format: 'TEXT',
              children: [],
            },
            {
              id: '007',
              number: null,
              type: 'LIST',
              children: [
                {
                  id: '008',
                  number: 'a.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: '009',
                      number: null,
                      type: 'CONTENT',
                      contents: { en: 'the Confederation;' },
                      format: 'TEXT',
                      children: [],
                    },
                  ],
                },
                {
                  id: '010',
                  number: 'b.',
                  type: 'LIST_ITEM',
                  children: [
                    {
                      id: '011',
                      number: null,
                      type: 'CONTENT',
                      contents: { en: 'the cantons.' },
                      format: 'TEXT',
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: '012',
          number: '',
          type: 'TABLE',
          contents: {
            en: '| Term | Meaning |\n| --- | --- |\n| Confederation | The federal state |',
          },
          format: 'MARKDOWN',
        },
        {
          id: '013',
          number: '',
          type: 'DEFINITION_LIST',
          contents: { en: 'Confederation :: The federal state\nCanton :: A member state' },
          format: 'MARKDOWN',
        },
        {
          id: '014',
          number: null,
          type: 'IMAGE',
          contents: { en: 'https://example.com/figure-1.png' },
          format: 'TEXT',
        },
      ],
    },
  ],
};

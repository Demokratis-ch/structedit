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
 * Per-node contribution mode — ported from the Demokratis platform's `DocNodeContributionMode`.
 * It controls how consultation participants may interact with a node once the document is opened
 * for feedback:
 *
 * - `NONE`     — locked; no interaction.
 * - `REMARK`   — participants may attach a free-text annotation only.
 * - `PROPOSAL` — participants may annotate AND submit an amendment proposal (their edited text,
 *                shown as a diff). Only meaningful on "proposable" types (heading/content/footnote,
 *                see {@link PROPOSABLE_TYPES}).
 *
 * The field is optional on every node; an absent value means "default for the element type",
 * matching Demokratis's `null`. Values use StructEdit's uppercase enum convention (like
 * {@link NodeFormat}); the Demokratis importer lowercase-folds them. Which modes a node type may
 * carry is defined by {@link ALLOWED_MODES}.
 */
export type ContributionMode = 'NONE' | 'REMARK' | 'PROPOSAL';

/** Node types that carry `contents` and a `format` (i.e. anything that can hold text/an image). */
export type ContentBearingNodeType = 'HEADING' | 'CONTENT' | 'FOOTNOTE' | 'IMAGE';

/**
 * The tree root. There is exactly one per document, and — unlike every other node type — it
 * carries no `number` (it is not a numbered element of the document) and no `contents`/`format`.
 */
export interface DocumentRootNode {
  id: string;
  type: 'DOCUMENT';
  contributionMode?: ContributionMode;
  children: BlockDocumentNode[];
}

/** An ordered or unordered list. Its children are exclusively `LIST_ITEM` nodes. */
export interface ListDocumentNode {
  id: string;
  number: string | null;
  type: 'LIST';
  contributionMode?: ContributionMode;
  children: ListItemDocumentNode[];
}

/** A single item within a `LIST`. Its own text lives in a child `CONTENT` node. */
export interface ListItemDocumentNode {
  id: string;
  number: string | null;
  type: 'LIST_ITEM';
  contributionMode?: ContributionMode;
  children: BlockDocumentNode[];
}

/** A heading. Has both content and children because headings define the document's structure. */
export interface HeadingDocumentNode {
  id: string;
  number: string | null;
  type: 'HEADING';
  contributionMode?: ContributionMode;
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
  contributionMode?: ContributionMode;
  contents: LocalizedText;
  format: NodeFormat;
  children: FootnoteDocumentNode[];
}

/** A footnote. A leaf: it has text but no children. */
export interface FootnoteDocumentNode {
  id: string;
  number: string | null;
  type: 'FOOTNOTE';
  contributionMode?: ContributionMode;
  contents: LocalizedText;
  format: NodeFormat;
}

/** An image. A leaf: `contents` holds the source/alt text, keyed by language. */
export interface ImageDocumentNode {
  id: string;
  number: string | null;
  type: 'IMAGE';
  contributionMode?: ContributionMode;
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
  | ImageDocumentNode;

/**
 * The block-level nodes allowed directly under `DOCUMENT`, `HEADING`, and `LIST_ITEM` (the
 * `children` element type of all three). This is the typed counterpart of the `ALLOWED_CHILDREN`
 * rows for those parents; a compile-time guard keeps the two in sync (see below).
 */
export type BlockDocumentNode =
  | HeadingDocumentNode
  | ListDocumentNode
  | ContentDocumentNode
  | FootnoteDocumentNode
  | ImageDocumentNode;

/**
 * Every node that carries a `children` array — i.e. the nodes a tree path can descend through.
 * Used by the generic immutable tree helpers (see `withMappedChildren` in `tree-utils.ts`).
 */
export type ParentDocumentNode =
  | DocumentRootNode
  | ListDocumentNode
  | ListItemDocumentNode
  | HeadingDocumentNode
  | ContentDocumentNode;

/**
 * Any node that carries a `number` — i.e. every node type except the tree root. The root is the
 * only node without a number, so this is exactly the set of nodes one can read `.number` from.
 */
export type NumberedDocumentNode = Exclude<DocumentNode, DocumentRootNode>;

/** A node type that may legally contain children, plus `null` for the document's root level. */
export type ParentType = 'DOCUMENT' | 'LIST' | 'LIST_ITEM' | 'HEADING' | 'CONTENT' | null;

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
 * the renderer, and the UI. Headings are single-line, so they top out at `MARKDOWN_MINIMAL`;
 * images carry no rich text, so they allow only `TEXT`/`NEWLINES`.
 */
export const ALLOWED_FORMATS: Record<ContentBearingNodeType, NodeFormat[]> = {
  HEADING: ['TEXT', 'NEWLINES', 'MARKDOWN_MINIMAL'],
  CONTENT: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  FOOTNOTE: ['TEXT', 'NEWLINES', 'MARKDOWN'],
  IMAGE: ['TEXT', 'NEWLINES'],
};

/** Default format assigned to each content-bearing node type at creation/import. */
export const DEFAULT_FORMAT: Record<ContentBearingNodeType, NodeFormat> = {
  HEADING: 'TEXT',
  CONTENT: 'TEXT',
  FOOTNOTE: 'TEXT',
  IMAGE: 'TEXT',
};

/**
 * Node types on which a `PROPOSAL` contribution mode is meaningful — i.e. a participant may submit
 * an amendment proposal against the node's text. Mirrors Demokratis `DocNodeType::isProposable()`.
 */
export const PROPOSABLE_TYPES = ['HEADING', 'CONTENT', 'FOOTNOTE'] as const;

/**
 * Allowed contribution modes per node type — the single source of truth for the mode picker and
 * validation. `NONE` (lock) and `REMARK` (annotate) apply to every node; `PROPOSAL` only to the
 * proposable types. An absent mode ("default for the element type") is always valid and is not
 * listed here. The `satisfies Record<DocumentNode['type'], …>` is a compile-time drift guard: a new
 * node type forces a new row here or the build fails (same idea as {@link ALLOWED_CHILDREN}).
 */
export const ALLOWED_MODES = {
  DOCUMENT: ['NONE', 'REMARK'],
  LIST: ['NONE', 'REMARK'],
  LIST_ITEM: ['NONE', 'REMARK'],
  IMAGE: ['NONE', 'REMARK'],
  HEADING: ['NONE', 'REMARK', 'PROPOSAL'],
  CONTENT: ['NONE', 'REMARK', 'PROPOSAL'],
  FOOTNOTE: ['NONE', 'REMARK', 'PROPOSAL'],
} as const satisfies Record<DocumentNode['type'], ContributionMode[]>;

export const DOC_TREE_VERSION = 1 as const;

const CONTAINER_TYPES: ('DOCUMENT' | 'LIST' | 'LIST_ITEM')[] = ['DOCUMENT', 'LIST', 'LIST_ITEM'];
const LEAF_TYPES: ('IMAGE' | 'FOOTNOTE')[] = ['IMAGE', 'FOOTNOTE'];
const VALID_FORMATS: NodeFormat[] = [
  'TEXT',
  'NEWLINES',
  'MARKDOWN_MINIMAL',
  'MARKDOWN_INLINE',
  'MARKDOWN',
];
const VALID_MODES: ContributionMode[] = ['NONE', 'REMARK', 'PROPOSAL'];

/**
 * Mapping of parent types to their allowed child types. `as const` preserves each row's literal
 * element types so the drift guard below can compare them against the typed `children` unions.
 */
const ALLOWED_CHILDREN = {
  DOCUMENT: ['HEADING', 'LIST', 'CONTENT', 'FOOTNOTE', 'IMAGE'],
  HEADING: ['HEADING', 'LIST', 'CONTENT', 'FOOTNOTE', 'IMAGE'],
  LIST_ITEM: ['HEADING', 'LIST', 'CONTENT', 'FOOTNOTE', 'IMAGE'],
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

/** Whether a node type may carry a given contribution mode (see {@link ALLOWED_MODES}). */
export const canHaveMode = (nodeType: DocumentNode['type'], mode: ContributionMode): boolean =>
  (ALLOWED_MODES[nodeType] as readonly ContributionMode[]).includes(mode);

/**
 * Carry a contribution mode across a node type change: keep it when the target type may hold it,
 * otherwise drop to `undefined` (the "default for element type"). Mirrors {@link carryFormatOrDefault}
 * — except a mode's default is *absence*, so a disallowed mode clamps to `undefined`, not to a value.
 */
export const carryModeOrClamp = (
  previousMode: ContributionMode | undefined,
  nextType: DocumentNode['type']
): ContributionMode | undefined =>
  previousMode !== undefined && canHaveMode(nextType, previousMode) ? previousMode : undefined;

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

  // Validate the optional contribution mode uniformly across every node type (including the root
  // and container types). Absent = "default for the element type"; when present it must be a known
  // value and one that this node's type may carry.
  if ('contributionMode' in node && node.contributionMode !== undefined) {
    const mode = node.contributionMode;
    if (typeof mode !== 'string' || !VALID_MODES.includes(mode as ContributionMode)) return false;
    if (!canHaveMode(type, mode as ContributionMode)) return false;
  }

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
  if (LEAF_TYPES.includes(type as 'IMAGE' | 'FOOTNOTE')) {
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
 */

export const exampleDocument: DocumentRootNode = {
  id: '001',
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

import { isValidDocument } from '../types/document';
import type { IncompatibleEntry, StoredDocumentEntry } from './document-storage';

export const SCHEMA_VERSION = 2;

const V1_TO_V2_TYPE_RENAMES: Record<string, string> = {
  document: 'DOCUMENT',
  heading: 'HEADING',
  content: 'CONTENT',
  list: 'LIST',
  list_item: 'LIST_ITEM',
  image: 'IMAGE',
  footnote: 'FOOTNOTE',
};

/**
 * Run the version-dispatch chain on a raw record, then validate the migrated
 * tree against `isValidDocument`. Returns either a usable {@link StoredDocumentEntry}
 * or an {@link IncompatibleEntry} carrying just enough metadata for the picker
 * to render a disabled row.
 */
export function migrateEntry(raw: unknown): StoredDocumentEntry | IncompatibleEntry {
  const fallback = (): IncompatibleEntry => extractIncompatible(raw);

  if (!isObject(raw)) return fallback();

  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : null;
  if (version === null || version > SCHEMA_VERSION) return fallback();

  let working: Record<string, unknown> = raw;
  if (version < 2) working = migrateV1ToV2(working);

  if (!hasStoredEntryShape(working)) return fallback();
  if (!isValidDocument(working.tree)) return fallback();

  return working as unknown as StoredDocumentEntry;
}

// Issue #103: node `type` values switched from lowercase to SCREAMING_SNAKE_CASE.
// Walk the tree and uppercase known type literals so v1 documents survive the bump.
// Only `tree` needs walking; other entry fields (source, name, language, …) are
// unaffected by the node-type rename.
function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, tree: upgradeNodeTypes(raw.tree), schemaVersion: 2 };
}

function upgradeNodeTypes(node: unknown): unknown {
  if (!isObject(node)) return node;
  const next: Record<string, unknown> = { ...node };
  if (typeof next.type === 'string' && V1_TO_V2_TYPE_RENAMES[next.type]) {
    next.type = V1_TO_V2_TYPE_RENAMES[next.type];
  }
  if (Array.isArray(next.children)) {
    next.children = next.children.map(upgradeNodeTypes);
  }
  return next;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasStoredEntryShape(raw: Record<string, unknown>): boolean {
  return (
    typeof raw.id === 'string' &&
    typeof raw.name === 'string' &&
    typeof raw.updatedAt === 'number' &&
    typeof raw.createdAt === 'number' &&
    isObject(raw.source) &&
    isObject(raw.tree)
  );
}

function extractIncompatible(raw: unknown): IncompatibleEntry {
  const r = isObject(raw) ? raw : {};
  return {
    status: 'incompatible',
    id: typeof r.id === 'string' ? r.id : 'unknown',
    name: typeof r.name === 'string' ? r.name : 'unknown',
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}

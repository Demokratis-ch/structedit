import { isValidDocument } from '../types/document';
import type { IncompatibleEntry, StoredDocumentEntry } from './document-storage';

export const SCHEMA_VERSION = 1;

/**
 * Run the version-dispatch chain on a raw record, then validate the migrated
 * tree against `isValidDocument`. Returns either a usable {@link StoredDocumentEntry}
 * or an {@link IncompatibleEntry} carrying just enough metadata for the picker
 * to render a disabled row.
 *
 * The chain is empty today (v1 only). When a future schema bumps to v2, add a
 * `migrateV1ToV2(raw)` step and update SCHEMA_VERSION in this file.
 */
export function migrateEntry(raw: unknown): StoredDocumentEntry | IncompatibleEntry {
  const fallback = (): IncompatibleEntry => extractIncompatible(raw);

  if (!isObject(raw)) return fallback();

  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : null;
  if (version === null || version > SCHEMA_VERSION) return fallback();

  // Future: dispatch migrations here for version < SCHEMA_VERSION.

  if (!hasStoredEntryShape(raw)) return fallback();
  if (!isValidDocument(raw.tree)) return fallback();

  return raw as unknown as StoredDocumentEntry;
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

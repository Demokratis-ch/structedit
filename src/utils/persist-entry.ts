import type { DocumentRootNode, Language } from '../types/document';
import {
  createEntry,
  formatQuotaMessage,
  StorageQuotaUnresolvableError,
  type StoredEntrySource,
} from './document-storage';

export interface PersistInitialEntryInput {
  name: string;
  subtitle: string | null;
  tree: DocumentRootNode;
  source: StoredEntrySource;
  language?: Language;
}

/**
 * Persist a freshly-created entry (upload, paste, or `loadFile` URL) to IndexedDB and
 * return its id, or `null` when persistence fails.
 *
 * Quota errors surface via the supplied `showToast` (the same toast autosave uses);
 * other failures fall back to a console warning. In every failure case the caller can
 * still open the editor and work in memory — persistence is best-effort, never a gate.
 */
export async function persistInitialEntry(
  input: PersistInitialEntryInput,
  showToast: (message: string) => void
): Promise<string | null> {
  const id = crypto.randomUUID();
  try {
    await createEntry({
      id,
      name: input.name,
      subtitle: input.subtitle,
      language: input.language ?? 'de',
      tree: input.tree,
      source: input.source,
    });
    return id;
  } catch (err) {
    if (err instanceof StorageQuotaUnresolvableError) {
      showToast(formatQuotaMessage(err));
    } else {
      console.warn('Failed to persist initial entry; autosave disabled.', err);
    }
    return null;
  }
}

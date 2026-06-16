import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/ui/Toast';
import type { DocumentRootNode } from '../types/document';
import { isEmptyDocument } from '../utils/document-utils';
import { deriveNameFromUrl, processHtmlString } from '../utils/file-processing';
import { persistInitialEntry } from '../utils/persist-entry';
import {
  fetchRemoteDocument,
  parseLoadFileParam,
  type RemoteLoadErrorReason,
  resolveAllowedHosts,
} from '../utils/remote-document';

export type RemoteLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; reason: RemoteLoadErrorReason };

/** Matches App's `handleConvert` — the success path reuses the upload transition verbatim. */
export type OnRemoteDocumentLoaded = (
  doc: DocumentRootNode,
  sourceUrl: string | null,
  html: string | undefined,
  name: string | null,
  entryId: string | null
) => void;

/** Drop the `loadFile` param while preserving the deploy path (D7). */
function stripLoadFileParam(): void {
  window.history.replaceState(null, '', window.location.pathname);
}

/**
 * Decide the first-render view synchronously so there is no flash of the upload screen
 * before the loading state when a `loadFile` param is present.
 */
function computeInitialState(): RemoteLoadState {
  const parsed = parseLoadFileParam(window.location.search, resolveAllowedHosts());
  // `in`-narrowing (not `parsed.ok`): this project compiles without strictNullChecks,
  // where boolean-discriminant narrowing doesn't apply but `in` does.
  if (!('reason' in parsed)) return { status: 'loading' };
  return parsed.reason === 'absent'
    ? { status: 'idle' }
    : { status: 'error', reason: parsed.reason };
}

/**
 * Read the `loadFile` query parameter on mount and, when present, fetch + parse + persist
 * the document, calling `onLoaded` on success. Returns the observable load state and a
 * `dismiss` action for the error surface's "Go to upload". The fetch runs at most once,
 * even under React StrictMode's double-mount.
 */
export function useLoadFromUrl(onLoaded: OnRemoteDocumentLoaded): {
  state: RemoteLoadState;
  dismiss: () => void;
} {
  const [state, setState] = useState<RemoteLoadState>(computeInitialState);
  const { showToast } = useToast();

  // Keep the latest callbacks without re-running the mount effect.
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const initiatedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!initiatedRef.current) {
      initiatedRef.current = true;

      const parsed = parseLoadFileParam(window.location.search, resolveAllowedHosts());
      if ('reason' in parsed) {
        // `absent` leaves the normal upload flow alone; other reasons are a bad link.
        if (parsed.reason !== 'absent') {
          stripLoadFileParam();
          setState({ status: 'error', reason: parsed.reason });
        }
      } else {
        // Consume the param immediately so a refresh can't re-fetch an expired link.
        stripLoadFileParam();
        setState({ status: 'loading' });

        void (async () => {
          const result = await fetchRemoteDocument(parsed.url);
          if (!mountedRef.current) return;
          if ('reason' in result) {
            setState({ status: 'error', reason: result.reason });
            return;
          }

          const processed = processHtmlString(result.html, {
            name: deriveNameFromUrl(result.sourceUrl),
            originalFilename: null,
          });
          if (isEmptyDocument(processed.doc)) {
            setState({ status: 'error', reason: 'unsupported-content' });
            return;
          }

          // Persist like an upload (D6): a quota failure still opens the editor.
          const entryId = await persistInitialEntry(
            {
              name: processed.name,
              subtitle: processed.subtitle,
              tree: processed.doc,
              source: processed.source,
            },
            showToastRef.current
          );
          if (!mountedRef.current) return;

          onLoadedRef.current(
            processed.doc,
            processed.sourceUrl,
            processed.html,
            processed.name,
            entryId
          );
          // App switches to the editor view; clear our overlay state.
          setState({ status: 'idle' });
        })();
      }
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dismiss = useCallback(() => setState({ status: 'idle' }), []);
  return { state, dismiss };
}

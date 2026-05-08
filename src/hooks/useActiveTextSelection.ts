import { useCallback, useSyncExternalStore } from 'react';
import type { NodeFormat } from '../types/document';

export type ActiveSelection =
  | {
      kind: 'input';
      el: HTMLInputElement;
      text: string;
      start: number;
      end: number;
      field: 'number';
      nodeId: string;
    }
  | {
      kind: 'contenteditable';
      el: HTMLElement;
      text: string;
      start: number;
      end: number;
      nodeId: string;
      format: NodeFormat;
    }
  | null;

function readSnapshot(): ActiveSelection {
  if (typeof document === 'undefined') return null;
  const ae = document.activeElement;
  if (!ae) return null;

  if (ae instanceof HTMLInputElement) {
    if (ae.dataset.structeditField !== 'number') return null;
    const nodeId = ae.dataset.structeditNodeId;
    if (!nodeId) return null;
    const text = ae.value;
    const start = ae.selectionStart ?? text.length;
    const end = ae.selectionEnd ?? text.length;
    return { kind: 'input', el: ae, text, start, end, field: 'number', nodeId };
  }

  // `isContentEditable` and the `contentEditable` IDL property aren't implemented
  // in JSDOM, so we fall back to the attribute string. Both `"true"` and the empty
  // string (HTML5 boolean default) count as editable; `"plaintext-only"` too.
  const ceAttr = ae instanceof HTMLElement ? ae.getAttribute('contenteditable') : null;
  if (
    ae instanceof HTMLElement &&
    (ceAttr === 'true' || ceAttr === '' || ceAttr === 'plaintext-only')
  ) {
    const nodeId = ae.dataset.structeditNodeId;
    const format = ae.dataset.structeditFormat as NodeFormat | undefined;
    if (!nodeId || !format) return null;
    const text = ae.textContent ?? '';
    const sel = window.getSelection();
    let start = 0;
    let end = text.length;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Edit mode in ContentBlock writes el.textContent = raw, producing a single
      // text-node child. If the selection isn't anchored inside the active element
      // (e.g. user clicked into the toolbar), fall back to the whole-text default.
      if (ae.contains(range.startContainer) && ae.contains(range.endContainer)) {
        start = range.startOffset;
        end = range.endOffset;
        if (start > end) [start, end] = [end, start];
      }
    }
    return { kind: 'contenteditable', el: ae, text, start, end, nodeId, format };
  }

  return null;
}

let versionCounter = 0;
const listeners = new Set<() => void>();
let installed = false;
function bump() {
  versionCounter++;
  for (const l of listeners) l();
}
function ensureInstalled() {
  if (installed || typeof document === 'undefined') return;
  document.addEventListener('selectionchange', bump);
  document.addEventListener('focusin', bump);
  document.addEventListener('focusout', bump);
  installed = true;
}
const subscribe = (notify: () => void): (() => void) => {
  ensureInstalled();
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};
const getVersion = () => versionCounter;

export function useActiveTextSelection(): { get: () => ActiveSelection; version: number } {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const get = useCallback(() => readSnapshot(), []);
  return { get, version };
}

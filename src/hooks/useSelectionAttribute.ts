import { type RefObject, useLayoutEffect } from 'react';
import type { TreeUIStore } from '../stores/TreeUIStore';

/**
 * Mirrors the node's selection state into the DOM as `data-selected` on the
 * passed wrapper ref, *without* triggering React re-renders.
 *
 * Bypasses React's render path for selection (see issue #102). Selection can
 * affect thousands of nodes at once (range-select, clear-all); routing those
 * changes through React reconciliation made selection cost scale linearly with
 * the selection size. Driving the visual via a single DOM attribute toggle
 * keeps the cost ~O(1) per affected node, with the styling expressed as CSS
 * rules in `index.css` keyed off `[data-selected="true"]`.
 *
 * Do not fold this back into `useNodeState`: that would reintroduce the
 * regression because every node would re-render on every selection change.
 */
export function useSelectionAttribute(
  store: TreeUIStore,
  id: string,
  ref: RefObject<HTMLElement | null>
): void {
  useLayoutEffect(() => {
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      el.dataset.selected = store.isSelected(id) ? 'true' : 'false';
    };
    apply();
    return store.subscribe(apply);
  }, [store, id, ref]);
}

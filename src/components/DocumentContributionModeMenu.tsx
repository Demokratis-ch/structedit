import { Ban, MessageSquare, PenLine, SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ContributionMode, DocumentNode } from '../types/document';
import { type ContributionTypeFilter, MODE_TYPE_FILTERS } from './FloatingToolbar';
import { Button } from './ui/button';

const DOC_MODE_BUTTONS: ReadonlyArray<{
  mode: ContributionMode | undefined;
  Icon: typeof Ban | null;
  label: string;
  testid: string;
}> = [
  { mode: undefined, Icon: null, label: 'Default', testid: 'doc-mode-default' },
  { mode: 'NONE', Icon: Ban, label: 'None', testid: 'doc-mode-none' },
  { mode: 'REMARK', Icon: MessageSquare, label: 'Remark', testid: 'doc-mode-remark' },
  { mode: 'PROPOSAL', Icon: PenLine, label: 'Proposal', testid: 'doc-mode-proposal' },
];

interface DocumentContributionModeMenuProps {
  /** Apply (or clear, with `undefined`) a contribution mode across the whole document. */
  onApply: (mode: ContributionMode | undefined, typeFilter?: DocumentNode['type']) => void;
}

/**
 * A small dropdown in the top toolbar for bulk-setting the contribution mode across the entire
 * document, optionally restricted to one node type — the whole-document analogue of Demokratis's
 * cross-document form. Self-contained (a button + panel with outside-click/Esc close); no new deps.
 */
export function DocumentContributionModeMenu({ onApply }: DocumentContributionModeMenuProps) {
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ContributionTypeFilter>('all');
  const selectId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const apply = (mode: ContributionMode | undefined) => {
    onApply(mode, typeFilter === 'all' ? undefined : typeFilter);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        data-testid="document-contribution-mode-toggle"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="text-gray-500 hover:text-gray-900"
      >
        <SlidersHorizontal className="w-4 h-4 mr-2" />
        Contribution modes
      </Button>
      {open && (
        <div
          data-testid="document-contribution-mode-panel"
          className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
        >
          <p className="mb-2 text-xs font-medium text-gray-700">Set for the whole document</p>
          <label htmlFor={selectId} className="mb-2 flex items-center gap-2 text-xs text-gray-500">
            only:
            <select
              id={selectId}
              data-testid="doc-mode-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ContributionTypeFilter)}
              className="flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs"
            >
              {MODE_TYPE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1">
            {DOC_MODE_BUTTONS.map(({ mode, Icon, label, testid }) => (
              <button
                key={testid}
                type="button"
                data-testid={testid}
                onClick={() => apply(mode)}
                className="inline-flex items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

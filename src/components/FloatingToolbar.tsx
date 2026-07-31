import {
  ArrowDownToLine,
  ArrowUpToLine,
  Asterisk,
  Bold,
  ChevronDown,
  Heading,
  Italic,
  List,
  ListOrdered,
  Merge,
  SlidersHorizontal,
  SortAsc,
  Strikethrough,
  Subscript,
  Superscript,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ALLOWED_FORMATS,
  type ContentBearingNodeType,
  type ContributionMode,
  type NodeFormat,
} from '../types/document';
import type { ContributionScope, ContributionTypeFilter } from '../types/editor';
import type { InlineMark } from '../utils/inline-mark';
import { ALT, MOD, SHIFT } from '../utils/platform';
import { filterAllowsProposal, MODE_CHOICES, MODE_TYPE_FILTERS } from './contribution-mode-ui';

type ToolbarBlockType = 'HEADING' | 'CONTENT' | 'ul' | 'ol' | 'abc' | 'FOOTNOTE';
// Type used purely to drive the format selector — accepts every content-bearing node type
// (the toolbar buttons themselves still use ToolbarBlockType for type changes).
type SelectorNodeType = ToolbarBlockType | 'IMAGE';

export type InlineMarksTarget = 'contenteditable' | 'input-number';

interface FloatingToolbarProps {
  selectedCount: number;
  isEditing: boolean;
  selectedNodeType?: SelectorNodeType | null;
  selectedNodeFormat?: NodeFormat;
  /** Common contribution mode of the selection: a mode, `undefined` (all default), or `'mixed'`. */
  selectedNodeMode?: ContributionMode | 'mixed';
  /** Whether at least one selected node is proposable (heading/content/footnote). */
  selectionHasProposable?: boolean;
  onUpdateType: (type: ToolbarBlockType) => void;
  onChangeFormat?: (format: NodeFormat) => void;
  /** Set (or clear, with `undefined`) the contribution mode on the whole selection. */
  onChangeContributionMode?: (mode: ContributionMode | undefined) => void;
  /** Bulk scope: apply to the selected node(s) only, or also to their descendants. */
  contributionScope?: ContributionScope;
  onChangeContributionScope?: (scope: ContributionScope) => void;
  /** Bulk type filter: restrict the apply to one node type (`'all'` = every type in scope). */
  contributionTypeFilter?: ContributionTypeFilter;
  onChangeContributionTypeFilter?: (filter: ContributionTypeFilter) => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onMoveSelectedToTop?: () => void;
  onMoveSelectedToBottom?: () => void;
  canMerge?: boolean;
  onMerge?: () => void;
  inlineMarksTarget?: InlineMarksTarget | null;
  inlineMarksFormat?: NodeFormat;
  markActiveState?: Partial<Record<InlineMark, boolean>>;
  onToggleMark?: (mark: InlineMark) => void;
}

const INLINE_MARK_BUTTONS: ReadonlyArray<{
  mark: InlineMark;
  Icon: typeof Bold;
  title: string;
}> = [
  { mark: 'bold', Icon: Bold, title: `Bold (${MOD}B)` },
  { mark: 'italic', Icon: Italic, title: `Italic (${MOD}I)` },
  { mark: 'strike', Icon: Strikethrough, title: `Strikethrough (${ALT}${SHIFT}5)` },
  { mark: 'sup', Icon: Superscript, title: `Superscript (${MOD}.)` },
  { mark: 'sub', Icon: Subscript, title: `Subscript (${MOD},)` },
];

// Inline marks render visibly only for these formats. The number field is
// always allowed because NumberMarkup forces MARKDOWN_MINIMAL regardless of the
// surrounding node's format.
export const FORMATS_WITH_MARKS: readonly NodeFormat[] = [
  'MARKDOWN_MINIMAL',
  'MARKDOWN_INLINE',
  'MARKDOWN',
];

const FORMATTABLE_TYPES: ContentBearingNodeType[] = ['HEADING', 'CONTENT', 'FOOTNOTE', 'IMAGE'];

// The contribution-mode picker: how consultation participants may interact with the selected
// element(s). `undefined` is the element-type default; `PROPOSAL` is offered only when the
// selection includes a proposable node (heading/content/footnote). Icons and wording come from
// the shared presentation table so the tree pill and the document menu stay in step.
const MODE_BUTTONS = MODE_CHOICES;

/** Bare-key shortcut (in selection mode) that opens the contribution-mode dropdown. */
const MODE_SHORTCUT = 'i';
/** Digit keys selecting the four modes (in MODE_BUTTONS order) while the dropdown is open. */
const MODE_DIGITS = ['1', '2', '3', '4'] as const;

export function FloatingToolbar({
  selectedCount,
  isEditing,
  selectedNodeType,
  selectedNodeFormat,
  selectedNodeMode,
  selectionHasProposable = false,
  onUpdateType,
  onChangeFormat,
  onChangeContributionMode,
  contributionScope = 'node',
  onChangeContributionScope,
  contributionTypeFilter = 'all',
  onChangeContributionTypeFilter,
  onDelete,
  onClearSelection,
  onMoveSelectedToTop,
  onMoveSelectedToBottom,
  canMerge = false,
  onMerge,
  inlineMarksTarget,
  inlineMarksFormat,
  markActiveState,
  onToggleMark,
}: FloatingToolbarProps) {
  if (selectedCount === 0 && !isEditing) return null;

  const showInlineMarks =
    isEditing &&
    inlineMarksTarget != null &&
    (inlineMarksTarget === 'input-number' ||
      (inlineMarksFormat != null && FORMATS_WITH_MARKS.includes(inlineMarksFormat)));

  const typeButtonClass = (type: ToolbarBlockType) =>
    `p-2 rounded-lg transition-colors ${
      selectedNodeType === type ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'
    }`;

  // Show the format selector only when exactly one content-bearing node is selected
  // and we know its current format. Container-only nodes (list, list_item, document)
  // and multi-select hide the selector.
  const showFormatSelector =
    selectedCount === 1 &&
    !!selectedNodeFormat &&
    !!selectedNodeType &&
    FORMATTABLE_TYPES.includes(selectedNodeType as ContentBearingNodeType);

  return (
    <div
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white rounded-xl shadow-2xl px-2 py-2 flex items-center gap-1 z-50 animate-in slide-in-from-bottom-4 duration-300 border border-gray-700/50"
      onMouseDown={(e) => {
        // Prevent the toolbar from stealing focus from an active editor when buttons
        // are clicked, but let native form controls (the format <select>) open their
        // dropdown UI on mousedown.
        const target = e.target as HTMLElement;
        if (target.tagName !== 'SELECT' && target.tagName !== 'OPTION') {
          e.preventDefault();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {selectedCount > 0 && !isEditing && (
        <div className="px-3 text-sm font-medium text-gray-400 border-r border-gray-700 mr-1">
          {selectedCount} selected
        </div>
      )}

      <button
        onClick={() => onUpdateType('HEADING')}
        className={typeButtonClass('HEADING')}
        title="Heading (H)"
      >
        <Heading size={18} />
      </button>
      <button
        onClick={() => onUpdateType('CONTENT')}
        className={typeButtonClass('CONTENT')}
        title="Content (C)"
      >
        <Type size={18} />
      </button>
      <div className="w-px h-6 bg-gray-700 mx-1" />
      <button
        onClick={() => onUpdateType('ul')}
        className={typeButtonClass('ul')}
        title="Bullet List (U)"
      >
        <List size={18} />
      </button>
      <button
        onClick={() => onUpdateType('ol')}
        className={typeButtonClass('ol')}
        title="Ordered List (O)"
      >
        <ListOrdered size={18} />
      </button>
      <button
        onClick={() => onUpdateType('abc')}
        className={typeButtonClass('abc')}
        title="Alpha List (A)"
      >
        <SortAsc size={18} />
      </button>
      <div className="w-px h-6 bg-gray-700 mx-1" />
      <button
        onClick={() => onUpdateType('FOOTNOTE')}
        className={typeButtonClass('FOOTNOTE')}
        title="Footnote (F)"
      >
        <Asterisk size={18} />
      </button>

      {showFormatSelector && (
        <>
          <div className="w-px h-6 bg-gray-700 mx-1" />
          <select
            data-testid="format-selector"
            value={selectedNodeFormat}
            onChange={(e) => onChangeFormat?.(e.target.value as NodeFormat)}
            className="bg-gray-800 text-white text-sm rounded-md px-2 py-1.5 hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            title="Format"
          >
            {ALLOWED_FORMATS[selectedNodeType as ContentBearingNodeType].map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>
        </>
      )}

      {selectedCount > 0 && !isEditing && (
        <>
          <div className="w-px h-6 bg-gray-700 mx-1" />
          <ContributionModePopover
            selectedNodeMode={selectedNodeMode}
            selectionHasProposable={selectionHasProposable}
            onChangeContributionMode={onChangeContributionMode}
            contributionScope={contributionScope}
            onChangeContributionScope={onChangeContributionScope}
            contributionTypeFilter={contributionTypeFilter}
            onChangeContributionTypeFilter={onChangeContributionTypeFilter}
          />
        </>
      )}

      {showInlineMarks && (
        <>
          <div className="w-px h-6 bg-gray-700 mx-1" />
          <div
            data-testid="inline-marks-group"
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-md bg-gray-800/60 border border-gray-700/40"
          >
            {INLINE_MARK_BUTTONS.map(({ mark, Icon, title }) => {
              const active = markActiveState?.[mark] === true;
              return (
                <button
                  key={mark}
                  type="button"
                  data-testid={`inline-mark-${mark}`}
                  aria-pressed={active}
                  aria-label={title}
                  title={title}
                  onClick={() => onToggleMark?.(mark)}
                  className={`p-1.5 rounded transition-colors ${
                    active
                      ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="w-px h-6 bg-gray-700 mx-1" />
      <button
        type="button"
        data-testid="move-to-top"
        aria-label="Move to top of parent"
        onClick={onMoveSelectedToTop}
        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        title="Move to top of parent"
      >
        <ArrowUpToLine size={18} />
      </button>
      <button
        type="button"
        data-testid="move-to-bottom"
        aria-label="Move to bottom of parent"
        onClick={onMoveSelectedToBottom}
        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        title="Move to bottom of parent"
      >
        <ArrowDownToLine size={18} />
      </button>

      {selectedCount >= 2 && !isEditing && (
        <>
          <div className="w-px h-6 bg-gray-700 mx-1" />
          <button
            type="button"
            data-testid="merge-selected"
            aria-label="Merge selected"
            onClick={onMerge}
            disabled={!canMerge}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title={
              canMerge
                ? 'Merge selected (M)'
                : 'Merge selected — requires 2+ contiguous siblings of the same type'
            }
          >
            <Merge size={18} />
          </button>
        </>
      )}

      <div className="w-px h-6 bg-gray-700 mx-1" />
      <button
        onClick={onDelete}
        className="p-2 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
        title="Delete Selected"
      >
        <Trash2 size={18} />
      </button>

      <button
        onClick={onClearSelection}
        className="ml-2 p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
        title="Clear Selection"
      >
        <X size={16} />
      </button>
    </div>
  );
}

interface ContributionModePopoverProps {
  selectedNodeMode?: ContributionMode | 'mixed';
  selectionHasProposable: boolean;
  onChangeContributionMode?: (mode: ContributionMode | undefined) => void;
  contributionScope: ContributionScope;
  onChangeContributionScope?: (scope: ContributionScope) => void;
  contributionTypeFilter: ContributionTypeFilter;
  onChangeContributionTypeFilter?: (filter: ContributionTypeFilter) => void;
}

/**
 * The contribution-mode controls collapsed behind a single "Mode" button in the floating toolbar.
 * Opening reveals a compact panel (mode buttons + apply scope + type filter) above the toolbar; it
 * closes on outside click or Escape. Applying a mode keeps the panel open so scope/filter tweaks
 * and repeated applies stay one click apart.
 */
function ContributionModePopover({
  selectedNodeMode,
  selectionHasProposable,
  onChangeContributionMode,
  contributionScope,
  onChangeContributionScope,
  contributionTypeFilter,
  onChangeContributionTypeFilter,
}: ContributionModePopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterId = useId();

  // Keyboard: `MODE_SHORTCUT` opens the dropdown from selection mode; while open, 1–4 pick a mode
  // and Escape closes. Plus outside-click-to-close. The listener is document-wide because the
  // toolbar never holds focus — the shortcut has to fire while focus sits on the tree container.
  // This component only mounts in selection mode, so no extra "are we editing?" guard is needed.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (open && rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if (!open) {
        // Don't hijack the key while the user is typing somewhere.
        if (!inEditable && e.key.toLowerCase() === MODE_SHORTCUT) {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      const idx = MODE_DIGITS.indexOf(e.key as (typeof MODE_DIGITS)[number]);
      if (idx !== -1) {
        const { mode } = MODE_BUTTONS[idx];
        // Mirror the disabled state of the on-screen buttons.
        if (mode === 'PROPOSAL' && !selectionHasProposable) return;
        e.preventDefault();
        onChangeContributionMode?.(mode);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, selectionHasProposable, onChangeContributionMode]);

  // Summarise the selection's current mode on the trigger.
  const summary =
    selectedNodeMode === 'mixed'
      ? 'Mixed'
      : (MODE_BUTTONS.find((b) => b.mode === selectedNodeMode)?.short ?? 'Default');

  return (
    <div ref={rootRef} className="relative inline-flex items-center">
      <button
        type="button"
        data-testid="contribution-mode-toggle"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Contribution mode — how participants may interact with the selected element(s). Shortcut: I, then 1–4"
        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
          open ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
        }`}
      >
        <SlidersHorizontal size={16} />
        <span className="text-gray-400">Mode:</span>
        <span className="font-medium text-white">{summary}</span>
        <ChevronDown size={14} className="text-gray-500" />
      </button>

      {open && (
        <div
          data-testid="contribution-mode-group"
          role="dialog"
          aria-label="Contribution mode"
          className="absolute bottom-full right-0 z-50 mb-2 w-60 rounded-lg border border-gray-700 bg-gray-900 p-3 text-left shadow-2xl"
        >
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Contribution mode <span className="normal-case text-gray-600">(press 1–4)</span>
          </p>
          <div className="grid grid-cols-2 gap-1">
            {MODE_BUTTONS.map(({ mode, Icon, description, short }, i) => {
              const active = selectedNodeMode === mode;
              // PROPOSAL needs both a proposable node in the selection and a type filter that
              // doesn't exclude every proposable type — otherwise the apply is a silent no-op.
              const disabled =
                mode === 'PROPOSAL' &&
                (!selectionHasProposable || !filterAllowsProposal(contributionTypeFilter));
              return (
                <button
                  key={mode ?? 'default'}
                  type="button"
                  data-testid={`mode-${mode ? mode.toLowerCase() : 'default'}`}
                  aria-pressed={active}
                  aria-label={description}
                  aria-keyshortcuts={MODE_DIGITS[i]}
                  title={
                    disabled
                      ? 'Proposal is only available on headings, content and footnotes'
                      : `${description} (${MODE_DIGITS[i]})`
                  }
                  disabled={disabled}
                  onClick={() => onChangeContributionMode?.(mode)}
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-gray-700 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {Icon ? <Icon size={14} /> : null}
                  <span>{short}</span>
                  <kbd className="ml-auto rounded bg-black/30 px-1 text-[10px] leading-4 text-gray-300">
                    {MODE_DIGITS[i]}
                  </kbd>
                </button>
              );
            })}
          </div>

          {/* Scope: apply to the selected node(s) only, or also their descendants. */}
          <p className="mt-3 mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Apply to
          </p>
          <div className="inline-flex w-full items-center rounded-md border border-gray-700 bg-gray-800/60 p-0.5">
            {(['node', 'subtree'] as const).map((scope) => {
              const scopeLabel =
                scope === 'node'
                  ? 'Apply to the selected element(s) only'
                  : 'Also apply to everything inside (descendants)';
              return (
                <button
                  key={scope}
                  type="button"
                  data-testid={`mode-scope-${scope}`}
                  aria-pressed={contributionScope === scope}
                  aria-label={scopeLabel}
                  title={scopeLabel}
                  onClick={() => onChangeContributionScope?.(scope)}
                  className={`flex-1 rounded px-1.5 py-1 text-xs transition-colors ${
                    contributionScope === scope
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {scope === 'node' ? 'This' : '+ Inside'}
                </button>
              );
            })}
          </div>

          {/* Optional node-type filter for the apply. */}
          <label htmlFor={filterId} className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            only:
            <select
              id={filterId}
              data-testid="mode-type-filter"
              aria-label="Only apply to node type"
              title="Restrict the mode to a node type"
              value={contributionTypeFilter}
              onChange={(e) =>
                onChangeContributionTypeFilter?.(e.target.value as ContributionTypeFilter)
              }
              className="flex-1 rounded-md bg-gray-800 px-1.5 py-1 text-xs text-white hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {MODE_TYPE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

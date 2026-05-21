import {
  ArrowDownToLine,
  ArrowUpToLine,
  Asterisk,
  Bold,
  Heading,
  Italic,
  List,
  ListOrdered,
  Merge,
  SortAsc,
  Strikethrough,
  Subscript,
  Superscript,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { ALLOWED_FORMATS, type ContentBearingNodeType, type NodeFormat } from '../types/document';
import type { InlineMark } from '../utils/inline-mark';

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
  onUpdateType: (type: ToolbarBlockType) => void;
  onChangeFormat?: (format: NodeFormat) => void;
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

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? '');
const MOD = IS_MAC ? '⌘' : 'Ctrl+';
const ALT = IS_MAC ? '⌥' : 'Alt+';
const SHIFT = IS_MAC ? '⇧' : 'Shift+';

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

export function FloatingToolbar({
  selectedCount,
  isEditing,
  selectedNodeType,
  selectedNodeFormat,
  onUpdateType,
  onChangeFormat,
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

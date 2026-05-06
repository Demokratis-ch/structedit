import { Asterisk, Heading, List, ListOrdered, SortAsc, Trash2, Type, X } from 'lucide-react';
import { ALLOWED_FORMATS, type ContentBearingNodeType, type NodeFormat } from '../types/document';

type ToolbarBlockType = 'heading' | 'content' | 'ul' | 'ol' | 'abc' | 'footnote';
// Type used purely to drive the format selector — accepts every content-bearing node type
// (the toolbar buttons themselves still use ToolbarBlockType for type changes).
type SelectorNodeType = ToolbarBlockType | 'image';

interface FloatingToolbarProps {
  selectedCount: number;
  isEditing: boolean;
  selectedNodeType?: SelectorNodeType | null;
  selectedNodeFormat?: NodeFormat;
  onUpdateType: (type: ToolbarBlockType) => void;
  onChangeFormat?: (format: NodeFormat) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

const FORMATTABLE_TYPES: ContentBearingNodeType[] = ['heading', 'content', 'footnote', 'image'];

export function FloatingToolbar({
  selectedCount,
  isEditing,
  selectedNodeType,
  selectedNodeFormat,
  onUpdateType,
  onChangeFormat,
  onDelete,
  onClearSelection,
}: FloatingToolbarProps) {
  if (selectedCount === 0 && !isEditing) return null;

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
        onClick={() => onUpdateType('heading')}
        className={typeButtonClass('heading')}
        title="Heading (H)"
      >
        <Heading size={18} />
      </button>
      <button
        onClick={() => onUpdateType('content')}
        className={typeButtonClass('content')}
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
        onClick={() => onUpdateType('footnote')}
        className={typeButtonClass('footnote')}
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

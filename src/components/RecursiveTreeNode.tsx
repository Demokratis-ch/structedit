import {
  Ban,
  Circle,
  GripVertical,
  MessageSquare,
  PenLine,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { memo, useCallback, useRef, useSyncExternalStore } from 'react';
import { useNodeState } from '../hooks/useNodeState';
import { useSelectionAttribute } from '../hooks/useSelectionAttribute';
import {
  type ContributionMode,
  type DocumentNode,
  getQuestionFlavour,
  type NodeFormat,
  type QuestionFlavour,
} from '../types/document';
import { ContentBlock } from './ContentBlock';
import { NumberBadge } from './NumberBadge';
import { useTreeCallbacks, useTreeUIStore } from './TreeNodeContext';

interface RecursiveTreeNodeProps {
  node: DocumentNode;
  depth: number;
  /** The parent node's type, when known — used to suppress generic add buttons inside a question. */
  parentType?: DocumentNode['type'];
}

const AddNodeButton: React.FC<{
  position: 'top' | 'bottom';
  onClick: () => void;
}> = ({ position, onClick }) => (
  // Default-hidden via Tailwind classes (`opacity-0 pointer-events-none`);
  // revealed by the `.tree-node[data-selected='true'] > .tree-node-add-btn`
  // rule in src/index.css when the parent node is selected. Same pattern as
  // the drag handle.
  <button
    className={`tree-node-add-btn
      absolute ${position === 'top' ? '-top-3' : '-bottom-3'} left-1/2 -translate-x-1/2 z-30
      w-6 h-6 rounded-lg flex items-center justify-center
      bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600
      transition-all duration-150 cursor-pointer border border-gray-200
      opacity-0 pointer-events-none
    `}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    onMouseDown={(e) => e.preventDefault()}
    title={position === 'top' ? 'Add node above' : 'Add node below'}
  >
    <Plus size={12} />
  </button>
);

/** How each question flavour is named on the question card. */
const QUESTION_FLAVOUR_LABELS: Record<QuestionFlavour, string> = {
  single: 'Single choice',
  multiple: 'Multiple choice',
  text: 'Free text',
};

// Per-mode presentation for the always-visible contribution-mode pill. Icons mirror the Demokratis
// editor (ban / comment / pen-line); an absent mode renders no pill.
const MODE_INDICATOR: Record<ContributionMode, { Icon: typeof Ban; cls: string; label: string }> = {
  NONE: {
    Icon: Ban,
    cls: 'text-gray-500 bg-gray-100 border-gray-300',
    label: 'Locked — no participant interaction',
  },
  REMARK: {
    Icon: MessageSquare,
    cls: 'text-blue-600 bg-blue-50 border-blue-200',
    label: 'Remark — participants may annotate',
  },
  PROPOSAL: {
    Icon: PenLine,
    cls: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    label: 'Proposal — participants may annotate and propose amendments',
  },
};

/**
 * Recursive tree node component. Each node subscribes to its own UI state
 * via useSyncExternalStore (through useNodeState), so only nodes whose
 * state actually changes will re-render.
 */
export const RecursiveTreeNode = memo<RecursiveTreeNodeProps>(
  ({ node, depth, parentType }) => {
    const store = useTreeUIStore();
    const wrapperRef = useRef<HTMLDivElement>(null);
    // Selection is mirrored to the wrapper's `data-selected` imperatively
    // (no React re-render), and selection-driven visuals live in index.css.
    // See useSelectionAttribute / issue #102.
    useSelectionAttribute(store, node.id, wrapperRef);
    const {
      isEditing,
      isDragging,
      isDropTarget,
      dropPosition,
      isEditingNumber,
      isHoveredHandle,
      isReceivingParent,
      isInvalidDrop,
    } = useNodeState(store, node.id);
    // Firefox suppresses caret-positioning in a contentEditable when any
    // ancestor has draggable=true (issue #60). The same draggable ancestor also
    // hijacks mouse text-selection in the number <input> as node drag&drop
    // (issue #101). Disable draggable on every node while any node is editing
    // its content or number — drag-to-reorder is unavailable mid-edit anyway,
    // so this is a no-op behaviour-wise.
    const isAnyNodeEditing = useSyncExternalStore(
      store.subscribe,
      useCallback(
        () => store.getEditingId() !== null || store.getEditingNumberId() !== null,
        [store]
      )
    );

    const {
      language,
      blockRefs,
      onDragStart,
      onDragOver,
      onDrop,
      onDragEnd,
      onClick,
      onDoubleClick,
      onHoverHandle,
      onUpdateContent,
      onKeyDown,
      onFocus,
      onNumberDoubleClick,
      onUpdateNumber,
      onNumberSubmit,
      onAddNodeBefore,
      onAddNodeAfter,
      onAddOption,
      onRemoveOption,
    } = useTreeCallbacks();

    const isInsideQuestion = parentType === 'QUESTION';

    // Determine if node has children
    const hasChildren = 'children' in node && node.children.length > 0;

    // Get border style based on node type and depth
    const getBorderStyle = (): React.CSSProperties => {
      if (depth === 0) return {};

      // Headings get left-only border with thickness based on depth
      if (node.type === 'HEADING') {
        const leftWidth = depth === 1 ? '6px' : depth === 2 ? '4px' : depth === 3 ? '2px' : '1px';
        const importance = 5 - Math.min(depth, 4);
        return {
          borderLeftWidth: leftWidth,
          borderLeftColor: '#d1e5db',
          borderLeftStyle: 'solid',
          paddingLeft: '8px',
          marginTop: `${importance * 5}px`,
          marginBottom: `${importance * 4}px`,
        };
      }

      // Other nodes get 1px full border
      return {
        borderWidth: '1px',
        borderColor: '#d1d5db',
        borderStyle: 'solid',
        padding: '4px 8px',
        marginTop: '4px',
      };
    };

    // Get content for current language (only for nodes with contents)
    const content = 'contents' in node ? node.contents[language] || '' : '';

    // Determine visual style based on node type and depth
    const getNodeStyle = () => {
      switch (node.type) {
        case 'HEADING':
          if (depth === 0)
            return 'text-3xl font-bold mt-2 mb-1 text-gray-900 tracking-tight leading-tight';
          if (depth === 1)
            return 'text-xl font-semibold mt-1 mb-1 text-gray-800 tracking-tight leading-tight';
          return 'text-lg font-bold mt-1 text-gray-800';
        case 'LIST_ITEM':
          return 'text-base leading-7 text-gray-600';
        case 'FOOTNOTE':
          return 'text-base text-sm text-gray-600 border border-dashed border-gray-500 rounded';
        default:
          return 'text-base leading-7 text-gray-600';
      }
    };

    // Determine tag name for contentEditable
    const getTagName = () => {
      if (node.type === 'HEADING') {
        if (depth === 0) return 'h1';
        if (depth === 1) return 'h2';
        return 'h3';
      }
      return 'div';
    };

    // Render an editable number badge (shared by list items and headings).
    // When the number is null and not editing, renders a placeholder (dashed box or bullet).
    const renderNumberBadge = (
      currentNumber: string | null,
      baseClassName: string,
      placeholder: 'dashed' | 'bullet' = 'dashed'
    ) => (
      <NumberBadge
        value={currentNumber}
        nodeId={node.id}
        isEditing={isEditingNumber}
        className={baseClassName}
        placeholder={placeholder}
        onUpdateNumber={onUpdateNumber}
        onDoubleClick={onNumberDoubleClick}
        onSubmit={onNumberSubmit}
      />
    );

    // Render node content (the actual text/editable part)
    const renderContent = () => {
      // Container-only nodes (document, list) show placeholder
      if (node.type === 'DOCUMENT') {
        return null; // Document root doesn't render its own content
      }

      if (node.type === 'LIST') {
        return (
          <div className="flex items-baseline flex-1">
            {renderNumberBadge(node.number, 'font-medium text-gray-500 border-gray-300 bg-gray-50')}{' '}
            <span className="text-gray-400 select-none text-sm">(list)</span>
          </div>
        );
      }

      // list_item is a container - render just the marker, children will be nested
      if (node.type === 'LIST_ITEM') {
        return (
          <div className="flex items-baseline flex-1">
            {renderNumberBadge(
              node.number,
              'font-medium text-gray-500 border-gray-300 bg-gray-50',
              'bullet'
            )}{' '}
            <span className="text-gray-400 select-none text-sm">(list_item)</span>
          </div>
        );
      }

      // Question wrapper: a labelled card naming its flavour, plus (for choice questions) an
      // add-option button. Its prompt + options render as nested children. The flavour itself is
      // changed from the selection toolbar, not here — see MakeQuestionPopover.
      if (node.type === 'QUESTION') {
        const flavour = getQuestionFlavour(node);
        const isChoice = flavour !== 'text';
        return (
          <div className="flex items-center gap-2 flex-1" data-testid="question-node">
            <span className="select-none rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-purple-700">
              Question
            </span>
            <span data-testid="question-flavour" className="select-none text-xs text-gray-400">
              {QUESTION_FLAVOUR_LABELS[flavour]}
            </span>
            {isChoice && (
              <button
                type="button"
                data-testid="question-add-option"
                title="Add option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddOption(node.id);
                }}
                className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
        );
      }

      // A choice option: a radio/checkbox glyph, the inline-editable label, and a remove button.
      if (node.type === 'RADIOBUTTON' || node.type === 'CHECKBOX') {
        const Glyph = node.type === 'RADIOBUTTON' ? Circle : Square;
        return (
          // Centred, not baseline-aligned: an empty label has no text baseline, so the browser falls
          // back to the bottom edge of the (min-h) box and the glyph visibly drops until you type.
          <div className="flex items-center gap-2 flex-1">
            <Glyph size={14} className="shrink-0 text-gray-400" />
            <ContentBlock
              blockRefs={blockRefs}
              blockId={node.id}
              raw={content}
              format={(node as { format: NodeFormat }).format}
              disabled={!isEditing}
              tagName="div"
              onChange={(val) => onUpdateContent(node.id, val)}
              onKeyDown={(e) => onKeyDown(e, node.id)}
              onFocus={() => onFocus(node.id)}
              className={`
                flex-1 outline-none break-words relative z-10 min-h-[24px] text-base text-gray-600
                ${isEditing ? 'cursor-text' : 'cursor-default pointer-events-none'}
              `}
            />
            <button
              type="button"
              data-testid="option-remove"
              title="Remove option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveOption(node.id);
              }}
              className="p-0.5 text-gray-300 hover:text-red-500"
            >
              <Trash2 size={12} />
            </button>
          </div>
        );
      }

      // Free-text answer field: a disabled placeholder.
      if (node.type === 'TEXTAREA') {
        return (
          <div className="flex-1" data-testid="textarea-placeholder">
            <div className="select-none rounded border border-dashed border-gray-300 px-2 py-3 text-xs text-gray-400">
              Free-text answer
            </div>
          </div>
        );
      }

      // Nodes with content
      return (
        <div className="flex items-baseline flex-1">
          {/* Show number badge for headings, footnotes, and content (dashed placeholder when no number) */}
          {node.type === 'HEADING' &&
            renderNumberBadge(
              node.number,
              'font-semibold text-blue-600 border-blue-200 bg-blue-50'
            )}
          {node.type === 'FOOTNOTE' &&
            renderNumberBadge(
              node.number,
              'font-medium text-amber-600 border-amber-200 bg-amber-50'
            )}
          {node.type === 'CONTENT' &&
            renderNumberBadge(node.number, 'font-medium text-gray-600 border-gray-300 bg-gray-50')}

          {'contents' in node && (
            <ContentBlock
              blockRefs={blockRefs}
              blockId={node.id}
              raw={content}
              format={(node as { format: NodeFormat }).format}
              disabled={!isEditing}
              tagName={getTagName()}
              onChange={(val) => onUpdateContent(node.id, val)}
              onKeyDown={(e) => onKeyDown(e, node.id)}
              onFocus={() => onFocus(node.id)}
              className={`
                w-full outline-none break-words relative z-10 min-h-[28px]
                ${getNodeStyle()}
                ${isEditing ? 'cursor-text' : 'cursor-default pointer-events-none'}
              `}
            />
          )}
        </div>
      );
    };

    // Skip rendering the document root wrapper - just render children
    if (node.type === 'DOCUMENT') {
      return (
        <div className="space-y-1">
          {hasChildren &&
            node.children.map((child) => (
              <RecursiveTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                parentType={node.type}
              />
            ))}
        </div>
      );
    }

    return (
      <div
        ref={wrapperRef}
        data-editing={isEditing ? 'true' : 'false'}
        data-dragging={isDragging ? 'true' : 'false'}
        data-receiving-parent={isReceivingParent ? 'true' : 'false'}
        data-hovered-handle={isHoveredHandle ? 'true' : 'false'}
        data-contribution-mode={node.contributionMode ?? 'default'}
        draggable={!isAnyNodeEditing}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(e, node.id);
        }}
        onDragOver={(e) => {
          e.stopPropagation();
          onDragOver(e, node.id);
        }}
        onDrop={(e) => {
          e.stopPropagation();
          onDrop(e);
        }}
        onDragEnd={onDragEnd}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e, node.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick(e, node.id);
        }}
        className={`tree-node group relative
          ${node.type !== 'HEADING' ? 'rounded-md' : ''}
          ${isDragging ? 'opacity-30 bg-gray-50' : ''}
          ${isEditing ? 'bg-white shadow-sm ring-1 ring-gray-200' : 'cursor-default'}
          ${isReceivingParent ? 'ring-2 ring-green-400' : ''}
          ${isInvalidDrop ? 'cursor-not-allowed' : ''}
        `}
        style={getBorderStyle()}
      >
        {/* Drop indicator */}
        {isDropTarget && dropPosition && (
          <div
            className={`absolute left-0 right-0 h-1 z-20 rounded ${dropPosition === 'top' ? '-top-[3px]' : '-bottom-[3px]'} ${isInvalidDrop ? 'bg-red-500' : 'bg-blue-600'}`}
          />
        )}

        {/* Drag handle - only show for non-document nodes */}
        <div
          className="tree-node-drag-handle absolute top-1 left-1 flex items-center select-none z-10 opacity-0 group-hover:opacity-100"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="p-0.5 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing rounded hover:bg-gray-200 transition-colors"
            onMouseEnter={() => onHoverHandle(node.id)}
            onMouseLeave={() => onHoverHandle(null)}
          >
            <GripVertical size={14} />
          </div>
        </div>

        {/* Add node buttons — suppressed inside a question (options are managed by its own controls) */}
        {!isEditing && !isInsideQuestion && (
          <AddNodeButton position="top" onClick={() => onAddNodeBefore(node.id)} />
        )}
        {!isEditing && !isInsideQuestion && (
          <AddNodeButton position="bottom" onClick={() => onAddNodeAfter(node.id)} />
        )}

        {/* Contribution mode indicator (always visible when a mode is set) */}
        {node.contributionMode &&
          (() => {
            const { Icon, cls, label } = MODE_INDICATOR[node.contributionMode];
            return (
              <span
                data-testid="contribution-mode-indicator"
                className={`tree-node-mode-indicator absolute top-1 right-1 z-10 inline-flex items-center rounded border px-1 py-0.5 ${cls}`}
                title={label}
              >
                <Icon size={12} />
              </span>
            );
          })()}

        {/* Node type indicator (shifts left to clear the mode pill when one is shown) */}
        <span
          className={`tree-node-type-indicator absolute top-1 ${node.contributionMode ? 'right-8' : 'right-1'} text-xs text-gray-400 select-none z-10
            transition-opacity duration-150
            opacity-0 group-hover:opacity-70`}
        >
          {'format' in node ? `${node.type} · ${node.format}` : node.type}
        </span>

        {/* Content area with left padding for drag handle */}
        <div className="pl-6 pr-12">{renderContent()}</div>

        {/* Nested children */}
        {hasChildren && (
          <div
            className="pl-2 space-y-1"
            style={{
              marginTop: node.type === 'HEADING' ? `${(5 - Math.min(depth, 4)) * 6}px` : '4px',
            }}
          >
            {node.children.map((child) => (
              <RecursiveTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                parentType={node.type}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.node === next.node && prev.depth === next.depth && prev.parentType === next.parentType
);

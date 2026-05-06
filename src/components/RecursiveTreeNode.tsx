import { GripVertical, Plus } from 'lucide-react';
import type React from 'react';
import { memo, useCallback, useSyncExternalStore } from 'react';
import { useNodeState } from '../hooks/useNodeState';
import type { DocumentNode, NodeFormat } from '../types/document';
import { ContentBlock } from './ContentBlock';
import { useTreeCallbacks, useTreeUIStore } from './TreeNodeContext';

interface RecursiveTreeNodeProps {
  node: DocumentNode;
  depth: number;
}

const AddNodeButton: React.FC<{
  position: 'top' | 'bottom';
  isSelected: boolean;
  onClick: () => void;
}> = ({ position, isSelected, onClick }) => (
  <button
    className={`
      absolute ${position === 'top' ? '-top-3' : '-bottom-3'} left-1/2 -translate-x-1/2 z-30
      w-6 h-6 rounded-lg flex items-center justify-center
      bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600
      transition-all duration-150 cursor-pointer border border-gray-200
      ${isSelected ? 'opacity-60 hover:!opacity-100' : 'opacity-0 pointer-events-none'}
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

/**
 * Recursive tree node component. Each node subscribes to its own UI state
 * via useSyncExternalStore (through useNodeState), so only nodes whose
 * state actually changes will re-render.
 */
export const RecursiveTreeNode = memo<RecursiveTreeNodeProps>(
  ({ node, depth }) => {
    const store = useTreeUIStore();
    const {
      isSelected,
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
    // ancestor has draggable=true (issue #60). Disable draggable on every
    // node while any node is in edit mode — drag-to-reorder is unavailable
    // mid-edit anyway, so this is a no-op behaviour-wise.
    const isAnyNodeEditing = useSyncExternalStore(
      store.subscribe,
      useCallback(() => store.getEditingId() !== null, [store])
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
      onAddNodeBefore,
      onAddNodeAfter,
    } = useTreeCallbacks();

    // Determine if node has children
    const hasChildren = 'children' in node && node.children.length > 0;

    // Get border style based on node type and depth
    const getBorderStyle = (): React.CSSProperties => {
      if (depth === 0) return {};

      // Headings get left-only border with thickness based on depth
      if (node.type === 'heading') {
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
        case 'heading':
          if (depth === 0)
            return 'text-3xl font-bold mt-2 mb-1 text-gray-900 tracking-tight leading-tight';
          if (depth === 1)
            return 'text-xl font-semibold mt-1 mb-1 text-gray-800 tracking-tight leading-tight';
          return 'text-lg font-bold mt-1 text-gray-800';
        case 'list_item':
          return 'text-base leading-7 text-gray-600';
        case 'footnote':
          return 'text-base text-sm text-gray-600 border border-dashed border-gray-500 rounded';
        default:
          return 'text-base leading-7 text-gray-600';
      }
    };

    // Determine tag name for contentEditable
    const getTagName = () => {
      if (node.type === 'heading') {
        if (depth === 0) return 'h1';
        if (depth === 1) return 'h2';
        return 'h3';
      }
      return 'div';
    };

    // Render an editable number badge (shared by list items and headings).
    // When currentNumber is null and not editing, renders a placeholder (dashed box or bullet).
    const renderNumberBadge = (
      currentNumber: string | null,
      baseClassName: string,
      placeholder: 'dashed' | 'bullet' = 'dashed'
    ) => {
      if (isEditingNumber) {
        return (
          <input
            type="text"
            defaultValue={currentNumber || ''}
            ref={(el) => el?.focus()}
            className={`w-12 text-sm border border-blue-400 rounded px-1 py-0.5 outline-none bg-white flex-shrink-0 mr-2 mt-0.5 z-10 relative ${baseClassName}`}
            onBlur={(e) => {
              const val = e.target.value.trim();
              onUpdateNumber(node.id, val || null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onUpdateNumber(node.id, currentNumber);
              }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        );
      }

      if (currentNumber) {
        return (
          <div
            className={`w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm mt-0.5 z-10 relative border rounded px-1 cursor-pointer ${baseClassName}`}
            onDoubleClick={(e) => onNumberDoubleClick(e, node.id)}
            title="Double-click to edit number"
          >
            {currentNumber}
          </div>
        );
      }

      if (placeholder === 'bullet') {
        return (
          <div
            className="w-6 h-6 flex items-center justify-center flex-shrink-0 mr-1 select-none mt-0.5 z-10 relative cursor-pointer"
            onDoubleClick={(e) => onNumberDoubleClick(e, node.id)}
            title="Double-click to add number"
          >
            <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
          </div>
        );
      }

      return (
        <div
          className={`w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm mt-0.5 z-10 relative border border-dashed rounded px-1 cursor-pointer ${baseClassName}`}
          onDoubleClick={(e) => onNumberDoubleClick(e, node.id)}
          title="Double-click to add number"
        >
          {'\u200B'}
        </div>
      );
    };

    // Render node content (the actual text/editable part)
    const renderContent = () => {
      // Container-only nodes (document, list) show placeholder
      if (node.type === 'document') {
        return null; // Document root doesn't render its own content
      }

      if (node.type === 'list') {
        return (
          <div className="flex items-baseline flex-1">
            {renderNumberBadge(node.number, 'font-medium text-gray-500 border-gray-300 bg-gray-50')}{' '}
            <span className="text-gray-400 select-none text-sm">(list)</span>
          </div>
        );
      }

      // list_item is a container - render just the marker, children will be nested
      if (node.type === 'list_item') {
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

      // Nodes with content
      return (
        <div className="flex items-baseline flex-1">
          {/* Show number badge for headings, footnotes, and content (dashed placeholder when no number) */}
          {node.type === 'heading' &&
            renderNumberBadge(
              node.number,
              'font-semibold text-blue-600 border-blue-200 bg-blue-50'
            )}
          {node.type === 'footnote' &&
            renderNumberBadge(
              node.number,
              'font-medium text-amber-600 border-amber-200 bg-amber-50'
            )}
          {node.type === 'content' &&
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
    if (node.type === 'document') {
      return (
        <div className="space-y-1">
          {hasChildren &&
            node.children.map((child) => (
              <RecursiveTreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
        </div>
      );
    }

    return (
      <div
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
        className={`
          group relative
          ${node.type !== 'heading' ? 'rounded-md' : ''}
          ${isDragging ? 'opacity-30 bg-gray-50' : ''}
          ${isSelected && !isEditing ? 'bg-blue-50 ring-1 ring-blue-100' : ''}
          ${!isSelected && !isEditing && !isReceivingParent ? 'hover:bg-gray-50/50' : ''}
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
          className={`absolute top-1 left-1 flex items-center select-none z-10 ${isSelected || isHoveredHandle ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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

        {/* Add node buttons */}
        {!isEditing && (
          <AddNodeButton
            position="top"
            isSelected={isSelected}
            onClick={() => onAddNodeBefore(node.id)}
          />
        )}
        {!isEditing && (
          <AddNodeButton
            position="bottom"
            isSelected={isSelected}
            onClick={() => onAddNodeAfter(node.id)}
          />
        )}

        {/* Node type indicator */}
        <span
          className={`
            absolute top-1 right-1 text-xs text-gray-400 select-none z-10
            transition-opacity duration-150
            ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}
          `}
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
              marginTop: node.type === 'heading' ? `${(5 - Math.min(depth, 4)) * 6}px` : '4px',
            }}
          >
            {node.children.map((child) => (
              <RecursiveTreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => prev.node === next.node && prev.depth === next.depth
);

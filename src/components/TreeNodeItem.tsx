import { GripVertical } from 'lucide-react';
import type React from 'react';
import type { Language } from '../types/document';
import type { FlattenedNode } from '../types/editor';
import { ContentBlock } from './ContentBlock';

interface TreeNodeItemProps {
  flatNode: FlattenedNode;
  isSelected: boolean;
  isEditing: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: 'top' | 'bottom' | null;
  hoveredHandleId: string | null;
  language: Language;
  blockRefs: React.MutableRefObject<{ [key: string]: HTMLElement | null }>;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: (e: React.MouseEvent, id: string) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
  onHoverHandle: (id: string | null) => void;
  onUpdateContent: (id: string, content: string) => void;
  onKeyDown: (e: React.KeyboardEvent, id: string) => void;
  onFocus: (id: string) => void;
}

export const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  flatNode,
  isSelected,
  isEditing,
  isDragging,
  isDropTarget,
  dropPosition,
  hoveredHandleId,
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
}) => {
  const { node, depth } = flatNode;
  const indentPixels = depth * 24;

  // Determine if node is a leaf (no children)
  const isLeaf = !('children' in node) || node.children.length === 0;

  // Get border style based on depth
  const getBorderStyle = (): { borderWidth: string } | undefined => {
    if (depth === 0) return undefined; // No border for root
    if (isLeaf || depth >= 4) return { borderWidth: '1px' };
    if (depth === 1) return { borderWidth: '6px' };
    if (depth === 2) return { borderWidth: '4px' };
    if (depth === 3) return { borderWidth: '2px' };
    return { borderWidth: '1px' };
  };

  // Get content for current language (only for leaf nodes and headings)
  const content = 'contents' in node ? node.contents[language] || '' : '';

  // Determine visual style based on node type and depth
  const getNodeStyle = () => {
    switch (node.type) {
      case 'heading':
        // Heading level based on nesting depth
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

  // Render list item marker
  const renderListMarker = () => {
    if (node.type !== 'list_item') return null;

    if (node.number) {
      // Numbered or lettered item
      return (
        <div className="w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm font-medium text-gray-500 mt-0.5 z-10 relative">
          {node.number}
        </div>
      );
    }

    // Bullet point
    return (
      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 mr-1 select-none mt-0.5 z-10 relative">
        <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
      </div>
    );
  };

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, node.id)}
      onDragOver={(e) => onDragOver(e, node.id)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={(e) => onClick(e, node.id)}
      onDoubleClick={(e) => onDoubleClick(e, node.id)}
      className={`
        group relative rounded-md transition-colors duration-100
        ${isDragging ? 'opacity-30 bg-gray-50' : ''}
        ${isSelected && !isEditing ? 'bg-blue-50 ring-1 ring-blue-100' : ''}
        ${!isSelected && !isEditing ? 'hover:bg-gray-50' : ''}
        ${isEditing ? 'bg-white shadow-sm ring-1 ring-gray-200' : 'cursor-default'}
        ${depth > 0 ? 'border border-gray-300' : ''}
      `}
      style={{ minHeight: '36px', ...getBorderStyle() }}
    >
      {/* Drop indicator */}
      {isDropTarget && dropPosition && (
        <div
          className={`absolute left-0 right-0 h-0.5 bg-blue-600 z-20 shadow-sm ${dropPosition === 'top' ? '-top-[1px]' : '-bottom-[1px]'}`}
        />
      )}

      {/* Node type indicator - visible on hover or selection */}
      <span
        className={`
          absolute top-1.5 text-xs text-gray-400 select-none z-10
          transition-opacity duration-150
          ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}
        `}
        style={{ left: `${indentPixels - 90}px`, width: '50px', textAlign: 'right' }}
      >
        {node.type}
      </span>

      {/* Drag handle */}
      <div
        className={`absolute top-1.5 flex items-center justify-end pr-1 select-none z-10 ${isSelected || hoveredHandleId === node.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{
          left: `${indentPixels}px`,
          width: '30px',
          transform: 'translateX(-100%)',
          paddingRight: '8px',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="p-1 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing rounded hover:bg-gray-200 transition-colors"
          onMouseEnter={() => onHoverHandle(node.id)}
          onMouseLeave={() => onHoverHandle(null)}
        >
          <GripVertical size={16} />
        </div>
      </div>

      {/* Content */}
      <div
        className="flex items-baseline flex-1 pr-4 py-1"
        style={{ paddingLeft: `${indentPixels}px` }}
      >
        {renderListMarker()}

        {/* Show number label for headings with numbers */}
        {node.type === 'heading' && node.number && (
          <div className="w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm font-semibold text-blue-600 mt-0.5 z-10 relative">
            {node.number}
          </div>
        )}

        {node.type === 'list' ? (
          <span className="text-gray-400 select-none">(list)</span>
        ) : node.type === 'list_item' ? (
          <span className="text-gray-400 select-none">(list_item)</span>
        ) : (
          <ContentBlock
            blockRefs={blockRefs}
            blockId={node.id}
            html={content}
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
    </div>
  );
};

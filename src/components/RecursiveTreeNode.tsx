import { GripVertical } from 'lucide-react';
import type React from 'react';
import type { DocumentNode, Language } from '../types/document';
import { ContentBlock } from './ContentBlock';

interface RecursiveTreeNodeProps {
  node: DocumentNode;
  depth: number;
  isSelected: boolean;
  isEditing: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: 'top' | 'bottom' | null;
  hoveredHandleId: string | null;
  language: Language;
  selectedIds: Set<string>;
  editingId: string | null;
  draggedNodeId: string | null;
  dropTarget: { id: string; position: 'top' | 'bottom' } | null;
  receivingParentId: string | null;
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

export const RecursiveTreeNode: React.FC<RecursiveTreeNodeProps> = ({
  node,
  depth,
  isSelected,
  isEditing,
  isDragging,
  isDropTarget,
  dropPosition,
  hoveredHandleId,
  language,
  selectedIds,
  editingId,
  draggedNodeId,
  dropTarget,
  receivingParentId,
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
  // Determine if node has children
  const hasChildren = 'children' in node && node.children.length > 0;

  // Determine if this node is the receiving parent for a drag operation
  const isReceivingParent = receivingParentId === node.id;

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

  // Render list item marker
  const renderListMarker = () => {
    if (node.type !== 'list_item') return null;

    if (node.number) {
      return (
        <div className="w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm font-medium text-gray-500 mt-0.5 z-10 relative">
          {node.number}
        </div>
      );
    }

    return (
      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 mr-1 select-none mt-0.5 z-10 relative">
        <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
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
      return <span className="text-gray-400 select-none text-sm">(list)</span>;
    }

    // list_item is a container - render just the marker, children will be nested
    if (node.type === 'list_item') {
      return (
        <div className="flex items-baseline flex-1">
          {renderListMarker()}{' '}
          <span className="text-gray-400 select-none text-sm">(list_item)</span>
        </div>
      );
    }

    // Nodes with content
    return (
      <div className="flex items-baseline flex-1">
        {/* Show number label for headings with numbers */}
        {node.type === 'heading' && node.number && (
          <div className="w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm font-semibold text-blue-600 mt-0.5 z-10 relative">
            {node.number}
          </div>
        )}

        {'contents' in node && (
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
    );
  };

  // Skip rendering the document root wrapper - just render children
  if (node.type === 'document') {
    return (
      <div className="space-y-1">
        {hasChildren &&
          node.children.map((child) => (
            <RecursiveTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isSelected={selectedIds.has(child.id)}
              isEditing={editingId === child.id}
              isDragging={draggedNodeId === child.id}
              isDropTarget={dropTarget?.id === child.id}
              dropPosition={dropTarget?.id === child.id ? dropTarget.position : null}
              hoveredHandleId={hoveredHandleId}
              language={language}
              selectedIds={selectedIds}
              editingId={editingId}
              draggedNodeId={draggedNodeId}
              dropTarget={dropTarget}
              receivingParentId={receivingParentId}
              blockRefs={blockRefs}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              onHoverHandle={onHoverHandle}
              onUpdateContent={onUpdateContent}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      draggable={!isEditing}
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
        group relative transition-colors duration-100
        ${node.type !== 'heading' ? 'rounded-md' : ''}
        ${isDragging ? 'opacity-30 bg-gray-50' : ''}
        ${isSelected && !isEditing ? 'bg-blue-50 ring-1 ring-blue-100' : ''}
        ${!isSelected && !isEditing && !isReceivingParent ? 'hover:bg-gray-50/50' : ''}
        ${isEditing ? 'bg-white shadow-sm ring-1 ring-gray-200' : 'cursor-default'}
        ${isReceivingParent ? 'ring-2 ring-green-400' : ''}
      `}
      style={getBorderStyle()}
    >
      {/* Drop indicator */}
      {isDropTarget && dropPosition && (
        <div
          className={`absolute left-0 right-0 h-1 bg-blue-600 z-20 rounded ${dropPosition === 'top' ? '-top-[3px]' : '-bottom-[3px]'}`}
        />
      )}

      {/* Drag handle - only show for non-document nodes */}
      <div
        className={`absolute top-1 left-1 flex items-center select-none z-10 ${isSelected || hoveredHandleId === node.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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

      {/* Node type indicator */}
      <span
        className={`
          absolute top-1 right-1 text-xs text-gray-400 select-none z-10
          transition-opacity duration-150
          ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}
        `}
      >
        {node.type}
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
            <RecursiveTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isSelected={selectedIds.has(child.id)}
              isEditing={editingId === child.id}
              isDragging={draggedNodeId === child.id}
              isDropTarget={dropTarget?.id === child.id}
              dropPosition={dropTarget?.id === child.id ? dropTarget.position : null}
              hoveredHandleId={hoveredHandleId}
              language={language}
              selectedIds={selectedIds}
              editingId={editingId}
              draggedNodeId={draggedNodeId}
              dropTarget={dropTarget}
              receivingParentId={receivingParentId}
              blockRefs={blockRefs}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              onHoverHandle={onHoverHandle}
              onUpdateContent={onUpdateContent}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
            />
          ))}
        </div>
      )}
    </div>
  );
};

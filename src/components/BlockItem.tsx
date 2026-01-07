import React from 'react';
import { GripVertical } from 'lucide-react';
import { ContentBlock } from './ContentBlock';
import { Block } from '../types';

interface EnrichedBlock extends Block {
  level: number;
  lines: { depth: number; type: 'vertical' | 'corner' | 'branch' }[];
}

interface BlockItemProps {
  block: EnrichedBlock;
  isSelected: boolean;
  isEditing: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: 'top' | 'bottom' | null;
  listLabel: string;
  hoveredHandleId: string | null;
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

export function BlockItem({
  block,
  isSelected,
  isEditing,
  isDragging,
  isDropTarget,
  dropPosition,
  listLabel,
  hoveredHandleId,
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
  onFocus
}: BlockItemProps) {
  const indentPixels = block.level * 24;

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, block.id)}
      onDragOver={(e) => onDragOver(e, block.id)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={(e) => onClick(e, block.id)}
      onDoubleClick={(e) => onDoubleClick(e, block.id)}
      className={`
        group relative rounded-md transition-colors duration-100
        ${isDragging ? 'opacity-30 bg-gray-50' : ''}
        ${isSelected && !isEditing ? 'bg-blue-50 ring-1 ring-blue-100' : ''}
        ${!isSelected && !isEditing ? 'hover:bg-gray-50' : ''}
        ${isEditing ? 'bg-white shadow-sm ring-1 ring-gray-200' : 'cursor-default'}
      `}
      style={{ minHeight: '36px' }}
    >
      {/* Connector lines */}
      {block.lines.map(line => (
        <div
          key={line.depth}
          className="absolute pointer-events-none border-gray-300"
          style={{ left: `${line.depth * 24}px`, top: 0, bottom: 0, width: '24px' }}
        >
          {(line.type === 'vertical' || line.type === 'branch') && (
            <div className="absolute top-0 bottom-0 left-1/2 border-l border-gray-300" />
          )}
          {line.type === 'corner' && (
            <div className="absolute top-0 h-[18px] left-1/2 border-l border-gray-300" />
          )}
          {(line.type === 'branch' || line.type === 'corner') && (
            <div className="absolute top-[18px] left-1/2 right-0 border-t border-gray-300" />
          )}
        </div>
      ))}

      {/* Drop indicator */}
      {isDropTarget && dropPosition && (
        <div className={`absolute left-0 right-0 h-0.5 bg-blue-600 z-20 shadow-sm ${dropPosition === 'top' ? '-top-[1px]' : '-bottom-[1px]'}`} />
      )}

      {/* Drag handle */}
      <div
        className={`absolute top-1.5 flex items-center justify-end pr-1 select-none z-10 ${isSelected || hoveredHandleId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ left: `${indentPixels}px`, width: '30px', transform: 'translateX(-100%)', paddingRight: '8px' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="p-1 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing rounded hover:bg-gray-200 transition-colors"
          onMouseEnter={() => onHoverHandle(block.id)}
          onMouseLeave={() => onHoverHandle(null)}
        >
          <GripVertical size={16} />
        </div>
      </div>

      {/* Content */}
      <div className="flex items-baseline flex-1 pr-4 py-1" style={{ paddingLeft: `${indentPixels}px` }}>
        {(block.type === 'ul') && (
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 mr-1 select-none mt-0.5 z-10 relative">
            <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
          </div>
        )}
        {(block.type === 'ol') && (
           <div className="w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm font-medium text-gray-500 mt-0.5 z-10 relative">
             {listLabel}
           </div>
        )}
        {(block.type === 'abc') && (
           <div className="w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm font-medium text-gray-500 mt-0.5 z-10 relative">
             <span className="text-sm font-medium">{String.fromCharCode(97 + (parseInt(listLabel) - 1))}.</span>
           </div>
        )}
        {(block.type === 'h3') && (
          <div className="w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-xs font-bold text-blue-600 mt-1 z-10 relative">
            Art.
          </div>
        )}
        <ContentBlock
          blockRefs={blockRefs}
          blockId={block.id}
          html={block.content}
          disabled={!isEditing}
          tagName={['h1', 'h2', 'h3'].includes(block.type) ? block.type : 'div'}
          onChange={(val) => onUpdateContent(block.id, val)}
          onKeyDown={(e) => onKeyDown(e, block.id)}
          onFocus={() => onFocus(block.id)}
          className={`
            w-full outline-none break-words relative z-10 min-h-[28px]
            ${block.type === 'h1' ? 'text-3xl font-bold mt-2 mb-1 text-gray-900 tracking-tight leading-tight' : ''}
            ${block.type === 'h2' ? 'text-xl font-semibold mt-1 mb-1 text-gray-800 tracking-tight leading-tight' : ''}
            ${block.type === 'h3' ? 'text-lg font-bold mt-1 text-gray-800' : ''}
            ${['p', 'ul', 'ol', 'abc'].includes(block.type) ? 'text-base leading-7 text-gray-600' : ''}
            ${block.type === 'table' ? 'hidden' : ''} 
            ${isEditing ? 'cursor-text' : 'cursor-default pointer-events-none'}
          `}
        />
        {block.type === 'table' && block.tableData && (
          <div className="w-full overflow-x-auto my-4 border border-gray-200 rounded-lg">
            <table className="w-full text-sm text-left text-gray-600">
              <tbody>
                {block.tableData.map((row, rIndex) => (
                  <tr key={rIndex} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${rIndex === 0 ? 'bg-gray-50/50' : ''}`}>
                    {row.map((cell, cIndex) => (
                      <td 
                        key={cIndex} 
                        className={`px-4 py-2 border-r border-gray-100 last:border-0 align-top ${rIndex === 0 ? 'font-semibold text-gray-900' : ''}`} 
                        dangerouslySetInnerHTML={{ __html: cell }} 
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

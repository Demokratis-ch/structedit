import React from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Type,
  List,
  ListOrdered,
  SortAsc,
  Trash2,
  X
} from 'lucide-react';
import { BlockType } from '../types';

interface FloatingToolbarProps {
  selectedCount: number;
  isEditing: boolean;
  onFormat: (format: 'bold' | 'italic') => void;
  onUpdateType: (type: BlockType) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function FloatingToolbar({
  selectedCount,
  isEditing,
  onFormat,
  onUpdateType,
  onDelete,
  onClearSelection
}: FloatingToolbarProps) {
  if (selectedCount === 0 && !isEditing) return null;

  return (
    <div
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white rounded-xl shadow-2xl px-2 py-2 flex items-center gap-1 z-50 animate-in slide-in-from-bottom-4 duration-300 border border-gray-700/50"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      {selectedCount > 0 && !isEditing && (
        <div className="px-3 text-sm font-medium text-gray-400 border-r border-gray-700 mr-1">
          {selectedCount} selected
        </div>
      )}

      <button onClick={() => onFormat('bold')} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Bold (Ctrl+B)">
        <Bold size={18} />
      </button>
      <button onClick={() => onFormat('italic')} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Italic (Ctrl+I)">
        <Italic size={18} />
      </button>
      <div className="w-px h-6 bg-gray-700 mx-1" />

      <button onClick={() => onUpdateType('h1')} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Heading 1 (1)">
        <Heading1 size={18} />
      </button>
      <button onClick={() => onUpdateType('h2')} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Heading 2 (2)">
        <Heading2 size={18} />
      </button>
      <button onClick={() => onUpdateType('p')} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Paragraph (3)">
        <Type size={18} />
      </button>
      <div className="w-px h-6 bg-gray-700 mx-1" />
      <button onClick={() => onUpdateType('ul')} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Bullet List (4)">
        <List size={18} />
      </button>
      <button onClick={() => onUpdateType('ol')} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Ordered List (5)">
        <ListOrdered size={18} />
      </button>
      <button onClick={() => onUpdateType('abc')} className="p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Alpha List (6)">
        <SortAsc size={18} />
      </button>

      <div className="w-px h-6 bg-gray-700 mx-1" />
      <button onClick={onDelete} className="p-2 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors" title="Delete Selected">
        <Trash2 size={18} />
      </button>

      <button onClick={onClearSelection} className="ml-2 p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors">
        <X size={16} />
      </button>
    </div>
  );
}

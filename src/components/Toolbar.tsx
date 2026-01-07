import React from 'react';
import { X, Undo, Redo, Download } from 'lucide-react';
import { Button } from './ui/button';

interface ToolbarProps {
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  historyIndex: number;
  historyLength: number;
  onDownload: (format: 'xml' | 'html' | 'json') => void;
}

export function Toolbar({
  onBack,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  historyIndex,
  historyLength,
  onDownload
}: ToolbarProps) {
  return (
    <div className="h-16 border-b border-gray-200 bg-white px-6 flex items-center justify-between shrink-0 z-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="text-gray-500 hover:text-gray-900">
          <X className="w-4 h-4 mr-2" />
          Close Editor
        </Button>
        <div className="h-6 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo}>
            <Undo className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo}>
            <Redo className="w-4 h-4" />
          </Button>
          <span className="text-xs text-gray-400 ml-2">
            {historyIndex + 1} / {historyLength}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => onDownload('json')}>
          <Download className="w-4 h-4 mr-2" />
          JSON
        </Button>
        <Button variant="outline" onClick={() => onDownload('xml')}>
          <Download className="w-4 h-4 mr-2" />
          XML
        </Button>
        <Button variant="outline" onClick={() => onDownload('html')}>
          <Download className="w-4 h-4 mr-2" />
          HTML
        </Button>
      </div>
    </div>
  );
}

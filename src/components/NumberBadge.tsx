import type React from 'react';
import { NumberMarkup } from './NumberMarkup';

interface NumberBadgeProps {
  /** The raw number source (markdown), or null when the node has no number. */
  value: string | null;
  /** Node id, forwarded to the edit/double-click callbacks and the inline-mark attributes. */
  nodeId: string;
  /** When true the badge becomes a focused text input editing the raw source. */
  isEditing: boolean;
  /** Per-type colour/typography classes applied to the input and the numbered box. */
  className?: string;
  /** What to show when there is no number: a dashed box (default) or a list bullet. */
  placeholder?: 'dashed' | 'bullet';
  onUpdateNumber: (nodeId: string, value: string | null) => void;
  onDoubleClick: (e: React.MouseEvent, nodeId: string) => void;
}

/**
 * The editable number badge used in the document tree. Renders one of three states:
 * a text input while editing, a bordered box around the rendered number, or a
 * placeholder (dashed box or bullet) when the node has no number yet.
 *
 * The display-only counterpart used by the preview pane is {@link NumberBadgeDisplay}.
 */
export function NumberBadge({
  value,
  nodeId,
  isEditing,
  className = '',
  placeholder = 'dashed',
  onUpdateNumber,
  onDoubleClick,
}: NumberBadgeProps) {
  if (isEditing) {
    return (
      <input
        type="text"
        defaultValue={value || ''}
        ref={(el) => el?.focus()}
        data-structedit-field="number"
        data-structedit-node-id={nodeId}
        className={`w-12 text-sm border border-blue-400 rounded px-1 py-0.5 outline-none bg-white flex-shrink-0 mr-2 mt-0.5 z-10 relative ${className}`}
        onBlur={(e) => {
          const val = e.target.value.trim();
          onUpdateNumber(nodeId, val || null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onUpdateNumber(nodeId, value);
          }
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (value) {
    return (
      <div
        className={`w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm mt-0.5 z-10 relative border rounded px-1 cursor-pointer ${className}`}
        onDoubleClick={(e) => onDoubleClick(e, nodeId)}
        title="Double-click to edit number"
      >
        <NumberMarkup value={value} />
      </div>
    );
  }

  if (placeholder === 'bullet') {
    return (
      <div
        className="w-6 h-6 flex items-center justify-center flex-shrink-0 mr-1 select-none mt-0.5 z-10 relative cursor-pointer"
        onDoubleClick={(e) => onDoubleClick(e, nodeId)}
        title="Double-click to add number"
      >
        <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
      </div>
    );
  }

  return (
    <div
      className={`w-auto min-w-[1.5rem] h-6 flex items-center justify-end flex-shrink-0 mr-2 select-none text-sm mt-0.5 z-10 relative border border-dashed rounded px-1 cursor-pointer ${className}`}
      onDoubleClick={(e) => onDoubleClick(e, nodeId)}
      title="Double-click to add number"
    >
      {'\u200B'}
    </div>
  );
}

/**
 * The display-only number marker used in the preview pane: the rendered number
 * (via {@link NumberMarkup}) when present, an optional list bullet otherwise.
 */
interface NumberBadgeDisplayProps {
  /** The raw number source (markdown), or null when the node has no number. */
  value: string | null;
  /** Typography classes applied to the rendered number. */
  className?: string;
  /** When true, render a list bullet in place of an absent number. */
  bullet?: boolean;
}

export function NumberBadgeDisplay({ value, className, bullet = false }: NumberBadgeDisplayProps) {
  if (value) return <NumberMarkup value={value} className={className} />;
  if (bullet) return <span className="mr-2">•</span>;
  return null;
}

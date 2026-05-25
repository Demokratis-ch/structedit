import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OutlineEntry } from '../utils/outline-utils';
import { DragHandle } from './DragHandle';
import { NumberMarkup } from './NumberMarkup';

export function PreviewToc({
  entries,
  onEntryClick,
  tocWidth,
  handleProps,
  isDragging,
  onWidthRestore,
}: {
  entries: OutlineEntry[];
  onEntryClick: (nodeId: string) => void;
  tocWidth: number;
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    role: 'separator';
    'aria-orientation': 'vertical';
  };
  isDragging: boolean;
  onWidthRestore: (size: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const lastExpandedWidth = useRef(tocWidth);
  const tree = useMemo(() => buildTocTree(entries), [entries]);

  // Track the latest expanded width for restore on expand
  useEffect(() => {
    if (!collapsed) {
      lastExpandedWidth.current = tocWidth;
    }
  }, [collapsed, tocWidth]);

  const handleCollapse = () => setCollapsed(true);
  const handleExpand = () => {
    onWidthRestore(lastExpandedWidth.current);
    setCollapsed(false);
  };

  return (
    <>
      <nav
        aria-label="Inhaltsverzeichnis"
        style={collapsed ? undefined : { width: tocWidth, flexShrink: 0 }}
        className={`${collapsed ? 'w-10 p-2' : 'p-4'} shrink-0 sticky top-0 self-start overflow-y-auto max-h-full text-sm text-gray-500`}
      >
        {collapsed ? (
          <button
            type="button"
            aria-label="Expand table of contents"
            title="Expand table of contents"
            className="p-1 rounded hover:bg-gray-200 cursor-pointer"
            onClick={handleExpand}
          >
            ▶
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-700">Inhaltsverzeichnis</h3>
              <button
                type="button"
                aria-label="Collapse table of contents"
                title="Collapse table of contents"
                className="p-1 rounded hover:bg-gray-200 cursor-pointer"
                onClick={handleCollapse}
              >
                ◀
              </button>
            </div>
            <TocList nodes={tree} onEntryClick={onEntryClick} />
          </>
        )}
      </nav>
      {!collapsed && <DragHandle handleProps={handleProps} isDragging={isDragging} />}
    </>
  );
}

interface TocTreeNode {
  entry: OutlineEntry;
  children: TocTreeNode[];
}

export function buildTocTree(entries: OutlineEntry[]): TocTreeNode[] {
  const root: TocTreeNode[] = [];
  const stack: { node: TocTreeNode; depth: number }[] = [];

  for (const entry of entries) {
    const treeNode: TocTreeNode = { entry, children: [] };

    // Pop stack until we find a parent at a shallower depth
    while (stack.length > 0 && stack[stack.length - 1].depth >= entry.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(treeNode);
    } else {
      stack[stack.length - 1].node.children.push(treeNode);
    }

    stack.push({ node: treeNode, depth: entry.depth });
  }

  return root;
}

function TocList({
  nodes,
  onEntryClick,
}: {
  nodes: TocTreeNode[];
  onEntryClick: (nodeId: string) => void;
}) {
  return (
    <ul className="py-1">
      {nodes.map((node) => (
        <TocListItem key={node.entry.id} node={node} onEntryClick={onEntryClick} />
      ))}
    </ul>
  );
}

function TocListItem({
  node,
  onEntryClick,
}: {
  key?: string;
  node: TocTreeNode;
  onEntryClick: (nodeId: string) => void;
}) {
  const { entry, children } = node;
  return (
    <li>
      <button
        type="button"
        className="block w-full text-left py-1 -my-1 px-2 rounded text-nowrap text-ellipsis overflow-hidden hover:bg-gray-200 cursor-pointer"
        onClick={() => onEntryClick(entry.id)}
      >
        {entry.number && <NumberMarkup value={entry.number} className="font-bold mr-1" />}
        {entry.text}
      </button>
      {children.length > 0 && (
        <ul className="ml-4">
          {children.map((child) => (
            <TocListItem key={child.entry.id} node={child} onEntryClick={onEntryClick} />
          ))}
        </ul>
      )}
    </li>
  );
}

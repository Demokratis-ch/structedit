export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'abc' | 'blockquote' | 'code' | 'table';

export interface Block {
  id: string;
  content: string;
  type: BlockType;
  depth: number;
  tableData?: string[][]; // 2D array for table content
}

export interface TreeNode {
  id: string;
  content: string;
  type: BlockType;
  children?: TreeNode[];
}

/**
 * Docling API response types
 */
export interface DoclingConvertResponse {
  document: {
    md_content?: string;
    html_content?: string;
    export_status?: string;
  }[];
}

/**
 * Validation helpers
 */
export const isValidBlockType = (type: string): type is BlockType => {
  return ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'abc', 'blockquote', 'code', 'table'].includes(type);
};

export const isValidBlock = (obj: unknown): obj is Block => {
  if (typeof obj !== 'object' || obj === null) return false;
  const block = obj as Record<string, unknown>;
  return (
    typeof block.id === 'string' &&
    typeof block.content === 'string' &&
    typeof block.type === 'string' &&
    isValidBlockType(block.type) &&
    typeof block.depth === 'number' &&
    block.depth >= 0 &&
    block.depth <= 5
  );
};

export const sanitizeBlock = (block: Partial<Block>): Block => {
  return {
    id: block.id || Math.random().toString(36).substring(2, 9),
    content: typeof block.content === 'string' ? block.content : '',
    type: block.type && isValidBlockType(block.type) ? block.type : 'p',
    depth: typeof block.depth === 'number' ? Math.max(0, Math.min(5, block.depth)) : 0
  };
};

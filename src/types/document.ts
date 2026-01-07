export type DocumentNodeType =
  | 'document'  // Tree root
  | 'heading'
  | 'paragraph'
  | 'ordered_list'
  | 'unordered_list'
  | 'list_item'  // Can be child of ordered_list or unordered_list
  | 'footnote_reference'  // Reference to a footnote within the text
  | 'footnote'  // Footnote content; should be a child of 'footnote_reference'
  | 'image';

export interface DocumentNode {
  id: string;
  // Label of the node, e.g. '1.2' or '1bis' or 'a)' etc. Usually applies to headings, list items, or footnotes.
  label: string | null;
  type: DocumentNodeType;
  content: string | null;  // Null for 'container' nodes like 'document', 'ordered_list', 'unordered_list'
  children: DocumentNode[];
}

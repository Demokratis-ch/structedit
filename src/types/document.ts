/**
 * Container nodes have child nodes but no content (text) of their own.
 */
export type ContainerDocumentNodeType =
  | 'document'  // Tree root
  | 'list'
  | 'footnote';  // Container for footnote content

export interface ContainerDocumentNode {
  // Arbitrary but unique identifier for the node.
  id: string;
  // Label of the node, e.g. '1.2' or '1bis' or 'a)' etc. Usually applies to headings, list items, or footnotes.
  number: string | null;
  type: ContainerDocumentNodeType;
  children: DocumentNode[];
}


/**
 * Leaf nodes must contain content (text) but cannot have child nodes.
 */

export type LeafDocumentNodeType =
  | 'heading'
  | 'content'  // Paragraph or general text content
  | 'list_item'  // Can be child of ordered_list or unordered_list
  | 'image';

export interface NodeContentItem {
  language: 'en' | 'de' | 'fr' | 'it' | 'rm';
  text: string;
}

export interface LeafDocumentNode {
  // Arbitrary but unique identifier for the node.
  id: string;
  // Label of the node, e.g. '1.2' or '1bis' or 'a)' etc. Usually applies to headings, list items, or footnotes.
  number: string | null;
  type: LeafDocumentNodeType;
  content: NodeContentItem[];
}

export type DocumentNode = ContainerDocumentNode | LeafDocumentNode;


/*
const exampleDocument: DocumentNode = {
  id: '001',
  number: null,
  type: 'document',
  children: [
    {
      id: '002',
      number: '1',
      type: 'heading',
      content: [
        {
          language: 'en',
          text: 'Introduction'
        }
      ]
    },
    {
      id: '003',
      number: null,
      type: 'content',
      content: [
        {
          language: 'en',
          text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
        }
      ]
    },
    {
      id: '004',
      number: 'i.',
      type: 'footnote',
      children: [
        {
          id: '005',
          number: null,
          type: 'content',
          content: [
            {
              language: 'en',
              text: 'This is a footnote.'
            },
            {
              language: 'de',
              text: 'Dies ist eine Fussnote.'
            }
          ]
        }
      ]
    }
  ]
};
*/

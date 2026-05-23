import type {
  BlockDocumentNode,
  ContainerDocumentNode,
  ContentDocumentNode,
  DocumentNode,
  HeadingDocumentNode,
  Language,
} from '../../types/document';
import { generateId } from '../document-utils';
import { extractCleanText, matchRomanSection } from './patterns';
import type { TreeTransform } from './types';

/**
 * Check if a node is a content node with roman numeral section pattern.
 * Returns the extracted number and rest if matched.
 */
function getRomanSectionMatch(node: DocumentNode): { number: string; rest: string } | null {
  if (node.type !== 'CONTENT') return null;
  const text = extractCleanText(node.contents.de || '');
  const result = matchRomanSection(text);
  if (result.matched && result.number && result.rest !== undefined) {
    return { number: result.number, rest: result.rest };
  }
  return null;
}

/**
 * Transforms content nodes matching roman numeral patterns (I., II., III.)
 * into heading nodes at the root level.
 *
 * Only operates on direct children of document roots. Content and other nodes
 * following a roman section become children of that section until the next
 * roman section is encountered.
 *
 * @example
 * Input tree:
 *   document
 *     content("I. First Section")
 *     content("Some text")
 *     content("II. Second Section")
 *
 * Output tree:
 *   document
 *     heading(number: "I.", "First Section")
 *       content("Some text")
 *     heading(number: "II.", "Second Section")
 */
export const romanSectionTransform: TreeTransform = (
  root: ContainerDocumentNode,
  _language: Language
): ContainerDocumentNode => {
  // Only process document roots
  if (root.type !== 'DOCUMENT') {
    return root;
  }

  const newChildren: BlockDocumentNode[] = [];
  let currentSection: HeadingDocumentNode | null = null;

  for (const child of root.children) {
    const sectionMatch = getRomanSectionMatch(child);
    if (sectionMatch) {
      // Flush current section if any
      if (currentSection) {
        newChildren.push(currentSection);
      }
      // Start new section - convert content to heading with number extracted
      const contentNode = child as ContentDocumentNode;
      const language = Object.keys(contentNode.contents)[0] as Language;
      currentSection = {
        id: generateId(),
        number: sectionMatch.number,
        type: 'HEADING',
        format: 'TEXT',
        contents: { [language]: sectionMatch.rest },
        children: [],
      };
    } else if (currentSection) {
      // Add to current section's children
      currentSection.children.push(child);
    } else {
      // No section yet, keep at root level
      newChildren.push(child);
    }
  }

  // Flush final section
  if (currentSection) {
    newChildren.push(currentSection);
  }

  return {
    ...root,
    children: newChildren,
  };
};

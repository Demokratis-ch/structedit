/**
 * Swiss Legal Document Pattern Detection
 *
 * Regex patterns for detecting common Swiss legal document structures.
 */
export const LEGAL_PATTERNS = {
  /** Art. 1 or § 1 patterns (case-insensitive) */
  article: /^(Art\.|§)\s*\d+[a-z]?(\s+Abs\.\s*\d+)?(\s+Bst\.\s*[a-z])?(\s+[a-z]\))?/i,

  /** Section headers I. II. III. IV. V. VI. VII. VIII. IX. X. etc. */
  romanSection: /^(I{1,3}|IV|VI{0,3}|IX|X{1,3})\.(\s|$)/,

  /** (geändert), (neu), (aufgehoben) - legal status markers */
  legalMarker: /\((geändert|neu|aufgehoben)\)/i,

  /** 1 Text..., 2 Text... (numbered paragraph at start) */
  numberedPara: /^\d+\s+[A-ZÄÖÜ]/,

  /** A. text, B. text - uppercase letter section headers */
  uppercaseLetterSection: /^([A-Z])\.(\s|$)/,

  /** a. text, b. text, c. text - lettered list items */
  letteredItem: /^([a-z])\.\s+(.*)$/,
};

/**
 * Result of pattern matching
 */
export interface PatternMatchResult {
  matched: boolean;
  number?: string;
  rest?: string;
}

/**
 * Result of lettered item matching with captured groups
 */
export interface LetteredItemMatchResult {
  matched: boolean;
  letter?: string;
  content?: string;
}

/**
 * Check if text matches a roman numeral section pattern (I., II., etc.)
 */
export function matchRomanSection(text: string): PatternMatchResult {
  const match = text.match(LEGAL_PATTERNS.romanSection);
  if (!match) return { matched: false };
  return {
    matched: true,
    number: `${match[1]}.`,
    rest: text.slice(match[0].length).trim(),
  };
}

/**
 * Check if text matches an article pattern (Art. X, § X)
 */
export function matchArticle(text: string): PatternMatchResult {
  const match = text.match(LEGAL_PATTERNS.article);
  if (!match) return { matched: false };
  return {
    matched: true,
    number: match[0],
    rest: text.slice(match[0].length).trim(),
  };
}

/**
 * Check if text matches an uppercase letter section pattern (A., B., etc.)
 */
export function matchUppercaseLetterSection(text: string): PatternMatchResult {
  const match = text.match(LEGAL_PATTERNS.uppercaseLetterSection);
  if (!match) return { matched: false };
  return {
    matched: true,
    number: `${match[1]}.`,
    rest: text.slice(match[0].length).trim(),
  };
}

/**
 * Check if text matches a lettered item pattern (a., b., c.)
 * Returns the letter and content separately if matched.
 */
export function matchLetteredItem(text: string): LetteredItemMatchResult {
  const match = text.match(LEGAL_PATTERNS.letteredItem);
  if (match) {
    return {
      matched: true,
      letter: match[1],
      content: match[2],
    };
  }
  return { matched: false };
}

/**
 * Extract clean text from HTML content for pattern matching.
 * Strips HTML tags and converts &nbsp; to spaces.
 */
export function extractCleanText(htmlContent: string): string {
  return htmlContent
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

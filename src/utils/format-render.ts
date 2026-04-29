import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { NodeFormat } from '../types/document';

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * MARKDOWN_MINIMAL: support exactly five inline marks on top of HTML-escaped text.
 * Order matters: process longer / less-ambiguous markers first so they win over shorter ones.
 *   1. ~~strike~~  (must run before single ~)
 *   2. **bold**    (must run before *italic*)
 *   3. *italic*
 *   4. ^sup^
 *   5. ~sub~
 *
 * After substitution we have a string of safe HTML; we still pipe through DOMPurify so
 * any oddly nested input cannot escape the allow-list.
 */
const renderMarkdownMinimal = (raw: string): string => {
  const escaped = escapeHtml(raw);
  let s = escaped;
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\^([^^]+)\^/g, '<sup>$1</sup>');
  s = s.replace(/~([^~]+)~/g, '<sub>$1</sub>');
  s = s.replace(/\n/g, '<br>');
  return s;
};

/**
 * Pre-process a markdown source so single-tilde `~x~` and `^x^` survive `marked`:
 * GFM treats single-tilde as strikethrough too (and marked has no built-in sub/sup), so we
 * convert these marks to literal `<sub>` / `<sup>` tags before marked sees them. Marked
 * passes the resulting raw HTML through, and DOMPurify's per-format allow-list keeps them.
 * `~~strike~~` is left untouched (the negative lookbehind/ahead skip double tildes), so
 * marked's gfm rule still produces `<del>...</del>`.
 */
const protectSupSubMarks = (raw: string): string => {
  let s = raw.replace(/(?<!~)~([^~\s][^~]*?)~(?!~)/g, '<sub>$1</sub>');
  s = s.replace(/\^([^^\s][^^]*?)\^/g, '<sup>$1</sup>');
  return s;
};

type SanitizeConfig = Parameters<typeof DOMPurify.sanitize>[1];

const SANITIZE_CONFIGS: Record<NodeFormat, SanitizeConfig> = {
  TEXT: { ALLOWED_TAGS: [], ALLOWED_ATTR: [] },
  NEWLINES: { ALLOWED_TAGS: ['br'], ALLOWED_ATTR: [] },
  MARKDOWN_MINIMAL: {
    ALLOWED_TAGS: ['strong', 'em', 's', 'del', 'sup', 'sub', 'br'],
    ALLOWED_ATTR: [],
  },
  MARKDOWN_INLINE: {
    ALLOWED_TAGS: ['strong', 'em', 's', 'del', 'sup', 'sub', 'br', 'a', 'code'],
    ALLOWED_ATTR: ['href', 'title'],
  },
  MARKDOWN: {
    ALLOWED_TAGS: [
      'strong',
      'em',
      's',
      'del',
      'sup',
      'sub',
      'br',
      'a',
      'code',
      'p',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
    ],
    ALLOWED_ATTR: ['href', 'title'],
  },
};

const sanitize = (html: string, format: NodeFormat): string =>
  DOMPurify.sanitize(html, SANITIZE_CONFIGS[format]) as unknown as string;

const INLINE_MARK_TAGS = /<\/?(?:strong|b|em|i|u|s|strike|sup|sub|code)\b[^>]*>/i;
const BR_TAG = /<br\b[^>]*\/?>/i;
const A_WITH_HREF = /<a\b[^>]*\bhref\s*=/i;

/**
 * Whether the given inner HTML fragment contains an inline mark (bold/italic/strike/
 * sup/sub/code), a `<br>`, or a real `<a href=…>`. The importer picks per-format
 * heuristics on top of this; see `chooseFormat` in document-utils.
 */
export const hasInlineMarks = (innerHtml: string): boolean =>
  INLINE_MARK_TAGS.test(innerHtml) || BR_TAG.test(innerHtml) || A_WITH_HREF.test(innerHtml);

/** True iff the fragment carries an `<a href=…>`. Used by the heading heuristic, which
 * never elevates because of an anchor (MARKDOWN_MINIMAL can't render links anyway). */
export const hasOnlyAnchorMarks = (innerHtml: string): boolean =>
  A_WITH_HREF.test(innerHtml) && !INLINE_MARK_TAGS.test(innerHtml) && !BR_TAG.test(innerHtml);

// Single private-use codepoint — invalid inside HTML text, so it can't appear in real
// imports and is safe as a sentinel for the whitespace-collapse pass below.
const BR_SENTINEL = '';

/**
 * Convert an HTML fragment containing the supported inline marks into Markdown source
 * appropriate for the chosen format. Tags outside the supported set are dropped; their text
 * is kept.
 *
 * For TEXT/NEWLINES inline tags are stripped to produce plain text.
 * For MARKDOWN/MARKDOWN_INLINE we emit Markdown delimiters, `<br>` → `\n`, and
 * `<a href="X">label</a>` → `[label](X)`. `<code>x</code>` round-trips as `` `x` ``.
 * MARKDOWN_MINIMAL has no link or code rule, so links collapse to their label and code
 * spans collapse to their inner text.
 */
export const htmlToMarkdown = (html: string, format: NodeFormat): string => {
  if (format === 'TEXT' || format === 'NEWLINES') {
    return html
      .replace(/<\/?(?:[a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  let s = html;
  s = s.replace(/<br\b[^>]*\/?>/gi, BR_SENTINEL);
  if (format === 'MARKDOWN_MINIMAL') {
    // No link rule in MARKDOWN_MINIMAL — drop the anchor wrapper, keep the label.
    s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
    // No code rule either — drop the wrapper, keep the inner text.
    s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '$1');
  } else {
    s = s.replace(
      /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, _q, dq, sq, label) => `[${label}](${dq ?? sq ?? ''})`
    );
    // Anchors without href: drop the wrapper, keep the label.
    s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
    s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  }
  s = s.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  s = s.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');
  s = s.replace(/<(?:s|strike)\b[^>]*>([\s\S]*?)<\/(?:s|strike)>/gi, '~~$1~~');
  s = s.replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '^$1^');
  s = s.replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, '~$1~');
  // Drop any remaining tags we don't have a Markdown equivalent for (span, u, etc.) —
  // their inner text is preserved.
  s = s.replace(/<\/?(?:[a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, '');
  // Collapse runs of horizontal whitespace, then restore real newlines.
  s = s.replace(/[ \t\f\v]+/g, ' ').replaceAll(BR_SENTINEL, '\n');
  return s.trim();
};

/**
 * Pure function: turn a stored source string into sanitized HTML according to its format.
 * Output is safe for `dangerouslySetInnerHTML`.
 */
export const renderContent = (raw: string, format: NodeFormat): string => {
  switch (format) {
    case 'TEXT': {
      const collapsed = raw.replace(/\n+/g, ' ');
      return sanitize(escapeHtml(collapsed), 'TEXT');
    }
    case 'NEWLINES': {
      return sanitize(escapeHtml(raw).replace(/\n/g, '<br>'), 'NEWLINES');
    }
    case 'MARKDOWN_MINIMAL': {
      return sanitize(renderMarkdownMinimal(raw), 'MARKDOWN_MINIMAL');
    }
    case 'MARKDOWN_INLINE': {
      const html = marked.parseInline(protectSupSubMarks(raw), { async: false }) as string;
      return sanitize(html, 'MARKDOWN_INLINE');
    }
    case 'MARKDOWN': {
      const html = marked.parse(raw, { async: false }) as string;
      return sanitize(html, 'MARKDOWN');
    }
  }
};

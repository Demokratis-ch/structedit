import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import type { NodeFormat } from '../types/document';

/**
 * Private `marked` instance with bare HTML disabled. CommonMark passes raw
 * HTML through by default; we override `renderer.html` so that
 *   - `<div>x</div>` (block, Tokens.HTML)
 *   - `<span>x</span>` (inline, Tokens.Tag)
 * never reach the DOMPurify stage. DOMPurify alone cannot tell a `<strong>`
 * rendered from `**x**` (which we want) apart from one written verbatim in
 * source (which we don't); the override makes that distinction at the token
 * level, before sanitization.
 *
 * Exception: `protectSupSubMarks` injects literal `<sub>` / `<sup>` tags as
 * sentinels for ~x~ / ^x^ marks. We pass exactly those four tokens through
 * — exact tag, no attributes — so the existing sub/sup mechanism keeps
 * working. A hostile `<sub onerror=...>` cannot match the strict pattern;
 * DOMPurify is the second line of defense.
 */
const SUP_SUB_PASSTHROUGH = /^<\/?(?:sub|sup)>$/;
const markedNoHtml = new Marked({
  renderer: {
    html({ text }: { text: string }) {
      return SUP_SUB_PASSTHROUGH.test(text) ? text : '';
    },
  },
});

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * MARKDOWN_MINIMAL: support exactly five inline marks on top of HTML-escaped text.
 * Per the Demokratis platform spec the format is single-line — newlines are NOT a
 * supported feature, so we collapse any `\n` to a space (matching TEXT) before the
 * inline-mark substitutions run.
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
  const collapsed = raw.replace(/\n+/g, ' ');
  const escaped = escapeHtml(collapsed);
  let s = escaped;
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\^([^^]+)\^/g, '<sup>$1</sup>');
  s = s.replace(/~([^~]+)~/g, '<sub>$1</sub>');
  return s;
};

/**
 * Apply `transform` to every prose segment of a markdown source while leaving code
 * regions untouched. `String.split` with a capturing group interleaves matches with
 * non-matches, so even-indexed parts are prose and odd-indexed are code.
 *
 * Code regions detected:
 * - **Fenced blocks**: `` ``` `` opener at column 0, optional language tag, body, `` ``` ``
 *   closer on its own line. Listed first in the alternation so the inline-code rule
 *   doesn't greedily consume the opener as two empty backtick spans.
 * - **Inline code spans**: single-backtick `` ` `` pairs on a single line. Multi-tick
 *   spans (`` `` ``…`` `` ``) and indented code blocks (4-space-prefixed lines) are
 *   NOT recognized — the importer doesn't produce them, but a hand-typed source that
 *   uses them will leak `~`/`^` substitutions into those regions.
 */
const transformProseOnly = (src: string, transform: (s: string) => string): string => {
  const CODE_REGION = /(^```[\s\S]*?^```[ \t]*$|`[^`\n]*`)/gm;
  const parts = src.split(CODE_REGION);
  return parts.map((p, i) => (i % 2 === 1 ? p : transform(p))).join('');
};

/**
 * Pre-process a markdown source so single-tilde `~x~` and `^x^` survive `marked`:
 * GFM treats single-tilde as strikethrough too (and marked has no built-in sub/sup), so we
 * convert these marks to literal `<sub>` / `<sup>` tags before marked sees them. Marked
 * passes the resulting raw HTML through, and DOMPurify's per-format allow-list keeps them.
 *
 * The inner content must be non-empty and contain no whitespace, which keeps unrelated
 * prose like `cd ~/foo and ~/bar` or `a^2 + b^2` from being mangled. `~~strike~~` is left
 * untouched via the negative lookbehind/ahead. Code spans and fenced blocks are skipped
 * entirely so backtick-wrapped content like `` `~/path~` `` stays literal.
 */
const protectSupSubMarks = (raw: string): string =>
  transformProseOnly(raw, (prose) =>
    prose
      .replace(/(?<!~)~([^~\s]+)~(?!~)/g, '<sub>$1</sub>')
      .replace(/\^([^^\s]+)\^/g, '<sup>$1</sup>')
  );

type SanitizeConfig = Parameters<typeof DOMPurify.sanitize>[1];

const SANITIZE_CONFIGS: Record<NodeFormat, SanitizeConfig> = {
  TEXT: { ALLOWED_TAGS: [], ALLOWED_ATTR: [] },
  NEWLINES: { ALLOWED_TAGS: ['br'], ALLOWED_ATTR: [] },
  MARKDOWN_MINIMAL: {
    ALLOWED_TAGS: ['strong', 'em', 's', 'del', 'sup', 'sub'],
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

const INLINE_MARK_TAGS = /<\/?(?:strong|b|em|i|u|s|strike|del|sup|sub|code)\b[^>]*>/i;
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

/** True iff the fragment contains a `<br>` but no inline mark and no anchor. The
 * heading heuristic uses this to demote to NEWLINES, since MARKDOWN_MINIMAL is
 * single-line and can't carry the break. */
export const hasOnlyBreakMarks = (innerHtml: string): boolean =>
  BR_TAG.test(innerHtml) && !INLINE_MARK_TAGS.test(innerHtml) && !A_WITH_HREF.test(innerHtml);

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
/**
 * Wrap `inner` with `open` / `close` while floating leading/trailing *horizontal*
 * whitespace OUTSIDE the delimiters. Word and many web editors emit `<em>Test </em>`
 * with the trailing space inside the tag; the literal `*Test *` would not parse as
 * italic. Newlines stay inside the mark — pulling them out would inject a hard break
 * into otherwise inline content.
 */
const wrapMark = (inner: string, open: string, close: string = open): string => {
  // Always matches (greedy ends are anchored), so the destructure is safe.
  const [, lead, mid, tail] = /^([ \t]*)([\s\S]*?)([ \t]*)$/.exec(inner) as RegExpExecArray;
  if (mid.length === 0) return lead + tail; // mark wrapping only whitespace — drop it
  return `${lead}${open}${mid}${close}${tail}`;
};

/**
 * Decode HTML entities that would otherwise survive into stored markdown source and get
 * re-escaped by `marked` (e.g. `&amp;` \u2192 `&amp;amp;`). We deliberately do NOT decode
 * `&lt;` / `&gt;` (and their numeric equivalents 0x3C / 0x3E): the tag-stripping pass
 * runs after this step and would mistake the resulting `<` / `>` for tag markers,
 * potentially deleting user content or executing markup that started life as text.
 *
 * Callers are expected to pass strings that have already been through the importer's
 * DOMPurify + DOMParser round-trip, which case-folds named entities (`&AMP;` \u2192 `&amp;`)
 * and canonicalises numeric refs (`&#X3C;` \u2192 `&#x3c;`, `&#0060;` \u2192 `&#60;`). Without
 * that pre-pass, an attacker-supplied `&LT;script&GT;` would slip past the skip set
 * and form a phantom tag.
 */
const NAMED_ENTITY_DECODE: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
};
const decodeCommonEntities = (s: string): string =>
  s
    .replace(/&(nbsp|amp|quot|apos);/g, (_, name: string) => NAMED_ENTITY_DECODE[name])
    .replace(/&#(\d+);/g, (m, code: string) => {
      const n = Number(code);
      return n === 0x3c || n === 0x3e ? m : String.fromCodePoint(n);
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, code: string) => {
      const n = parseInt(code, 16);
      return n === 0x3c || n === 0x3e ? m : String.fromCodePoint(n);
    })
    .replace(/\u00A0/g, ' ');

export const htmlToMarkdown = (html: string, format: NodeFormat): string => {
  if (format === 'TEXT') {
    return decodeCommonEntities(html)
      .replace(/<\/?(?:[a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // NEWLINES: keep <br> → \n but no other formatting.
  if (format === 'NEWLINES') {
    return decodeCommonEntities(html)
      .replace(/<br\b[^>]*\/?>/gi, BR_SENTINEL)
      .replace(/<\/?(?:[a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, '')
      .replace(/[ \t\f\v]+/g, ' ')
      .replaceAll(BR_SENTINEL, '\n')
      .trim();
  }
  let s = decodeCommonEntities(html);
  if (format === 'MARKDOWN_MINIMAL') {
    // MARKDOWN_MINIMAL is single-line per spec — drop <br> entirely (becomes a space
    // after collapse), and drop anchors / code wrappers since the format has no rules
    // for them. Only the five inline marks survive.
    s = s.replace(/<br\b[^>]*\/?>/gi, ' ');
    s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
    s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '$1');
  } else {
    // MARKDOWN / MARKDOWN_INLINE: round-trip <br>, anchors, code spans.
    s = s.replace(/<br\b[^>]*\/?>/gi, BR_SENTINEL);
    s = s.replace(
      /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, _q, dq, sq, label) => `[${label}](${dq ?? sq ?? ''})`
    );
    // Anchors without href: drop the wrapper, keep the label.
    s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
    s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner: string) => wrapMark(inner, '`'));
  }
  s = s.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_m, inner: string) =>
    wrapMark(inner, '**')
  );
  s = s.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_m, inner: string) =>
    wrapMark(inner, '*')
  );
  s = s.replace(/<(?:s|strike)\b[^>]*>([\s\S]*?)<\/(?:s|strike)>/gi, (_m, inner: string) =>
    wrapMark(inner, '~~')
  );
  s = s.replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_m, inner: string) => wrapMark(inner, '^'));
  s = s.replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_m, inner: string) => wrapMark(inner, '~'));
  // Drop any remaining tags we don't have a Markdown equivalent for (span, u, etc.) —
  // their inner text is preserved.
  s = s.replace(/<\/?(?:[a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, '');
  // Collapse runs of horizontal whitespace, then restore real newlines (no-op for
  // MARKDOWN_MINIMAL since the sentinel was never inserted).
  s = s.replace(/[ \t\f\v]+/g, ' ').replaceAll(BR_SENTINEL, '\n');
  return s.trim();
};

/**
 * Pure function: turn a stored source string into sanitized HTML according to its format.
 * Output is safe for `dangerouslySetInnerHTML`. Trailing whitespace is stripped — `marked`
 * appends a `\n` after each block, and the editor's `white-space: pre-wrap` would render
 * that as a visible blank line, which users perceive as the format change "adding a newline".
 */
export const renderContent = (raw: string, format: NodeFormat): string => {
  let html: string;
  switch (format) {
    case 'TEXT': {
      const collapsed = raw.replace(/\n+/g, ' ');
      html = sanitize(escapeHtml(collapsed), 'TEXT');
      break;
    }
    case 'NEWLINES': {
      html = sanitize(escapeHtml(raw).replace(/\n/g, '<br>'), 'NEWLINES');
      break;
    }
    case 'MARKDOWN_MINIMAL': {
      html = sanitize(renderMarkdownMinimal(raw), 'MARKDOWN_MINIMAL');
      break;
    }
    case 'MARKDOWN_INLINE': {
      html = sanitize(
        markedNoHtml.parseInline(protectSupSubMarks(raw), { async: false }) as string,
        'MARKDOWN_INLINE'
      );
      break;
    }
    case 'MARKDOWN': {
      html = sanitize(
        markedNoHtml.parse(protectSupSubMarks(raw), { async: false }) as string,
        'MARKDOWN'
      );
      break;
    }
  }
  return html.replace(/\s+$/, '');
};

/**
 * Whether a markdown source contains any inline marks (bold/italic/strike/sup/sub/code/
 * link). Detected by rendering the source as MARKDOWN and reusing `hasInlineMarks` on
 * the result — avoids re-deriving the mark grammar.
 *
 * Literal newlines are NOT treated as inline marks: a single `\n` doesn't render as a
 * hard break in MARKDOWN (marked's default has `breaks: false`), and TEXT collapses
 * `\n` to a space. Visually identical either way; we keep `\n` in the source so the
 * user can upgrade the format later if they want hard breaks.
 *
 * Used by `listNumberDedupTransform` to decide whether a content node still needs
 * MARKDOWN format after the only inline mark (a leading `<sup>N</sup>` Absatznummer)
 * has been stripped.
 */
export const hasInlineMarkdownMarks = (source: string): boolean =>
  hasInlineMarks(renderContent(source, 'MARKDOWN'));

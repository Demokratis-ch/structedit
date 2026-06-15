import { describe, expect, it } from 'vitest';
import { hasInlineMarkdownMarks, renderContent } from './format-render';

const parseHtml = (html: string): Document =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

const hasExecutableXss = (html: string): boolean => {
  const doc = parseHtml(html);
  if (doc.querySelector('script')) return true;
  if (doc.querySelector('img')) return true;
  if (doc.querySelector('iframe')) return true;
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on')) return true;
      if (/^javascript:/i.test(attr.value.trim())) return true;
    }
  }
  return false;
};

describe('renderContent — TEXT', () => {
  it('escapes HTML and collapses newlines to a single space', () => {
    expect(renderContent('a <b>x</b>\nb', 'TEXT')).toBe('a &lt;b&gt;x&lt;/b&gt; b');
  });

  it('collapses multiple consecutive newlines to one space', () => {
    expect(renderContent('a\n\n\nb', 'TEXT')).toBe('a b');
  });

  it('escapes ampersands and quotes', () => {
    expect(renderContent('Tom & Jerry "win"', 'TEXT')).toBe('Tom &amp; Jerry &quot;win&quot;');
  });

  it('strips XSS attempts', () => {
    const html = renderContent('<img src=x onerror=alert(1)>', 'TEXT');
    expect(hasExecutableXss(html)).toBe(false);
  });
});

describe('renderContent — NEWLINES', () => {
  it('escapes HTML and converts \\n to <br>', () => {
    expect(renderContent('line1\nline2', 'NEWLINES')).toBe('line1<br>line2');
  });

  it('escapes angle brackets', () => {
    expect(renderContent('<x>\nb', 'NEWLINES')).toBe('&lt;x&gt;<br>b');
  });

  it('keeps multiple consecutive line breaks', () => {
    expect(renderContent('a\n\nb', 'NEWLINES')).toBe('a<br><br>b');
  });

  it('strips XSS attempts', () => {
    const html = renderContent('<img src=x onerror=alert(1)>', 'NEWLINES');
    expect(hasExecutableXss(html)).toBe(false);
  });
});

describe('renderContent — MARKDOWN_MINIMAL', () => {
  it('renders bold, italic, strike, sup, sub but not links', () => {
    const html = renderContent('**a** *b* ~~c~~ ^d^ ~e~ [link](x)', 'MARKDOWN_MINIMAL');
    expect(html).toContain('<strong>a</strong>');
    expect(html).toContain('<em>b</em>');
    // strike may render as <s> or <del>
    expect(html).toMatch(/<s>c<\/s>|<del>c<\/del>/);
    expect(html).toContain('<sup>d</sup>');
    expect(html).toContain('<sub>e</sub>');
    // link should be plain literal text
    expect(html).toContain('[link](x)');
    expect(html).not.toContain('<a');
  });

  it('does NOT preserve newlines (MARKDOWN_MINIMAL is single-line per platform spec)', () => {
    const html = renderContent('first\nsecond', 'MARKDOWN_MINIMAL');
    // The format has no newline rule — per the Demokratis platform spec it's purely
    // inline marks on a single line of text. Renderer collapses to a single space.
    expect(html).not.toContain('<br>');
    expect(html).toBe('first second');
  });

  it('does not render block elements like # heading', () => {
    const html = renderContent('# heading', 'MARKDOWN_MINIMAL');
    expect(html).not.toContain('<h1>');
    expect(html).toContain('# heading');
  });

  it('escapes raw HTML in source', () => {
    const html = renderContent('<script>alert(1)</script>', 'MARKDOWN_MINIMAL');
    expect(html).not.toContain('<script>');
  });

  it('strips XSS attempts', () => {
    const html = renderContent('<img src=x onerror=alert(1)>', 'MARKDOWN_MINIMAL');
    expect(hasExecutableXss(html)).toBe(false);
  });

  // The MARKDOWN_MINIMAL pipeline is intentionally a tiny non-nesting regex pass
  // (see design D3: "no nesting beyond one level"). The tests below pin down the
  // current deterministic output for inputs that mix or nest delimiters, so that
  // future tweaks to the regex order/non-greediness can't silently regress them.
  describe('pathological inputs (regression pins)', () => {
    it('triple tildes around a word collapse to nested sub+s (acceptable)', () => {
      // 3+strike+3 tildes: the inner `~~strike~~` becomes <s>, then the outer
      // single tildes become <sub> wrapping it.
      expect(renderContent('~~~strike~~~', 'MARKDOWN_MINIMAL')).toBe('<sub><s>strike</s></sub>');
    });

    it('mixed asterisks `**a*b**` produce no <strong> (lossy by design)', () => {
      const out = renderContent('**a*b**', 'MARKDOWN_MINIMAL');
      expect(out).not.toContain('<strong>');
      // The single-* pass picks up the `*a*` slice, leaving the surrounding `*` literal.
      expect(out).toContain('<em>a</em>');
      // No XSS or stray HTML — output is sanitized text + the single em.
      expect(hasExecutableXss(out)).toBe(false);
    });

    it('orphan trailing carets stay literal', () => {
      const out = renderContent('a^x^2^^', 'MARKDOWN_MINIMAL');
      expect(out).toContain('<sup>x</sup>');
      // The final unmatched `^^` survives as plain text.
      expect(out).toContain('2^^');
    });

    it('does not wrap unbalanced delimiters', () => {
      // No closing star: input passes through with the single * literal.
      expect(renderContent('*unclosed', 'MARKDOWN_MINIMAL')).toBe('*unclosed');
    });
  });
});

describe('renderContent — MARKDOWN_INLINE', () => {
  it('renders inline marks but not block elements', () => {
    const html = renderContent('# heading\n\npara', 'MARKDOWN_INLINE');
    expect(html).not.toContain('<h1>');
    expect(html).not.toContain('<p>');
    expect(html).not.toContain('<ul>');
    expect(html).not.toContain('<ol>');
    expect(html).not.toContain('<table>');
  });

  it('renders bold and italic via CommonMark inline', () => {
    const html = renderContent('**a** *b*', 'MARKDOWN_INLINE');
    expect(html).toContain('<strong>a</strong>');
    expect(html).toContain('<em>b</em>');
  });

  it('renders inline links', () => {
    const html = renderContent('[demokratis](https://demokratis.ch)', 'MARKDOWN_INLINE');
    expect(html).toContain('<a');
    expect(html).toContain('href="https://demokratis.ch"');
    expect(html).toContain('demokratis</a>');
  });

  it('renders ^x^ as <sup>x</sup>', () => {
    const html = renderContent('a^2^', 'MARKDOWN_INLINE');
    expect(html).toContain('<sup>2</sup>');
  });

  it('renders ~x~ as <sub>x</sub> (single tilde) without colliding with ~~strike~~', () => {
    const html = renderContent('H~2~O', 'MARKDOWN_INLINE');
    expect(html).toContain('<sub>2</sub>');
  });

  it('renders ~~x~~ as strike (s/del), not as nested sub', () => {
    const html = renderContent('~~gone~~', 'MARKDOWN_INLINE');
    expect(html).toMatch(/<(s|del)>gone<\/(s|del)>/);
    expect(html).not.toContain('<sub>');
  });

  it('strips XSS attempts in HTML', () => {
    const html = renderContent('<img src=x onerror=alert(1)>', 'MARKDOWN_INLINE');
    expect(hasExecutableXss(html)).toBe(false);
  });
});

describe('renderContent — MARKDOWN', () => {
  it('renders unordered lists', () => {
    const html = renderContent('- a\n- b', 'MARKDOWN');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<li>b</li>');
  });

  it('renders a single newline as a <br> hard break (breaks: true)', () => {
    const html = renderContent('line one\nline two', 'MARKDOWN');
    expect(html).toMatch(/<br\s*\/?>/);
    expect(html).toContain('line one');
    expect(html).toContain('line two');
  });

  it('renders paragraphs and inline marks', () => {
    const html = renderContent('Hello **world**', 'MARKDOWN');
    expect(html).toContain('<strong>world</strong>');
  });

  it('strips XSS attempts in HTML', () => {
    const html = renderContent('<img src=x onerror=alert(1)>', 'MARKDOWN');
    expect(hasExecutableXss(html)).toBe(false);
  });

  it('strips javascript: links', () => {
    const html = renderContent('[click](javascript:alert(1))', 'MARKDOWN');
    expect(hasExecutableXss(html)).toBe(false);
    // The href, if present, must not be a javascript: URL
    const doc = parseHtml(html);
    const a = doc.querySelector('a');
    if (a) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
  });

  it('renders ^x^ as <sup>x</sup>', () => {
    const html = renderContent('a^2^', 'MARKDOWN');
    expect(html).toContain('<sup>2</sup>');
  });

  it('renders ~x~ as <sub>x</sub>, not strikethrough', () => {
    const html = renderContent('H~2~O', 'MARKDOWN');
    expect(html).toContain('<sub>2</sub>');
    expect(html).not.toMatch(/<(?:s|del)>2<\/(?:s|del)>/);
  });

  it('still renders ~~x~~ as strikethrough (regression)', () => {
    const html = renderContent('~~gone~~', 'MARKDOWN');
    expect(html).toMatch(/<(?:s|del)>gone<\/(?:s|del)>/);
    expect(html).not.toContain('<sub>');
  });

  describe('does not mangle code spans / blocks / unrelated tildes & carets', () => {
    it('inline code span containing ~x~ stays literal', () => {
      const html = renderContent('see `~x~` here', 'MARKDOWN');
      expect(html).toContain('<code>~x~</code>');
      expect(html).not.toContain('<sub>');
    });

    it('inline code span containing ^x^ stays literal', () => {
      const html = renderContent('see `^x^` here', 'MARKDOWN');
      expect(html).toContain('<code>^x^</code>');
      expect(html).not.toContain('<sup>');
    });

    it('cd ~/foo and ~/bar is not mangled into a <sub>', () => {
      const html = renderContent('cd ~/foo and ~/bar', 'MARKDOWN');
      expect(html).not.toContain('<sub>');
      expect(html).toContain('cd ~/foo and ~/bar');
    });

    it('a^2 + b^2 is not collapsed into a single <sup>', () => {
      const html = renderContent('a^2 + b^2', 'MARKDOWN');
      expect(html).not.toContain('<sup>');
      expect(html).toContain('a^2 + b^2');
    });

    it('~space inside~ is not matched (regex requires no whitespace inside)', () => {
      const html = renderContent('approx ~10 ms ~20 ms', 'MARKDOWN');
      expect(html).not.toContain('<sub>');
      expect(html).toContain('approx ~10 ms ~20 ms');
    });

    it('fenced code block keeps ~x~ literal inside <pre><code>', () => {
      const html = renderContent('```\ncd ~/foo~\n```', 'MARKDOWN');
      expect(html).toContain('<pre>');
      expect(html).toContain('<code>');
      // The fenced body must NOT contain `<sub>` text (escaped or otherwise) and must
      // preserve the original `~/foo~` characters verbatim.
      expect(html).toMatch(/<code[^>]*>[\s\S]*cd ~\/foo~[\s\S]*<\/code>/);
      expect(html).not.toMatch(/&lt;sub&gt;|<sub>/);
    });

    it('fenced code block with language tag keeps ^x^ literal', () => {
      // Inner content `^2^` would normally be turned into <sup>; inside a fenced block
      // it must stay literal regardless of the language tag on the opener.
      const html = renderContent('```js\na = b^2^\n```', 'MARKDOWN');
      expect(html).toMatch(/<code[^>]*>[\s\S]*a = b\^2\^[\s\S]*<\/code>/);
      expect(html).not.toMatch(/&lt;sup&gt;|<sup>/);
    });
  });
});

describe('renderContent — bare HTML in MARKDOWN source', () => {
  it('drops bare block HTML', () => {
    const html = renderContent('<div>raw block</div>', 'MARKDOWN');
    expect(html).not.toContain('<div>');
  });

  it('drops bare inline HTML even when wrapped in a paragraph', () => {
    const html = renderContent('hello <span class="x">there</span> world', 'MARKDOWN');
    expect(html).not.toContain('<span');
    expect(html).toContain('hello');
    expect(html).toContain('world');
  });

  it('drops bare HTML even for tags that DOMPurify would otherwise allow', () => {
    // `<strong>` is in the MARKDOWN allow-list, but it came from raw HTML in
    // source, not from `**…**`. The Markdown delimiters are the only path to
    // an emphasized output; raw tags must be stripped.
    const html = renderContent('<strong>raw</strong>', 'MARKDOWN');
    expect(html).not.toContain('<strong>');
  });

  it('still renders Markdown bold from `**` (regression)', () => {
    const html = renderContent('**md bold**', 'MARKDOWN');
    expect(html).toContain('<strong>md bold</strong>');
  });

  it('drops bare <script> with no XSS leak', () => {
    const html = renderContent('<script>alert(1)</script>', 'MARKDOWN');
    expect(hasExecutableXss(html)).toBe(false);
    expect(html).not.toContain('<script');
  });

  it('preserves CommonMark autolinks (angle-bracket syntax produces a link token, not an html token)', () => {
    const html = renderContent('<https://example.com>', 'MARKDOWN');
    expect(html).toContain('href="https://example.com"');
  });

  it('preserves GFM tables (CommonMark + GFM contract)', () => {
    const html = renderContent('| a | b |\n|---|---|\n| 1 | 2 |', 'MARKDOWN');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('preserves GFM strikethrough', () => {
    const html = renderContent('~~gone~~', 'MARKDOWN');
    expect(html).toMatch(/<(?:s|del)>gone<\/(?:s|del)>/);
  });
});

describe('renderContent — bare HTML in MARKDOWN_INLINE source', () => {
  it('drops bare inline HTML', () => {
    const bare = renderContent('see <em>raw</em> here', 'MARKDOWN_INLINE');
    expect(bare).not.toContain('<em>raw</em>');
    // Markdown italics still work — the delimiters are the only path.
    expect(renderContent('see *md* here', 'MARKDOWN_INLINE')).toContain('<em>md</em>');
  });

  it('drops bare <a> tags (Markdown link syntax is the only path)', () => {
    const bare = renderContent('<a href="https://x">raw</a>', 'MARKDOWN_INLINE');
    expect(bare).not.toMatch(/<a[^>]*href="https:\/\/x"/);
    expect(renderContent('[ok](https://x)', 'MARKDOWN_INLINE')).toContain('href="https://x"');
  });
});

describe('renderContent — no spurious trailing whitespace', () => {
  // The rendered output is set via dangerouslySetInnerHTML into a contentEditable with
  // `white-space: pre-wrap`. A trailing newline (which marked appends after each block)
  // would render as a visible blank line and look like the format change "added a
  // newline to the contents". Output must be trimmed.
  it('MARKDOWN output has no trailing newline', () => {
    expect(renderContent('hello', 'MARKDOWN')).not.toMatch(/\n+$/);
  });

  it('MARKDOWN list output has no trailing newline', () => {
    expect(renderContent('- a\n- b', 'MARKDOWN')).not.toMatch(/\n+$/);
  });

  it('MARKDOWN_INLINE output has no trailing newline', () => {
    expect(renderContent('**bold**', 'MARKDOWN_INLINE')).not.toMatch(/\n+$/);
  });

  it('TEXT output has no trailing whitespace', () => {
    expect(renderContent('hello\n', 'TEXT')).not.toMatch(/\s+$/);
  });
});

describe('hasInlineMarkdownMarks', () => {
  it('returns false for plain text', () => {
    expect(hasInlineMarkdownMarks('just words')).toBe(false);
    expect(hasInlineMarkdownMarks('')).toBe(false);
  });

  it('returns true for markdown bold/italic/strike', () => {
    expect(hasInlineMarkdownMarks('**bold**')).toBe(true);
    expect(hasInlineMarkdownMarks('*italic*')).toBe(true);
    expect(hasInlineMarkdownMarks('~~strike~~')).toBe(true);
  });

  it('returns true for sup/sub markdown marks', () => {
    expect(hasInlineMarkdownMarks('x^2^ + y')).toBe(true);
    expect(hasInlineMarkdownMarks('H~2~O')).toBe(true);
  });

  it('returns true for code spans and links', () => {
    expect(hasInlineMarkdownMarks('see `code`')).toBe(true);
    expect(hasInlineMarkdownMarks('see [site](https://example.com)')).toBe(true);
  });

  it('returns true for a literal newline alone (renders as a hard break under MARKDOWN)', () => {
    // A bare `\n` renders as a `<br>` in MARKDOWN (marked runs with `breaks: true`)
    // whereas TEXT collapses `\n` to a space — so the newline IS a meaningful mark
    // and a node carrying only newlines must keep its MARKDOWN format on downgrade.
    expect(hasInlineMarkdownMarks('line one\nline two')).toBe(true);
  });
});

describe('renderContent — purity', () => {
  it('returns identical output across two calls with the same input', () => {
    const out1 = renderContent('**hi**\n- x', 'MARKDOWN');
    const out2 = renderContent('**hi**\n- x', 'MARKDOWN');
    expect(out1).toBe(out2);
  });

  it('handles empty string', () => {
    expect(renderContent('', 'TEXT')).toBe('');
    expect(renderContent('', 'NEWLINES')).toBe('');
    expect(renderContent('', 'MARKDOWN_MINIMAL')).toBe('');
  });
});

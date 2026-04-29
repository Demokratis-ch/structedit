import { describe, expect, it } from 'vitest';
import { renderContent } from './format-render';

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

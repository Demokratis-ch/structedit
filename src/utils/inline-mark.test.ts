import { describe, expect, test } from 'vitest';
import { type InlineMark, isMarkActive, toggleMark } from './inline-mark';

const ALL: InlineMark[] = ['bold', 'italic', 'strike', 'sup', 'sub'];
const OPEN_FOR: Record<InlineMark, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  sup: '^',
  sub: '~',
};

describe('toggleMark — wrap on a plain selection', () => {
  test.each(ALL)('wraps a plain selection with the %s mark', (mark) => {
    // selection covers "world" inside "hello world"
    const text = 'hello world';
    const start = 6;
    const end = 11;
    const open = OPEN_FOR[mark];
    const close = open;

    const result = toggleMark(text, start, end, mark);

    expect(result.action).toBe('wrapped');
    expect(result.text).toBe(`hello ${open}world${close}`);
    // Selection should still cover the original word, now offset past the open delimiter.
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe('world');
  });
});

describe('toggleMark — unwrap', () => {
  test('unwraps when selection equals the inner span of an exact wrap', () => {
    // text: "**hello**", selection on "hello"
    const text = '**hello**';
    const result = toggleMark(text, 2, 7, 'bold');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('hello');
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe('hello');
  });

  test('unwraps when selection includes the wrappers themselves', () => {
    // text: "**hello**", selection on "**hello**"
    const text = '**hello**';
    const result = toggleMark(text, 0, 9, 'bold');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('hello');
  });

  test('unwraps when selection sits inside an enclosing same-mark pair', () => {
    // text: "**hello world**", selection on "world"
    const text = '**hello world**';
    const start = text.indexOf('world');
    const end = start + 'world'.length;
    const result = toggleMark(text, start, end, 'bold');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('hello world');
  });
});

describe('toggleMark — collapsed selection (no selection)', () => {
  test('wraps the whole string when collapsed and string is plain', () => {
    const text = 'hello';
    const result = toggleMark(text, 3, 3, 'italic');
    expect(result.action).toBe('wrapped');
    expect(result.text).toBe('*hello*');
  });

  test('unwraps the whole string when already wrapped (collapsed)', () => {
    const text = '*hello*';
    const result = toggleMark(text, 4, 4, 'italic');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('hello');
  });

  test('empty string with collapsed selection is a noop', () => {
    const result = toggleMark('', 0, 0, 'bold');
    expect(result.action).toBe('noop');
    expect(result.text).toBe('');
  });

  test('collapsed cursor inside the second of two wrap pairs unwraps that pair only', () => {
    // text positions: 0..4 = "**a**", 5..9 = " and ", 10..14 = "**b**"
    const text = '**a** and **b**';
    // Cursor between '**' and 'b' inside the second pair.
    const cursorInsideSecond = text.indexOf('b'); // 12
    const result = toggleMark(text, cursorInsideSecond, cursorInsideSecond, 'bold');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('**a** and b');
  });

  test('collapsed cursor outside any region falls back to whole-string', () => {
    const text = '**a** and **b**';
    // Cursor between the two pairs, in plain text.
    const cursor = text.indexOf(' and ') + 2;
    const result = toggleMark(text, cursor, cursor, 'bold');
    expect(result.action).toBe('wrapped');
    // Entire string wraps — confirms the fallback.
    expect(result.text.startsWith('**')).toBe(true);
    expect(result.text.endsWith('**')).toBe(true);
  });
});

describe('toggleMark — selection crossing a delimiter', () => {
  test('selection that crosses a delimiter wraps rather than half-unwrapping', () => {
    const text = '**hello**';
    // Selection covers `**hel` — overlaps the open delimiter.
    const result = toggleMark(text, 0, 5, 'bold');
    expect(result.action).toBe('wrapped');
  });
});

describe('toggleMark — newline preservation', () => {
  test('selection that includes \\n keeps the newline character intact', () => {
    const text = 'line1\nline2';
    const result = toggleMark(text, 0, text.length, 'bold');
    expect(result.action).toBe('wrapped');
    expect(result.text).toBe('**line1\nline2**');
  });
});

describe('isMarkActive — collapsed cursor cases', () => {
  test('true when collapsed cursor sits inside the inner span of a wrap', () => {
    expect(isMarkActive('**a** and **b**', 12, 12, 'bold')).toBe(true);
  });

  test('false when collapsed cursor sits in plain text between two wrap pairs', () => {
    expect(isMarkActive('**a** and **b**', 7, 7, 'bold')).toBe(false);
  });
});

describe('toggleMark — idempotence', () => {
  test.each(ALL)('toggle then toggle is identity for %s', (mark) => {
    const original = 'hello world';
    const start = 6;
    const end = 11;

    const once = toggleMark(original, start, end, mark);
    const twice = toggleMark(once.text, once.selectionStart, once.selectionEnd, mark);

    expect(twice.text).toBe(original);
    expect(twice.text.slice(twice.selectionStart, twice.selectionEnd)).toBe('world');
  });
});

describe('toggleMark — precedence between similar marks', () => {
  test('bold detection wins over italic on **x** when toggling bold', () => {
    const text = '**x**';
    const result = toggleMark(text, 2, 3, 'bold');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('x');
  });

  test('italic toggle on **x** does NOT misread the bold delimiters as nested italic', () => {
    // selection on "x" inside "**x**" — there is no italic to remove, so it should wrap as italic.
    const text = '**x**';
    const result = toggleMark(text, 2, 3, 'italic');
    expect(result.action).toBe('wrapped');
    expect(result.text).toBe('***x***');
  });

  test('strike detection wins over sub on ~~x~~ when toggling strike', () => {
    const text = '~~x~~';
    const result = toggleMark(text, 2, 3, 'strike');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('x');
  });

  test('sub toggle on ~~x~~ does NOT misread the strike delimiters as nested sub', () => {
    const text = '~~x~~';
    const result = toggleMark(text, 2, 3, 'sub');
    expect(result.action).toBe('wrapped');
    expect(result.text).toBe('~~~x~~~');
  });
});

describe('toggleMark — adjacency and nesting', () => {
  test('adjacent **a***b*: italic on b unwraps only *b*', () => {
    const text = '**a***b*';
    const start = text.indexOf('b');
    const end = start + 1;
    const result = toggleMark(text, start, end, 'italic');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('**a**b');
  });

  test('nested **a *b* c**: italic on b unwraps inner *b* only', () => {
    const text = '**a *b* c**';
    const start = text.indexOf('b');
    const end = start + 1;
    const result = toggleMark(text, start, end, 'italic');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('**a b c**');
  });
});

describe('toggleMark — sup and sub are mutually exclusive', () => {
  test('toggling sup on sub-wrapped text replaces sub with sup', () => {
    const text = 'before ~foo~ after';
    const start = text.indexOf('foo');
    const end = start + 'foo'.length;
    const result = toggleMark(text, start, end, 'sup');
    expect(result.action).toBe('wrapped');
    expect(result.text).toBe('before ^foo^ after');
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe('foo');
  });

  test('toggling sub on sup-wrapped text replaces sup with sub', () => {
    const text = 'x ^2^ y';
    const start = text.indexOf('2');
    const end = start + 1;
    const result = toggleMark(text, start, end, 'sub');
    expect(result.action).toBe('wrapped');
    expect(result.text).toBe('x ~2~ y');
  });

  test('toggling sup when sup is active still unwraps (does not loop)', () => {
    const text = '^foo^';
    const result = toggleMark(text, 1, 4, 'sup');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('foo');
  });

  test('toggling sub when sub is active still unwraps (does not loop)', () => {
    const text = '~foo~';
    const result = toggleMark(text, 1, 4, 'sub');
    expect(result.action).toBe('unwrapped');
    expect(result.text).toBe('foo');
  });

  test('toggling sup with no marks active wraps as sup (no opposite to remove)', () => {
    const text = 'foo';
    const result = toggleMark(text, 0, 3, 'sup');
    expect(result.action).toBe('wrapped');
    expect(result.text).toBe('^foo^');
  });

  test('switch is symmetric and idempotent: sub→sup→sub returns to sub', () => {
    const start = '~foo~';
    const startSel = { s: start.indexOf('foo'), e: start.indexOf('foo') + 'foo'.length };
    const toSup = toggleMark(start, startSel.s, startSel.e, 'sup');
    expect(toSup.text).toBe('^foo^');
    const backToSub = toggleMark(toSup.text, toSup.selectionStart, toSup.selectionEnd, 'sub');
    expect(backToSub.text).toBe('~foo~');
  });

  test('strike (~~) is not affected by the sup/sub switch', () => {
    // Toggling sup on ~~foo~~ should NOT misread the strike delimiters as sub.
    const text = '~~foo~~';
    const result = toggleMark(text, 2, 5, 'sup');
    expect(result.action).toBe('wrapped');
    expect(result.text).toBe('~~^foo^~~');
  });
});

describe('isMarkActive', () => {
  test('true when the whole string is wrapped (collapsed selection)', () => {
    expect(isMarkActive('**hello**', 4, 4, 'bold')).toBe(true);
  });

  test('true when selection equals the inner span of a wrap', () => {
    expect(isMarkActive('**hello**', 2, 7, 'bold')).toBe(true);
  });

  test('true when selection includes the wrappers', () => {
    expect(isMarkActive('**hello**', 0, 9, 'bold')).toBe(true);
  });

  test('true when selection sits inside an enclosing pair', () => {
    expect(isMarkActive('**hello world**', 8, 13, 'bold')).toBe(true);
  });

  test('false on plain text', () => {
    expect(isMarkActive('hello', 0, 5, 'bold')).toBe(false);
  });

  test('false when selection partially overlaps a mark', () => {
    // selection covers "**he" — partial wrapper, not a clean wrap
    expect(isMarkActive('**hello**', 0, 4, 'bold')).toBe(false);
  });

  test('strike active does not also mean sub active on ~~x~~', () => {
    expect(isMarkActive('~~x~~', 2, 3, 'strike')).toBe(true);
    expect(isMarkActive('~~x~~', 2, 3, 'sub')).toBe(false);
  });

  test('bold active does not also mean italic active on **x**', () => {
    expect(isMarkActive('**x**', 2, 3, 'bold')).toBe(true);
    expect(isMarkActive('**x**', 2, 3, 'italic')).toBe(false);
  });
});

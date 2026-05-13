import { describe, expect, it } from 'vitest';
import {
  extractCleanText,
  matchArticle,
  matchLetteredItem,
  matchRomanSection,
  matchUppercaseLetterSection,
} from './patterns';

describe('patterns', () => {
  describe('matchRomanSection', () => {
    it.each([
      'I',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIII',
      'IX',
      'X',
    ])('matches %s. at start', (numeral) => {
      const result = matchRomanSection(`${numeral}. Section Title`);
      expect(result.matched).toBe(true);
    });

    it.each([
      ['I. First Section', 'I.', 'First Section'],
      ['II. Second', 'II.', 'Second'],
      ['III. Section Three', 'III.', 'Section Three'],
      ['IV. Section Four', 'IV.', 'Section Four'],
      ['IX. Section Nine', 'IX.', 'Section Nine'],
      ['X. Last', 'X.', 'Last'],
    ])('extracts number from %s → number=%s, rest=%s', (input, expectedNumber, expectedRest) => {
      const result = matchRomanSection(input);
      expect(result.number).toBe(expectedNumber);
      expect(result.rest).toBe(expectedRest);
    });

    it('returns undefined number/rest for non-match', () => {
      const result = matchRomanSection('Not a roman section');
      expect(result.number).toBeUndefined();
      expect(result.rest).toBeUndefined();
    });

    it.each([
      ['Some text I. here', 'roman numeral in middle of text'],
      ['I First Section', 'roman numeral without period'],
      ['i. lowercase', 'lowercase roman numeral'],
    ])('does not match: %s (%s)', (input) => {
      const result = matchRomanSection(input);
      expect(result.matched).toBe(false);
    });
  });

  describe('matchArticle', () => {
    it.each([
      'Art. 1 Title',
      'Art. 12 Title',
      'Art. 12a Title',
      'Art. 1 Abs. 2 Title',
      '§ 5 Title',
      '§ 12 Title',
      'art. 1 lowercase',
      'Art. 46 b) Title',
      'Art. 3 a) Title',
      '§ 10 c) Title',
      'Art. 1 Abs. 2 c) Title',
    ])('matches: %s', (input) => {
      expect(matchArticle(input).matched).toBe(true);
    });

    it.each([
      ['Art. 1 Title', 'Art. 1', 'Title'],
      ['Art. 12 Title', 'Art. 12', 'Title'],
      ['Art. 12a Title', 'Art. 12a', 'Title'],
      ['Art. 1 Abs. 2 Title', 'Art. 1 Abs. 2', 'Title'],
      ['§ 5 Title', '§ 5', 'Title'],
      ['§ 12 Title', '§ 12', 'Title'],
      ['art. 1 lowercase', 'art. 1', 'lowercase'],
      ['Art. 46 b) Title', 'Art. 46 b)', 'Title'],
      ['Art. 3 a) First item', 'Art. 3 a)', 'First item'],
      ['§ 10 c) Some title', '§ 10 c)', 'Some title'],
      ['Art. 1 Abs. 2 c) Title', 'Art. 1 Abs. 2 c)', 'Title'],
      ['Art. 1', 'Art. 1', ''],
      ['§ 5', '§ 5', ''],
    ])('extracts number from %s → number=%s, rest=%s', (input, expectedNumber, expectedRest) => {
      const result = matchArticle(input);
      expect(result.number).toBe(expectedNumber);
      expect(result.rest).toBe(expectedRest);
    });

    it('returns undefined number/rest for non-match', () => {
      const result = matchArticle('Not an article');
      expect(result.number).toBeUndefined();
      expect(result.rest).toBeUndefined();
    });

    it.each([
      ['§ 29 Abs. 1 Bst. f', '§ 29 Abs. 1 Bst. f', ''],
      ['Art. 5 Abs. 2 Bst. a Some title', 'Art. 5 Abs. 2 Bst. a', 'Some title'],
    ])('extracts Bst. from %s → number=%s, rest=%s', (input, expectedNumber, expectedRest) => {
      const result = matchArticle(input);
      expect(result.matched).toBe(true);
      expect(result.number).toBe(expectedNumber);
      expect(result.rest).toBe(expectedRest);
    });

    it.each([
      ['Article 1 Some title', 'Article spelled out'],
      ['Art 1 No period', 'Art without period'],
      ['See Art. 5 for details', 'Art. in middle of text'],
    ])('does not match: %s (%s)', (input) => {
      expect(matchArticle(input).matched).toBe(false);
    });
  });

  describe('matchLetteredItem', () => {
    it.each([
      ['a. First item', 'a', 'First item'],
      ['b. Second item', 'b', 'Second item'],
      ['z. Last item', 'z', 'Last item'],
      ['c. Some longer content here', 'c', 'Some longer content here'],
    ])('matches %s → letter=%s, content=%s', (input, expectedLetter, expectedContent) => {
      const result = matchLetteredItem(input);
      expect(result.matched).toBe(true);
      expect(result.letter).toBe(expectedLetter);
      expect(result.content).toBe(expectedContent);
    });

    it.each([
      ['A. Uppercase', 'uppercase letter'],
      ['aa. Double letter', 'multiple letters'],
      ['a No period', 'missing period'],
      ['a.NoSpace', 'no space after period'],
      ['See item a. here', 'letter in middle of text'],
    ])('does not match: %s (%s)', (input) => {
      expect(matchLetteredItem(input).matched).toBe(false);
    });
  });

  describe('matchUppercaseLetterSection', () => {
    it.each([
      ['A. Allgemeines', 'A.', 'Allgemeines'],
      ['B. Übergangsrecht', 'B.', 'Übergangsrecht'],
      ['Z. Last section', 'Z.', 'Last section'],
    ])('extracts number from %s → number=%s, rest=%s', (input, expectedNumber, expectedRest) => {
      const result = matchUppercaseLetterSection(input);
      expect(result.matched).toBe(true);
      expect(result.number).toBe(expectedNumber);
      expect(result.rest).toBe(expectedRest);
    });

    it('returns undefined number/rest for non-match', () => {
      const result = matchUppercaseLetterSection('Not a letter section');
      expect(result.number).toBeUndefined();
      expect(result.rest).toBeUndefined();
    });

    it.each([
      ['a. lowercase', 'lowercase letter'],
      ['AB. Double letter', 'multiple letters'],
      ['A No period', 'missing period'],
      ['Middle A. text', 'letter in middle of text'],
    ])('does not match: %s (%s)', (input) => {
      expect(matchUppercaseLetterSection(input).matched).toBe(false);
    });
  });

  describe('extractCleanText', () => {
    it.each([
      ['<b>Bold</b> text', 'Bold text'],
      ['<p><b>Bold</b> and <i>italic</i></p>', 'Bold and italic'],
      ['Word&nbsp;another', 'Word another'],
      ['  some text  ', 'some text'],
      ['Plain text content', 'Plain text content'],
      ['', ''],
      ['<br><br>', ''],
    ])('extracts clean text from %j → %j', (input, expected) => {
      expect(extractCleanText(input)).toBe(expected);
    });

    // Issue #89: inline marks are now preserved as markdown source in content
    // nodes (from PR #75). The legal-transform matchers feed text through this
    // function, so well-formed markdown delimiters must be stripped here too —
    // otherwise headings like `**I.**` and `*Art. 1 Lorem ipsum*` never match.
    it.each([
      ['**bold**', 'bold'],
      ['*italic*', 'italic'],
      ['~~strike~~', 'strike'],
      ['~sub~', 'sub'],
      ['^sup^', 'sup'],
      ['**I.**', 'I.'],
      ['*Art. 1 Lorem ipsum*', 'Art. 1 Lorem ipsum'],
      ['**bold** and *italic*', 'bold and italic'],
      ['[label](https://example.com)', 'label'],
      ['<p><strong>**Mixed**</strong></p>', 'Mixed'],
    ])('strips markdown inline marks from %j → %j', (input, expected) => {
      expect(extractCleanText(input)).toBe(expected);
    });

    it('preserves unmatched delimiters (no false stripping)', () => {
      expect(extractCleanText('**unclosed')).toBe('**unclosed');
    });
  });
});

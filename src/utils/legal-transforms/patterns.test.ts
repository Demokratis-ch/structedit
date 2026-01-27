import { describe, expect, it } from 'vitest';
import { extractCleanText, matchArticle, matchLetteredItem, matchRomanSection } from './patterns';

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
    ])('matches: %s', (input) => {
      expect(matchArticle(input).matched).toBe(true);
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
  });
});

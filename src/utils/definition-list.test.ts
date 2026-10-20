import { describe, expect, it } from 'vitest';
import { parseDefinitionList, splitDefinition } from './definition-list';

describe('splitDefinition', () => {
  it('splits at a "::" surrounded by whitespace', () => {
    expect(splitDefinition('Bund :: Die Eidgenossenschaft')).toEqual([
      'Bund',
      'Die Eidgenossenschaft',
    ]);
  });

  it('accepts a tab as the surrounding whitespace', () => {
    expect(splitDefinition('Bund\t::\tStaat')).toEqual(['Bund', 'Staat']);
  });

  it('accepts a separator at a line boundary, yielding an empty side', () => {
    expect(splitDefinition(':: Staat')).toEqual(['', 'Staat']);
    expect(splitDefinition('Bund ::')).toEqual(['Bund', '']);
  });

  it('splits at the first separator only', () => {
    expect(splitDefinition('a :: b :: c')).toEqual(['a', 'b :: c']);
  });

  it('ignores a "::" without surrounding whitespace', () => {
    expect(splitDefinition('A::B')).toBeNull();
    expect(splitDefinition('A ::B')).toBeNull();
    expect(splitDefinition('A:: B')).toBeNull();
  });

  it('returns null for a line without a separator', () => {
    expect(splitDefinition('just text')).toBeNull();
  });
});

describe('parseDefinitionList', () => {
  it('returns one pair per line', () => {
    expect(parseDefinitionList('Bund :: Staat\nKanton :: Gliedstaat')).toEqual([
      ['Bund', 'Staat'],
      ['Kanton', 'Gliedstaat'],
    ]);
  });

  it('ignores blank lines and surrounding whitespace', () => {
    expect(parseDefinitionList('\n  Bund :: Staat  \n\nKanton :: Gliedstaat\n')).toEqual([
      ['Bund', 'Staat'],
      ['Kanton', 'Gliedstaat'],
    ]);
  });

  it('accepts Windows line endings', () => {
    expect(parseDefinitionList('a :: b\r\nc :: d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('returns null when any non-empty line is not a pair', () => {
    expect(parseDefinitionList('Bund :: Staat\nkein Paar')).toBeNull();
  });

  it('returns null when a side is empty', () => {
    expect(parseDefinitionList(':: Staat')).toBeNull();
    expect(parseDefinitionList('Bund ::')).toBeNull();
  });

  it('returns null for an empty source', () => {
    expect(parseDefinitionList('')).toBeNull();
    expect(parseDefinitionList('  \n ')).toBeNull();
  });

  it('keeps inline Markdown untouched in both sides', () => {
    expect(parseDefinitionList('**Bund** :: Der *Staat*')).toEqual([['**Bund**', 'Der *Staat*']]);
  });
});

/**
 * The "Term :: Value" syntax of a DEFINITION_LIST node, shared with the Demokratis platform.
 *
 * Mirrors `App\Domain\Markdown\DefinitionList\DefinitionListSyntax` and the paragraph rule of
 * `DefinitionListProcessor` in the Demokratis repo: the separator is a `::` surrounded by
 * whitespace (or a line boundary), each line splits at its first separator, and a block renders
 * as a definition list only when every line is a pair with content on both sides.
 */

/** Whitespace on both sides is required, so `A::B` is ordinary text. */
const SEPARATOR = /(?:^|[ \t])::(?:[ \t]|$)/;

/**
 * Split one line at its first separator into `[term, value]`, trimmed towards the separator.
 * Returns `null` when the line holds no separator. Either side may be empty (a separator at a
 * line boundary); callers decide whether that is acceptable.
 */
export function splitDefinition(line: string): [string, string] | null {
  const match = SEPARATOR.exec(line);
  if (!match) return null;
  const term = line.slice(0, match.index).trimEnd();
  const value = line.slice(match.index + match[0].length).trimStart();
  return [term, value];
}

/**
 * Parse a DEFINITION_LIST source into term/value pairs, one per non-empty line. Blank lines are
 * ignored. Returns `null` — "render as plain Markdown instead" — when the source is empty or any
 * line is not a pair with content on both sides, which is also what the platform falls back to.
 */
export function parseDefinitionList(source: string): Array<[string, string]> | null {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;

  const pairs: Array<[string, string]> = [];
  for (const line of lines) {
    const pair = splitDefinition(line);
    if (!pair || pair[0] === '' || pair[1] === '') return null;
    pairs.push(pair);
  }
  return pairs;
}

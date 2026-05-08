export type InlineMark = 'bold' | 'italic' | 'strike' | 'sup' | 'sub';

export interface ToggleResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  action: 'wrapped' | 'unwrapped' | 'noop';
}

interface MarkConfig {
  delim: string;
  shortFormOf?: 'bold' | 'strike';
}

const CONFIG: Record<InlineMark, MarkConfig> = {
  bold: { delim: '**' },
  italic: { delim: '*', shortFormOf: 'bold' },
  strike: { delim: '~~' },
  sup: { delim: '^' },
  sub: { delim: '~', shortFormOf: 'strike' },
};

interface Region {
  outerStart: number;
  innerStart: number;
  innerEnd: number;
  outerEnd: number;
}

// Single-char `*` and `~` runs of even length are owned by the long form
// (`**` / `~~`); only odd-run leftovers can serve as italic / sub delimiters.
// Mirrors the rendering precedence in format-render.ts (longer marks first).
function computeClaimedPositions(text: string, ch: string): boolean[] {
  const claimed = new Array<boolean>(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    if (text[i] !== ch) {
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && text[j] === ch) j++;
    const runLen = j - i;
    const evenPart = runLen - (runLen % 2);
    for (let k = i; k < i + evenPart; k++) claimed[k] = true;
    i = j;
  }
  return claimed;
}

function findWrapRegions(text: string, mark: InlineMark): Region[] {
  const cfg = CONFIG[mark];
  const delim = cfg.delim;
  const claimed: boolean[] = cfg.shortFormOf
    ? computeClaimedPositions(text, delim)
    : new Array<boolean>(text.length).fill(false);

  const regions: Region[] = [];
  let openPos = -1;
  let p = 0;
  while (p <= text.length - delim.length) {
    if (text.slice(p, p + delim.length) === delim) {
      let blocked = false;
      for (let k = p; k < p + delim.length; k++) {
        if (claimed[k]) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        if (openPos === -1) {
          openPos = p;
        } else {
          regions.push({
            outerStart: openPos,
            innerStart: openPos + delim.length,
            innerEnd: p,
            outerEnd: p + delim.length,
          });
          openPos = -1;
        }
        p += delim.length;
        continue;
      }
    }
    p++;
  }
  return regions;
}

// When the cursor is collapsed inside an existing wrap region we treat it as a
// selection of that region's inner span. Outside any region we fall back to the
// whole string (the "no selection → operate on entire field" rule from issue 81).
function normalizeSelection(
  text: string,
  start: number,
  end: number,
  regions: Region[]
): [number, number] {
  let s = start;
  let e = end;
  if (s > e) [s, e] = [e, s];
  s = Math.max(0, Math.min(s, text.length));
  e = Math.max(0, Math.min(e, text.length));
  if (s !== e) return [s, e];
  for (const r of regions) {
    if (s >= r.innerStart && s <= r.innerEnd) return [r.innerStart, r.innerEnd];
  }
  return [0, text.length];
}

function findEnclosingRegion(regions: Region[], s: number, e: number): Region | null {
  // Prefer an outer-exact match (selection covers delimiters), then inner-containing
  // (which subsumes the inner-exact case).
  for (const r of regions) {
    if (s === r.outerStart && e === r.outerEnd) return r;
  }
  for (const r of regions) {
    if (s >= r.innerStart && e <= r.innerEnd) return r;
  }
  return null;
}

export function isMarkActive(text: string, start: number, end: number, mark: InlineMark): boolean {
  if (text.length === 0) return false;
  const regions = findWrapRegions(text, mark);
  const [s, e] = normalizeSelection(text, start, end, regions);
  return findEnclosingRegion(regions, s, e) !== null;
}

/**
 * Toggle a markdown inline mark on the given range of `text`.
 *
 * Selection rules:
 * - A non-collapsed selection (`start !== end`) is treated literally.
 * - A collapsed cursor inside an existing wrap region of `mark` is treated as
 *   if that region's inner span were selected — clicking once unwraps that span.
 * - A collapsed cursor outside any region is treated as if the entire string
 *   were selected (matches issue 81's "no selection → whole field" rule).
 *
 * Mutual exclusion: `sup` and `sub` cannot coexist on the same span. Toggling
 * one while the other is active replaces the existing mark rather than nesting.
 *
 * Limitations: operates on the source string and does not repair malformed
 * input (unmatched delimiters survive verbatim).
 */
export function toggleMark(
  text: string,
  start: number,
  end: number,
  mark: InlineMark
): ToggleResult {
  if (text.length === 0) {
    return { text: '', selectionStart: 0, selectionEnd: 0, action: 'noop' };
  }
  // sup/sub mutual exclusion: if the user clicks one while the other (and only
  // the other) is active, swap them rather than nesting.
  if (mark === 'sup' || mark === 'sub') {
    const opposite: InlineMark = mark === 'sup' ? 'sub' : 'sup';
    if (!isMarkActive(text, start, end, mark) && isMarkActive(text, start, end, opposite)) {
      const unwrapped = toggleMark(text, start, end, opposite);
      return toggleMark(unwrapped.text, unwrapped.selectionStart, unwrapped.selectionEnd, mark);
    }
  }
  const regions = findWrapRegions(text, mark);
  const [s, e] = normalizeSelection(text, start, end, regions);
  const enclosing = findEnclosingRegion(regions, s, e);

  if (enclosing) {
    const delimLen = enclosing.innerStart - enclosing.outerStart;
    const innerText = text.slice(enclosing.innerStart, enclosing.innerEnd);
    const newText =
      text.slice(0, enclosing.outerStart) + innerText + text.slice(enclosing.outerEnd);

    let newStart: number;
    let newEnd: number;
    if (s === enclosing.outerStart && e === enclosing.outerEnd) {
      newStart = enclosing.outerStart;
      newEnd = enclosing.outerStart + innerText.length;
    } else {
      newStart = s - delimLen;
      newEnd = e - delimLen;
    }
    return { text: newText, selectionStart: newStart, selectionEnd: newEnd, action: 'unwrapped' };
  }

  const delim = CONFIG[mark].delim;
  const newText = text.slice(0, s) + delim + text.slice(s, e) + delim + text.slice(e);
  return {
    text: newText,
    selectionStart: s + delim.length,
    selectionEnd: e + delim.length,
    action: 'wrapped',
  };
}

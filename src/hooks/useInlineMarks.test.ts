import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { matchInlineMarkShortcut, useInlineMarks } from './useInlineMarks';

describe('matchInlineMarkShortcut', () => {
  const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

  test('maps Cmd/Ctrl+B/I/./, to the right marks', () => {
    expect(matchInlineMarkShortcut(ev({ key: 'b', ctrlKey: true }))).toBe('bold');
    expect(matchInlineMarkShortcut(ev({ key: 'i', metaKey: true }))).toBe('italic');
    expect(matchInlineMarkShortcut(ev({ key: '.', ctrlKey: true }))).toBe('sup');
    expect(matchInlineMarkShortcut(ev({ key: ',', metaKey: true }))).toBe('sub');
  });

  test('maps Alt+Shift+Digit5 to strike (layout-independent via code)', () => {
    expect(
      matchInlineMarkShortcut(ev({ key: '5', code: 'Digit5', altKey: true, shiftKey: true }))
    ).toBe('strike');
  });

  test('returns null when no shortcut matches', () => {
    expect(matchInlineMarkShortcut(ev({ key: 'a', ctrlKey: true }))).toBeNull();
    expect(matchInlineMarkShortcut(ev({ key: 'b' }))).toBeNull();
  });

  test('returns null when extra modifiers are pressed', () => {
    // Shift+Cmd+B is not a bold shortcut.
    expect(matchInlineMarkShortcut(ev({ key: 'b', ctrlKey: true, shiftKey: true }))).toBeNull();
    // Strike requires no ctrl/meta.
    expect(
      matchInlineMarkShortcut(
        ev({ key: '5', code: 'Digit5', altKey: true, shiftKey: true, ctrlKey: true })
      )
    ).toBeNull();
  });
});

/** Focus a contenteditable carrying the structedit dataset, with a selection. */
const focusEditable = (text: string, format: string, selStart = 0, selEnd = text.length) => {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.dataset.structeditNodeId = 'n1';
  el.dataset.structeditFormat = format;
  el.textContent = text;
  document.body.appendChild(el);
  el.focus();
  const range = document.createRange();
  range.setStart(el.firstChild as Text, selStart);
  range.setEnd(el.firstChild as Text, selEnd);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  return el;
};

describe('useInlineMarks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('derives the contenteditable target, format, and active marks from the selection', () => {
    const updateNodeNumber = vi.fn();
    const { result } = renderHook(() => useInlineMarks({ updateNodeNumber }));

    act(() => {
      focusEditable('**hello**', 'MARKDOWN_MINIMAL');
    });

    expect(result.current.inlineMarks.target).toBe('contenteditable');
    expect(result.current.inlineMarks.format).toBe('MARKDOWN_MINIMAL');
    // The whole `**hello**` is selected, so bold reads as active.
    expect(result.current.inlineMarks.active.bold).toBe(true);
  });

  test('reports a null target when nothing is focused', () => {
    const updateNodeNumber = vi.fn();
    const { result } = renderHook(() => useInlineMarks({ updateNodeNumber }));

    expect(result.current.inlineMarks.target).toBeNull();
  });

  test('handleToggleMark wraps the selected text and fires an input event', () => {
    const updateNodeNumber = vi.fn();
    const { result } = renderHook(() => useInlineMarks({ updateNodeNumber }));

    let el: HTMLElement | undefined;
    act(() => {
      el = focusEditable('hello', 'MARKDOWN_MINIMAL');
    });

    const onInput = vi.fn();
    el!.addEventListener('input', onInput);

    act(() => {
      result.current.handleToggleMark('bold');
    });

    expect(el!.textContent).toBe('**hello**');
    expect(onInput).toHaveBeenCalled();
  });
});

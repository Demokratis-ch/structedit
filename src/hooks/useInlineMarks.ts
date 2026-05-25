import { useCallback, useEffect, useMemo } from 'react';
import { FORMATS_WITH_MARKS } from '../components/FloatingToolbar';
import type { NodeFormat } from '../types/document';
import { type InlineMark, isMarkActive, toggleMark } from '../utils/inline-mark';
import { useActiveTextSelection } from './useActiveTextSelection';

const ALL_MARKS: readonly InlineMark[] = ['bold', 'italic', 'strike', 'sup', 'sub'];

// Native value setter for HTMLInputElement — required to mutate a React-managed
// input's value while still firing React's synthetic onChange. Falls back to
// direct assignment for environments without a descriptor.
const INPUT_VALUE_SETTER = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
)?.set;
function setInputValue(el: HTMLInputElement, value: string) {
  if (INPUT_VALUE_SETTER) INPUT_VALUE_SETTER.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Google Docs–style keyboard shortcuts: Cmd/Ctrl+B/I/./, and Alt+Shift+5.
 * Returns the matched mark, or null if no shortcut applies. Pure — exported so
 * it can be unit-tested without a DOM.
 */
export const matchInlineMarkShortcut = (e: KeyboardEvent): InlineMark | null => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.shiftKey && !e.altKey) {
    if (key === 'b') return 'bold';
    if (key === 'i') return 'italic';
    if (key === '.') return 'sup';
    if (key === ',') return 'sub';
  }
  // Strikethrough: Alt+Shift+5. Use `code` so non-US keyboard layouts still
  // match the digit-5 key (Alt+Shift can produce non-digit `key` values).
  if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'Digit5') {
    return 'strike';
  }
  return null;
};

interface UseInlineMarksParams {
  /** Commit a node's number change directly (the number input is uncontrolled). */
  updateNodeNumber: (id: string, number: string | null) => void;
}

/** Derived inline-mark state, shaped for the FloatingToolbar props. */
export interface InlineMarksState {
  target: null | 'contenteditable' | 'input-number';
  format: NodeFormat | undefined;
  active: Partial<Record<InlineMark, boolean>>;
}

/**
 * The inline-mark subsystem: tracks the active text selection (contenteditable
 * or number input), derives toolbar state, toggles marks, and installs the
 * global keyboard-shortcut listener (Cmd+B etc.). Marks are applied only for
 * formats in {@link FORMATS_WITH_MARKS}.
 */
export function useInlineMarks({ updateNodeNumber }: UseInlineMarksParams) {
  const activeSelection = useActiveTextSelection();

  const inlineMarks = useMemo<InlineMarksState>(() => {
    // Recomputed whenever activeSelection.version bumps (selectionchange / focus).
    void activeSelection.version;
    const sel = activeSelection.get();
    if (!sel) {
      return { target: null, format: undefined, active: {} };
    }
    const target = sel.kind === 'input' ? 'input-number' : 'contenteditable';
    const format: NodeFormat = sel.kind === 'input' ? 'MARKDOWN_MINIMAL' : sel.format;
    const active: Partial<Record<InlineMark, boolean>> = {};
    for (const mark of ALL_MARKS) {
      active[mark] = isMarkActive(sel.text, sel.start, sel.end, mark);
    }
    return { target, format, active };
  }, [activeSelection]);

  const handleToggleMark = useCallback(
    (mark: InlineMark) => {
      const sel = activeSelection.get();
      if (!sel) return;
      const next = toggleMark(sel.text, sel.start, sel.end, mark);
      if (next.action === 'noop') return;
      if (sel.kind === 'input') {
        setInputValue(sel.el, next.text);
        sel.el.setSelectionRange(next.selectionStart, next.selectionEnd);
        // The number input is uncontrolled (defaultValue + onBlur). Commit the
        // change to the tree directly so a toggle doesn't get lost if the user
        // takes a non-blurring action next (e.g. undo, click another button).
        updateNodeNumber(sel.nodeId, next.text === '' ? null : next.text);
      } else {
        sel.el.textContent = next.text;
        sel.el.dispatchEvent(new Event('input', { bubbles: true }));
        const textNode = sel.el.firstChild;
        if (textNode) {
          const range = window.document.createRange();
          range.setStart(textNode, Math.min(next.selectionStart, next.text.length));
          range.setEnd(textNode, Math.min(next.selectionEnd, next.text.length));
          const winSel = window.getSelection();
          winSel?.removeAllRanges();
          winSel?.addRange(range);
        }
      }
    },
    [activeSelection, updateNodeNumber]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mark = matchInlineMarkShortcut(e);
      if (!mark) return;
      const sel = activeSelection.get();
      if (!sel) return;
      const format: NodeFormat = sel.kind === 'input' ? 'MARKDOWN_MINIMAL' : sel.format;
      if (!FORMATS_WITH_MARKS.includes(format)) return;
      e.preventDefault();
      e.stopPropagation();
      handleToggleMark(mark);
    };
    document.addEventListener('keydown', handler, { capture: true });
    return () => {
      document.removeEventListener('keydown', handler, { capture: true });
    };
  }, [activeSelection, handleToggleMark]);

  return { inlineMarks, handleToggleMark };
}

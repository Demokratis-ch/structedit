import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { useActiveTextSelection } from './useActiveTextSelection';

afterEach(() => {
  // Clean up any leftover DOM nodes between tests.
  document.body.innerHTML = '';
});

describe('useActiveTextSelection.get()', () => {
  test('returns null when nothing is focused', () => {
    const { result } = renderHook(() => useActiveTextSelection());
    expect(result.current.get()).toBeNull();
  });

  test('returns kind="input" with field="number" + nodeId when number input is focused', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '1.2';
    input.setAttribute('data-structedit-field', 'number');
    input.setAttribute('data-structedit-node-id', 'node-7');
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(1, 3);

    const { result } = renderHook(() => useActiveTextSelection());
    const sel = result.current.get();

    expect(sel).not.toBeNull();
    expect(sel?.kind).toBe('input');
    if (sel?.kind === 'input') {
      expect(sel.field).toBe('number');
      expect(sel.nodeId).toBe('node-7');
      expect(sel.text).toBe('1.2');
      expect(sel.start).toBe(1);
      expect(sel.end).toBe(3);
      expect(sel.el).toBe(input);
    }
  });

  test('returns null when an input is focused but lacks the data-structedit-field marker', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();

    const { result } = renderHook(() => useActiveTextSelection());
    expect(result.current.get()).toBeNull();
  });

  test('returns null when number input lacks the data-structedit-node-id marker', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-structedit-field', 'number');
    document.body.appendChild(input);
    input.focus();

    const { result } = renderHook(() => useActiveTextSelection());
    expect(result.current.get()).toBeNull();
  });

  test('returns kind="contenteditable" when an editable element is focused', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.setAttribute('data-structedit-node-id', 'node-42');
    div.setAttribute('data-structedit-format', 'MARKDOWN_MINIMAL');
    div.textContent = 'hello world';
    document.body.appendChild(div);
    div.focus();

    const range = document.createRange();
    range.setStart(div.firstChild as Text, 6);
    range.setEnd(div.firstChild as Text, 11);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const { result } = renderHook(() => useActiveTextSelection());
    const active = result.current.get();

    expect(active).not.toBeNull();
    expect(active?.kind).toBe('contenteditable');
    if (active?.kind === 'contenteditable') {
      expect(active.text).toBe('hello world');
      expect(active.start).toBe(6);
      expect(active.end).toBe(11);
      expect(active.nodeId).toBe('node-42');
      expect(active.format).toBe('MARKDOWN_MINIMAL');
      expect(active.el).toBe(div);
    }
  });

  test('returns null when contenteditable lacks the node-id marker', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.textContent = 'hi';
    document.body.appendChild(div);
    div.focus();

    const { result } = renderHook(() => useActiveTextSelection());
    expect(result.current.get()).toBeNull();
  });

  test('version increments when a selectionchange event fires', () => {
    const { result } = renderHook(() => useActiveTextSelection());
    const before = result.current.version;
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(result.current.version).toBeGreaterThan(before);
  });

  test('treats a collapsed selection at offset N as start === end === N', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'abc';
    input.setAttribute('data-structedit-field', 'number');
    input.setAttribute('data-structedit-node-id', 'n');
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(2, 2);

    const { result } = renderHook(() => useActiveTextSelection());
    const sel = result.current.get();
    expect(sel?.kind).toBe('input');
    if (sel?.kind === 'input') {
      expect(sel.start).toBe(2);
      expect(sel.end).toBe(2);
    }
  });
});

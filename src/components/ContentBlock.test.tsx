import { render } from '@testing-library/react';
import type React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { ContentBlock } from './ContentBlock';

const defaultProps = {
  raw: 'Hello',
  format: 'TEXT' as const,
  tagName: 'div',
  className: 'test-class',
  disabled: true,
  blockId: 'block-1',
  blockRefs: { current: {} } as React.MutableRefObject<{ [key: string]: HTMLElement | null }>,
  onChange: vi.fn(),
  onKeyDown: vi.fn(),
  onFocus: vi.fn(),
};

describe('ContentBlock memoization', () => {
  test('is wrapped in React.memo', () => {
    expect((ContentBlock as any).$$typeof).toBe(Symbol.for('react.memo'));
  });

  test('custom comparator skips re-render when only function props change', () => {
    const compare = (ContentBlock as any).compare as (a: any, b: any) => boolean;
    expect(compare).toBeDefined();

    const prev = { ...defaultProps };
    const next = { ...defaultProps, onChange: vi.fn(), onKeyDown: vi.fn(), onFocus: vi.fn() };
    expect(compare(prev, next)).toBe(true);
  });

  test('custom comparator triggers re-render when raw changes', () => {
    const compare = (ContentBlock as any).compare as (a: any, b: any) => boolean;
    const prev = { ...defaultProps };
    const next = { ...defaultProps, raw: 'Changed' };
    expect(compare(prev, next)).toBe(false);
  });

  test('custom comparator triggers re-render when format changes', () => {
    const compare = (ContentBlock as any).compare as (a: any, b: any) => boolean;
    const prev = { ...defaultProps };
    const next = { ...defaultProps, format: 'MARKDOWN' as const };
    expect(compare(prev, next)).toBe(false);
  });

  test('custom comparator triggers re-render when disabled changes', () => {
    const compare = (ContentBlock as any).compare as (a: any, b: any) => boolean;
    const prev = { ...defaultProps };
    const next = { ...defaultProps, disabled: false };
    expect(compare(prev, next)).toBe(false);
  });

  test('custom comparator triggers re-render when className changes', () => {
    const compare = (ContentBlock as any).compare as (a: any, b: any) => boolean;
    const prev = { ...defaultProps };
    const next = { ...defaultProps, className: 'different-class' };
    expect(compare(prev, next)).toBe(false);
  });

  test('custom comparator triggers re-render when tagName changes', () => {
    const compare = (ContentBlock as any).compare as (a: any, b: any) => boolean;
    const prev = { ...defaultProps };
    const next = { ...defaultProps, tagName: 'h1' };
    expect(compare(prev, next)).toBe(false);
  });
});

describe('ContentBlock — non-editing display path', () => {
  test('renders rendered HTML for TEXT format (escapes html)', () => {
    const { container } = render(
      <ContentBlock {...defaultProps} raw={'a <b>x</b>'} format="TEXT" disabled />
    );
    const inner = container.querySelector('div')?.innerHTML ?? '';
    expect(inner).toContain('&lt;b&gt;');
    expect(inner).not.toContain('<b>x</b>');
  });

  test('renders rendered HTML for MARKDOWN_MINIMAL format (bold)', () => {
    const { container } = render(
      <ContentBlock {...defaultProps} raw={'**hi**'} format="MARKDOWN_MINIMAL" disabled />
    );
    const inner = container.querySelector('div')?.innerHTML ?? '';
    expect(inner).toContain('<strong>hi</strong>');
  });

  test('renders rendered HTML for MARKDOWN format (full paragraph)', () => {
    const { container } = render(
      <ContentBlock {...defaultProps} raw={'**hi**'} format="MARKDOWN" disabled />
    );
    const inner = container.querySelector('div')?.innerHTML ?? '';
    expect(inner).toContain('<strong>hi</strong>');
  });
});

describe('ContentBlock — editing path stores raw source', () => {
  test('shows literal markdown source while editing MARKDOWN content', () => {
    const { container } = render(
      <ContentBlock {...defaultProps} raw={'**hi**'} format="MARKDOWN" disabled={false} />
    );
    const inner = container.querySelector('div');
    expect(inner?.textContent).toBe('**hi**');
    // Critical: editing surface must NOT contain a real <strong> tag
    expect(inner?.querySelector('strong')).toBeNull();
  });

  test('shows raw text for TEXT format while editing', () => {
    const { container } = render(
      <ContentBlock {...defaultProps} raw={'<b>x</b>'} format="TEXT" disabled={false} />
    );
    const inner = container.querySelector('div');
    expect(inner?.textContent).toBe('<b>x</b>');
    expect(inner?.querySelector('b')).toBeNull();
  });
});

describe('ContentBlock — switching formats does not mutate stored content', () => {
  test('rerendering with a different format keeps the same raw passed in', () => {
    const onChange = vi.fn();
    const { rerender, container } = render(
      <ContentBlock {...defaultProps} raw={'**bold**'} format="TEXT" disabled onChange={onChange} />
    );
    expect(container.querySelector('div')?.innerHTML).toContain('**bold**');

    rerender(
      <ContentBlock
        {...defaultProps}
        raw={'**bold**'}
        format="MARKDOWN"
        disabled
        onChange={onChange}
      />
    );
    expect(container.querySelector('div')?.innerHTML).toContain('<strong>bold</strong>');

    // ContentBlock never calls onChange itself — switching format mustn't trigger it.
    expect(onChange).not.toHaveBeenCalled();
  });
});

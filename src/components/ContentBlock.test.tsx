import { render } from '@testing-library/react';
import type React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { ContentBlock } from './ContentBlock';

const defaultProps = {
  html: '<p>Hello</p>',
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
    // React.memo components have $$typeof === Symbol.for('react.memo')
    expect((ContentBlock as any).$$typeof).toBe(Symbol.for('react.memo'));
  });

  test('custom comparator skips re-render when only function props change', () => {
    // Access the custom compare function from the memo wrapper
    const compare = (ContentBlock as any).compare as (a: any, b: any) => boolean;
    expect(compare).toBeDefined();

    const prev = { ...defaultProps };
    const next = { ...defaultProps, onChange: vi.fn(), onKeyDown: vi.fn(), onFocus: vi.fn() };
    expect(compare(prev, next)).toBe(true);
  });

  test('custom comparator triggers re-render when html changes', () => {
    const compare = (ContentBlock as any).compare as (a: any, b: any) => boolean;
    const prev = { ...defaultProps };
    const next = { ...defaultProps, html: '<p>Changed</p>' };
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

  test('renders content correctly', () => {
    const { container } = render(<ContentBlock {...defaultProps} />);
    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('div')?.innerHTML).toBe('<p>Hello</p>');
  });
});

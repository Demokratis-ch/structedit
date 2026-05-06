import type React from 'react';
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import type { NodeFormat } from '../types/document';
import { renderContent } from '../utils/format-render';

interface ContentBlockProps {
  raw: string;
  format: NodeFormat;
  tagName: string;
  className: string;
  onChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  disabled: boolean;
  blockId: string;
  blockRefs: React.MutableRefObject<{ [key: string]: HTMLElement | null }>;
}

export const ContentBlock = memo(
  ({
    raw,
    format,
    tagName,
    className,
    onChange,
    onKeyDown,
    onFocus,
    disabled,
    blockId,
    blockRefs,
  }: ContentBlockProps) => {
    const elRef = useRef<HTMLElement>(null);

    useEffect(() => {
      const el = elRef.current;
      if (el) {
        blockRefs.current[blockId] = el;
      }
      return () => {
        if (blockRefs.current && blockRefs.current[blockId] === el) {
          delete blockRefs.current[blockId];
        }
      };
    }, [blockId, blockRefs, tagName]);

    // Editing path: write the raw source into the element as text (preserves \n via
    // white-space: pre-wrap on the editable). Display path: write rendered HTML once.
    useLayoutEffect(() => {
      const el = elRef.current;
      if (!el) return;
      if (disabled) {
        const html = renderContent(raw, format);
        if (el.innerHTML !== html) el.innerHTML = html;
      } else {
        if (el.textContent !== raw) el.textContent = raw;
      }
    }, [raw, format, disabled, tagName]);

    const handleInput = (e: React.FormEvent<HTMLElement>) => {
      // While editing we always feed back the raw text content (which preserves \n).
      onChange(e.currentTarget.textContent ?? '');
    };

    const Tag = tagName as any;

    // Tailwind preflight zeroes out user-agent styles for h1/ul/a/etc., and the
    // base-typography rule in index.css skips elements inside `text-*` utilities
    // (which the rendered tree always is). Tag the host with `markdown-rendered`
    // when in display mode for a markdown-block format so a scoped stylesheet
    // can restore heading sizes, list markers, and link styling.
    const wantsMarkdownTypography =
      disabled && (format === 'MARKDOWN' || format === 'MARKDOWN_INLINE');
    const finalClassName = wantsMarkdownTypography ? `${className} markdown-rendered` : className;

    // Editing always uses pre-wrap so user-typed `\n` shows as a real break.
    // Markdown display uses `normal` because marked emits `\n` between block tags
    // (e.g. `</h1>\n<ul>\n<li>...`); pre-wrap would render each as a visible blank
    // line on top of the elements' own margins. Block-level structure handles
    // layout there. TEXT/NEWLINES display still needs pre-wrap so newlines in
    // those formats survive into rendered text.
    const whiteSpace: 'pre-wrap' | 'normal' = wantsMarkdownTypography ? 'normal' : 'pre-wrap';

    return (
      <Tag
        ref={elRef}
        className={finalClassName}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        suppressContentEditableWarning
        spellCheck={false}
        style={{ whiteSpace }}
      />
    );
  },
  (prev, next) =>
    prev.raw === next.raw &&
    prev.format === next.format &&
    prev.disabled === next.disabled &&
    prev.className === next.className &&
    prev.tagName === next.tagName &&
    prev.blockId === next.blockId
);

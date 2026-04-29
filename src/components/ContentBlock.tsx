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

    return (
      <Tag
        ref={elRef}
        className={className}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        suppressContentEditableWarning
        spellCheck={false}
        style={{ whiteSpace: 'pre-wrap' }}
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

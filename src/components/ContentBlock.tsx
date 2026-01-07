import React, { useRef, useEffect, useLayoutEffect } from 'react';

interface ContentBlockProps {
  html: string;
  tagName: string;
  className: string;
  onChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  disabled: boolean;
  blockId: string;
  blockRefs: React.MutableRefObject<{ [key: string]: HTMLElement | null }>;
}

export const ContentBlock = ({ 
  html, 
  tagName, 
  className, 
  onChange, 
  onKeyDown, 
  onFocus, 
  disabled,
  blockId,
  blockRefs
}: ContentBlockProps) => {
  const contentEditableRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = contentEditableRef.current;
    if (el) {
      blockRefs.current[blockId] = el;
    }
    return () => {
      if (blockRefs.current && blockRefs.current[blockId] === el) {
        delete blockRefs.current[blockId];
      }
    };
  }, [blockId, blockRefs, tagName]);

  useLayoutEffect(() => {
    if (contentEditableRef.current && contentEditableRef.current.innerHTML !== html) {
      contentEditableRef.current.innerHTML = html;
    }
  }, [html, tagName]);

  const handleInput = (e: React.FormEvent<HTMLElement>) => {
    onChange(e.currentTarget.innerHTML);
  };

  const Tag = tagName as any;

  return (
    <Tag
      ref={contentEditableRef}
      className={className}
      contentEditable={!disabled}
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      suppressContentEditableWarning
      spellCheck={false}
    />
  );
};

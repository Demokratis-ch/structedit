import { renderContent } from '../utils/format-render';

/**
 * The `number` field on document nodes is always rendered through the
 * MARKDOWN_MINIMAL pipeline — superscript / bold / italic / etc. are explicit
 * formatting decisions the user encodes in the source string (e.g. `^1^` for
 * superscript, `**1**` for bold), never automatic presentation.
 */
export function NumberMarkup({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderContent sanitizes via DOMPurify
      dangerouslySetInnerHTML={{ __html: renderContent(value, 'MARKDOWN_MINIMAL') }}
    />
  );
}

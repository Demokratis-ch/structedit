import { describe, expect, it } from 'vitest';
import {
  type ContainerDocumentNode,
  type ContentDocumentNode,
  DOC_TREE_VERSION,
  type DocumentNode,
  type HeadingDocumentNode,
  isValidDocTreeEnvelope,
  type LeafDocumentNode,
} from '../types/document';
import {
  buildDocTreeEnvelope,
  deriveJsonFilename,
  detectLanguage,
  generateId,
  parseHtmlLegalToTree,
  parseHtmlToTree,
  preserveListStyleType,
} from './document-utils';

describe('deriveJsonFilename', () => {
  it('replaces the file extension with .json', () => {
    expect(deriveJsonFilename('entwurf.docx')).toBe('entwurf.json');
    expect(deriveJsonFilename('my file.pdf')).toBe('my file.json');
    expect(deriveJsonFilename('archive.tar.gz')).toBe('archive.tar.json');
  });

  it('returns document.json when filename is null or undefined', () => {
    expect(deriveJsonFilename(null)).toBe('document.json');
    expect(deriveJsonFilename(undefined)).toBe('document.json');
  });
});

describe('buildDocTreeEnvelope', () => {
  const tree: ContainerDocumentNode = {
    id: 'root',
    number: null,
    type: 'document',
    children: [
      {
        id: 'h1',
        number: '1',
        type: 'heading',
        format: 'TEXT',
        contents: { de: 'Einleitung' },
        children: [],
      },
    ],
  };

  it('wraps the tree with DocTreeVersion and the unchanged document', () => {
    const envelope = buildDocTreeEnvelope(tree, { language: 'de', filename: 'entwurf.docx' });
    expect(envelope.DocTreeVersion).toBe(DOC_TREE_VERSION);
    expect(envelope.document).toBe(tree);
  });

  it('strips the extension and stores the title under the current language', () => {
    expect(buildDocTreeEnvelope(tree, { language: 'de', filename: 'entwurf.docx' })).toMatchObject({
      metadata: { title: { de: 'entwurf' } },
    });
    expect(buildDocTreeEnvelope(tree, { language: 'en', filename: 'my file.pdf' })).toMatchObject({
      metadata: { title: { en: 'my file' } },
    });
  });

  it('strips only the final extension (matching deriveJsonFilename semantics)', () => {
    expect(
      buildDocTreeEnvelope(tree, { language: 'de', filename: 'archive.tar.gz' })
    ).toMatchObject({ metadata: { title: { de: 'archive.tar' } } });
  });

  it('emits an empty title map when filename is null, undefined, or empty', () => {
    expect(buildDocTreeEnvelope(tree, { language: 'de', filename: null }).metadata.title).toEqual(
      {}
    );
    expect(
      buildDocTreeEnvelope(tree, { language: 'de', filename: undefined }).metadata.title
    ).toEqual({});
    expect(buildDocTreeEnvelope(tree, { language: 'de', filename: '' }).metadata.title).toEqual({});
  });

  it('emits an empty title map when the stripped filename is whitespace-only', () => {
    expect(
      buildDocTreeEnvelope(tree, { language: 'de', filename: '   .docx' }).metadata.title
    ).toEqual({});
  });

  it('produces an envelope that passes isValidDocTreeEnvelope', () => {
    const envelope = buildDocTreeEnvelope(tree, { language: 'de', filename: 'entwurf.docx' });
    expect(isValidDocTreeEnvelope(envelope)).toBe(true);
  });
});

describe('Document Utils', () => {
  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('generates string IDs', () => {
      expect(typeof generateId()).toBe('string');
    });
  });

  describe('detectLanguage', () => {
    it('returns de by default', () => {
      expect(detectLanguage()).toBe('de');
    });

    it('returns de when given text', () => {
      expect(detectLanguage('some text')).toBe('de');
    });
  });

  describe('preserveListStyleType', () => {
    it('converts list-style-type CSS to data attribute', () => {
      const html = `<li style="list-style-type: 'a) ';">First</li>`;
      const result = preserveListStyleType(html);
      expect(result).toContain('data-list-style-type="a)"');
      expect(result).not.toContain('style=');
    });

    it('handles multiple list items with different styles', () => {
      const html = `<ol>
<li style="list-style-type: 'a) ';">First</li>
<li style="list-style-type: 'b) ';">Second</li>
<li style="list-style-type: 'c) ';">Third</li>
</ol>`;
      const result = preserveListStyleType(html);
      expect(result).toContain('data-list-style-type="a)"');
      expect(result).toContain('data-list-style-type="b)"');
      expect(result).toContain('data-list-style-type="c)"');
    });

    it('leaves li elements without list-style-type unchanged', () => {
      const html = '<li>No style</li>';
      const result = preserveListStyleType(html);
      expect(result).toBe('<li>No style</li>');
    });

    it('handles double-quoted CSS values', () => {
      const html = `<li style='list-style-type: "1. ";'>First</li>`;
      const result = preserveListStyleType(html);
      expect(result).toContain('data-list-style-type="1."');
    });
  });

  describe('parseHtmlToTree', () => {
    it('creates document root', () => {
      const html = '<p>Hello</p>';
      const doc = parseHtmlToTree(html);
      expect(doc.type).toBe('document');
      expect(doc.id).toBeDefined();
      expect(doc.children).toBeDefined();
    });

    it('converts h1 to heading at depth 0', () => {
      const html = '<h1>Title</h1>';
      const doc = parseHtmlToTree(html);
      expect(doc.children.length).toBe(1);
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
      expect(heading.contents.de).toBe('Title');
    });

    it('converts h2 to heading nested under previous h1', () => {
      const html = '<h1>Chapter 1</h1><h2>Section 1.1</h2>';
      const doc = parseHtmlToTree(html);
      // h1 should be at root level
      expect(doc.children.length).toBe(1);
      const h1 = doc.children[0] as HeadingDocumentNode;
      expect(h1.type).toBe('heading');
      expect(h1.contents.de).toBe('Chapter 1');
      // h2 should be nested under h1
      expect(h1.children.length).toBe(1);
      const h2 = h1.children[0] as HeadingDocumentNode;
      expect(h2.type).toBe('heading');
      expect(h2.contents.de).toBe('Section 1.1');
    });

    it('converts h3 to heading nested under previous h2', () => {
      const html = '<h1>Chapter</h1><h2>Section</h2><h3>Subsection</h3>';
      const doc = parseHtmlToTree(html);
      const h1 = doc.children[0] as HeadingDocumentNode;
      const h2 = h1.children[0] as HeadingDocumentNode;
      const h3 = h2.children[0] as HeadingDocumentNode;
      expect(h3.type).toBe('heading');
      expect(h3.contents.de).toBe('Subsection');
    });

    it('converts p to content node', () => {
      const html = '<p>Some text</p>';
      const doc = parseHtmlToTree(html);
      expect(doc.children.length).toBe(1);
      const content = doc.children[0] as LeafDocumentNode;
      expect(content.type).toBe('content');
      expect(content.contents.de).toBe('Some text');
    });

    it('nests content under preceding heading', () => {
      const html = '<h1>Title</h1><p>Paragraph under title</p>';
      const doc = parseHtmlToTree(html);
      const h1 = doc.children[0] as HeadingDocumentNode;
      expect(h1.children.length).toBe(1);
      const content = h1.children[0] as LeafDocumentNode;
      expect(content.type).toBe('content');
      expect(content.contents.de).toBe('Paragraph under title');
    });

    it('converts ul to list with list_item children', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const doc = parseHtmlToTree(html);
      expect(doc.children.length).toBe(1);
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      expect(list.children.length).toBe(2);
      const item1 = list.children[0] as ContainerDocumentNode;
      expect(item1.type).toBe('list_item');
      expect(item1.number).toBeNull(); // ul has no numbering
      // Content is now in a child content node
      const item1Content = item1.children[0] as LeafDocumentNode;
      expect(item1Content.type).toBe('content');
      expect(item1Content.contents.de).toBe('Item 1');
    });

    it('converts ol with numbering in number field', () => {
      const html = '<ol><li>First</li><li>Second</li></ol>';
      const doc = parseHtmlToTree(html);
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      const item1 = list.children[0] as ContainerDocumentNode;
      expect(item1.type).toBe('list_item');
      expect(item1.number).toBe('1.');
      // Content is now in a child content node
      const item1Content = item1.children[0] as LeafDocumentNode;
      expect(item1Content.type).toBe('content');
      const item2 = list.children[1] as ContainerDocumentNode;
      expect(item2.number).toBe('2.');
    });

    it('uses list-style-type for numbering when present', () => {
      const html = `<ol>
<li style="list-style-type: 'a) ';">First item</li>
<li style="list-style-type: 'b) ';">Second item</li>
<li style="list-style-type: 'c) ';">Third item</li>
</ol>`;
      const doc = parseHtmlToTree(html);
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      const item1 = list.children[0] as ContainerDocumentNode;
      expect(item1.number).toBe('a)');
      const item2 = list.children[1] as ContainerDocumentNode;
      expect(item2.number).toBe('b)');
      const item3 = list.children[2] as ContainerDocumentNode;
      expect(item3.number).toBe('c)');
    });

    it('converts nested ol lists into nested list structure', () => {
      const html = `<ol>
        <li>Dieser Erlass regelt das Bildungswesen in der Volksschule.</li>
        <li>Er gilt für:
            <ol>
                <li>die öffentliche Volksschule; </li>
                <li>die Sonderschulen;</li>
                <li>die Spitalschulen und die Schulen in Zentren des Asylbereichs; </li>
                <li>die Privatschulen.</li>
            </ol>
        </li>
        <li>Er regelt zudem die schulpsychologische Versorgung im Bereich der Volksschule und die <br />ergänzenden Angebote.</li>
      </ol>`;
      const doc = parseHtmlToTree(html);
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      expect(list.children.length).toBe(3);

      // Second item should have content + nested list
      const item2 = list.children[1] as ContainerDocumentNode;
      expect(item2.type).toBe('list_item');
      expect(item2.children.length).toBe(2); // content + nested list

      const item2Content = item2.children[0] as ContentDocumentNode;
      expect(item2Content.type).toBe('content');
      expect(item2Content.contents.de).toContain('Er gilt für:');

      const nestedList = item2.children[1] as ContainerDocumentNode;
      expect(nestedList.type).toBe('list');
      expect(nestedList.children.length).toBe(4);

      const nestedItem1 = nestedList.children[0] as ContainerDocumentNode;
      expect(nestedItem1.type).toBe('list_item');
      expect(nestedItem1.number).toBe('1.');
      const nestedItem1Content = nestedItem1.children[0] as ContentDocumentNode;
      expect(nestedItem1Content.type).toBe('content');
      expect(nestedItem1Content.contents.de).toContain('die öffentliche Volksschule');
    });

    it('strips inline formatting when chosen format is TEXT (no inline marks present)', () => {
      const html = '<p>Plain words only</p>';
      const doc = parseHtmlToTree(html);
      const content = doc.children[0] as ContentDocumentNode;
      expect(content.format).toBe('TEXT');
      expect(content.contents.de).toBe('Plain words only');
    });

    it('preserves <sup> in list item content as MARKDOWN', () => {
      const html = '<ol><li><sup>1</sup> Dieser Erlass regelt das Bildungswesen.</li></ol>';
      const doc = parseHtmlToTree(html);
      const list = doc.children[0] as ContainerDocumentNode;
      const item = list.children[0] as ContainerDocumentNode;
      const content = item.children[0] as ContentDocumentNode;
      expect(content.type).toBe('content');
      expect(content.format).toBe('MARKDOWN');
      expect(content.contents.de).toBe('^1^ Dieser Erlass regelt das Bildungswesen.');
    });

    describe('format selection per spec D8 / importer scenarios', () => {
      it('Plain heading imports as TEXT format', () => {
        const doc = parseHtmlToTree('<h1>Intro</h1>');
        const heading = doc.children[0] as HeadingDocumentNode;
        expect(heading.type).toBe('heading');
        expect(heading.format).toBe('TEXT');
        expect(heading.contents.de).toBe('Intro');
      });

      it('Heading with bold imports as MARKDOWN_MINIMAL', () => {
        const doc = parseHtmlToTree('<h1>The <strong>big</strong> intro</h1>');
        const heading = doc.children[0] as HeadingDocumentNode;
        expect(heading.format).toBe('MARKDOWN_MINIMAL');
        expect(heading.contents.de).toBe('The **big** intro');
      });

      it('Paragraph with inline marks imports as MARKDOWN', () => {
        const doc = parseHtmlToTree('<p>see <em>this</em> and <s>that</s></p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('see *this* and ~~that~~');
      });

      it('Plain paragraph keeps TEXT format', () => {
        const doc = parseHtmlToTree('<p>just words</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('TEXT');
        expect(content.contents.de).toBe('just words');
      });

      it('Heading with <em> imports as MARKDOWN_MINIMAL', () => {
        const doc = parseHtmlToTree('<h1>An <em>emphatic</em> title</h1>');
        const heading = doc.children[0] as HeadingDocumentNode;
        expect(heading.format).toBe('MARKDOWN_MINIMAL');
        expect(heading.contents.de).toBe('An *emphatic* title');
      });

      it('Paragraph with <sup> imports as MARKDOWN', () => {
        const doc = parseHtmlToTree('<p>x<sup>2</sup> + y</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('x^2^ + y');
      });

      it('Paragraph with <sub> imports as MARKDOWN', () => {
        const doc = parseHtmlToTree('<p>H<sub>2</sub>O</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('H~2~O');
      });

      it('Strips inline formatting via Markdown conversion (b → bold)', () => {
        const doc = parseHtmlToTree('<p><b>Bold</b> and <i>italic</i></p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('**Bold** and *italic*');
      });

      it('Paragraph with <br> imports as MARKDOWN with a literal newline', () => {
        const doc = parseHtmlToTree('<p>line one<br>line two</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('line one\nline two');
      });

      it('Paragraph with <a href> imports as MARKDOWN preserving the link', () => {
        const doc = parseHtmlToTree('<p>see <a href="https://example.com">site</a></p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('see [site](https://example.com)');
      });

      it('Plain paragraph without href ignores spurious <a> (no href) and stays TEXT', () => {
        const doc = parseHtmlToTree('<p><a>just words</a></p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('TEXT');
        expect(content.contents.de).toBe('just words');
      });

      it('Heading with <br> only imports as NEWLINES (MARKDOWN_MINIMAL is single-line)', () => {
        const doc = parseHtmlToTree('<h1>top<br>bottom</h1>');
        const heading = doc.children[0] as HeadingDocumentNode;
        expect(heading.format).toBe('NEWLINES');
        expect(heading.contents.de).toBe('top\nbottom');
      });

      it('Heading with marks AND <br> imports as MARKDOWN_MINIMAL with the break dropped', () => {
        const doc = parseHtmlToTree('<h1><strong>big</strong> top<br>bottom</h1>');
        const heading = doc.children[0] as HeadingDocumentNode;
        expect(heading.format).toBe('MARKDOWN_MINIMAL');
        // No \n in the stored source — MARKDOWN_MINIMAL has no newline rule, so the
        // importer drops the break (preferring to preserve the marks).
        expect(heading.contents.de).not.toContain('\n');
        expect(heading.contents.de).toBe('**big** top bottom');
      });

      it('Heading with <a href> drops link syntax (MARKDOWN_MINIMAL has no link rule)', () => {
        const doc = parseHtmlToTree('<h1>see <a href="https://example.com">site</a></h1>');
        const heading = doc.children[0] as HeadingDocumentNode;
        // Heading is MARKDOWN_MINIMAL because of the bold-eligible heuristic? An anchor
        // alone shouldn't push a heading off TEXT (headings only get MARKDOWN_MINIMAL on
        // inline marks), so this stays plain text — the link label survives.
        expect(heading.format).toBe('TEXT');
        expect(heading.contents.de).toBe('see site');
      });

      it('Heading with bold AND link emits the bold but keeps link as plain label', () => {
        const doc = parseHtmlToTree(
          '<h1><strong>big</strong> <a href="https://example.com">site</a></h1>'
        );
        const heading = doc.children[0] as HeadingDocumentNode;
        expect(heading.format).toBe('MARKDOWN_MINIMAL');
        // `[label](url)` would render as literal text under MARKDOWN_MINIMAL — the
        // importer drops the link syntax to keep just the label.
        expect(heading.contents.de).toBe('**big** site');
      });

      it('Paragraph with <code> imports as MARKDOWN preserving the code span', () => {
        const doc = parseHtmlToTree('<p>run <code>npm test</code> please</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('run `npm test` please');
      });

      it('Trims whitespace inside an inline mark (trailing space inside <em>)', () => {
        // Word docs frequently emit `<em>Test </em>` with the space inside the tag.
        // The space must move outside the asterisks so the markdown parses as italic.
        const doc = parseHtmlToTree('<p><em>Test </em>and more</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('*Test* and more');
      });

      it('Trims whitespace inside <strong> wrapping the entire content', () => {
        const doc = parseHtmlToTree('<p><strong> Bold </strong></p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('**Bold**');
      });

      it('Trims whitespace inside <em> when it leads the content', () => {
        const doc = parseHtmlToTree('<p><em> leading</em> rest</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        expect(content.contents.de).toBe('*leading* rest');
      });

      it('Decodes &nbsp; (\\u00A0) into a regular space', () => {
        // Word docs use non-breaking spaces (`&nbsp;` / ` `) liberally. Marked
        // re-escapes the `&`, surfacing literal `&nbsp;` text in the rendered output.
        // The importer should normalize them to plain spaces for MARKDOWN sources.
        const doc = parseHtmlToTree('<p>Hello&nbsp;world</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.contents.de).not.toContain('&nbsp;');
        expect(content.contents.de).not.toContain(' ');
        expect(content.contents.de).toBe('Hello world');
      });

      it('Decodes &nbsp; inside an inline mark', () => {
        const doc = parseHtmlToTree('<p><strong>foo&nbsp;bar</strong></p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.contents.de).toBe('**foo bar**');
      });

      it('Newline inside an inline mark stays inside (not pulled out)', () => {
        // wrapMark used to pull \n out of marks via /\s*/, breaking inline structure.
        // Only horizontal whitespace should float outside the delimiters.
        const doc = parseHtmlToTree('<p><em>hi\nthere</em></p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.format).toBe('MARKDOWN');
        // The newline must remain BETWEEN the asterisks, not after them.
        expect(content.contents.de).toBe('*hi\nthere*');
      });

      it('Decodes &amp; into & (and renders as the user intended)', () => {
        const doc = parseHtmlToTree('<p>Tom &amp; Jerry</p>');
        const content = doc.children[0] as ContentDocumentNode;
        // Stored content has a single & — marked re-escapes it on render so the user
        // sees "Tom & Jerry" instead of "Tom &amp; Jerry".
        expect(content.contents.de).toBe('Tom & Jerry');
      });

      it('Decodes &quot; and &apos;', () => {
        const doc = parseHtmlToTree('<p>he said &quot;hi&quot; and &apos;bye&apos;</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.contents.de).toBe(`he said "hi" and 'bye'`);
      });

      it('Decodes numeric entities like &#8212; (em dash)', () => {
        const doc = parseHtmlToTree('<p>em&#8212;dash</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.contents.de).toBe('em—dash');
      });

      it('Decodes hex numeric entities like &#x2014;', () => {
        const doc = parseHtmlToTree('<p>em&#x2014;dash</p>');
        const content = doc.children[0] as ContentDocumentNode;
        expect(content.contents.de).toBe('em—dash');
      });

      it('Leaves &lt; and &gt; alone (decoding them would create phantom tags)', () => {
        // We deliberately don't decode `&lt;` / `&gt;` because the importer's tag-
        // stripping pass would then mistake the resulting `<` / `>` for tag markers.
        // The cost is that users with literal angle brackets in their content see
        // them entity-encoded — acceptable.
        const doc = parseHtmlToTree('<p>x &lt;script&gt;y</p>');
        const content = doc.children[0] as ContentDocumentNode;
        // The text passes through with the entities still encoded, so no fake tags
        // are stripped. (The render pipeline handles them as plain text via marked.)
        expect(content.contents.de).toContain('&lt;script&gt;');
        expect(content.contents.de).toContain('y');
      });
    });

    it('uses de language by default', () => {
      const html = '<p>German text</p>';
      const doc = parseHtmlToTree(html);
      const content = doc.children[0] as LeafDocumentNode;
      expect(content.contents.de).toBe('German text');
      expect(content.contents.en).toBeUndefined();
    });

    it('handles multiple h1 headings', () => {
      const html = '<h1>Chapter 1</h1><p>Content 1</p><h1>Chapter 2</h1><p>Content 2</p>';
      const doc = parseHtmlToTree(html);
      // Both h1s should be at root level
      expect(doc.children.length).toBe(2);
      const ch1 = doc.children[0] as HeadingDocumentNode;
      const ch2 = doc.children[1] as HeadingDocumentNode;
      expect(ch1.contents.de).toBe('Chapter 1');
      expect(ch2.contents.de).toBe('Chapter 2');
      // Each should have their content nested
      expect(ch1.children.length).toBe(1);
      expect(ch2.children.length).toBe(1);
    });

    it('handles skipped heading levels (h1 then h3)', () => {
      const html = '<h1>Chapter</h1><h3>Subsection</h3>';
      const doc = parseHtmlToTree(html);
      const h1 = doc.children[0] as HeadingDocumentNode;
      // h3 should be nested directly under h1 (no phantom h2)
      expect(h1.children.length).toBe(1);
      const h3 = h1.children[0] as HeadingDocumentNode;
      expect(h3.type).toBe('heading');
      expect(h3.contents.de).toBe('Subsection');
    });

    // Edge cases ported from edge-cases.test.ts
    describe('empty document handling', () => {
      it('handles empty string', () => {
        const doc = parseHtmlToTree('');
        expect(doc.type).toBe('document');
        expect(doc.children).toEqual([]);
      });

      it('handles whitespace only', () => {
        const doc = parseHtmlToTree('   \n\t  ');
        expect(doc.children).toEqual([]);
      });

      it('handles empty tags', () => {
        const doc = parseHtmlToTree('<p></p><div></div>');
        expect(doc.children).toEqual([]);
      });
    });

    describe('malformed input handling', () => {
      it('handles unclosed tags', () => {
        const doc = parseHtmlToTree('<p>Unclosed paragraph<p>Another');
        expect(doc.type).toBe('document');
        // Should not throw
      });

      it('handles script tags safely', () => {
        const doc = parseHtmlToTree('<script>alert("xss")</script><p>Safe content</p>');
        const hasScript = JSON.stringify(doc).includes('alert');
        expect(hasScript).toBe(false);
      });

      it('handles style tags safely', () => {
        const doc = parseHtmlToTree('<style>body { color: red; }</style><p>Content</p>');
        const hasStyle = JSON.stringify(doc).includes('color: red');
        expect(hasStyle).toBe(false);
      });
    });

    describe('special characters', () => {
      it('preserves HTML entities', () => {
        const doc = parseHtmlToTree('<p>&amp; &lt; &gt;</p>');
        const content = doc.children[0] as LeafDocumentNode;
        expect(content.contents.de).toContain('&');
      });

      it('handles unicode content', () => {
        const doc = parseHtmlToTree('<p>日本語 🎉 Ñoño</p>');
        const content = doc.children[0] as LeafDocumentNode;
        expect(content.contents.de).toContain('日本語');
        expect(content.contents.de).toContain('🎉');
      });
    });

    describe('boundary conditions', () => {
      it('handles very long paragraph content', () => {
        const longContent = 'a'.repeat(10000);
        const doc = parseHtmlToTree(`<p>${longContent}</p>`);
        const content = doc.children[0] as LeafDocumentNode;
        expect(content.contents.de.length).toBe(10000);
      });

      it('handles single character content', () => {
        const doc = parseHtmlToTree('<p>X</p>');
        const content = doc.children[0] as LeafDocumentNode;
        expect(content.contents.de).toBe('X');
      });

      it('generateId produces unique ids across many calls', () => {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) {
          ids.add(generateId());
        }
        expect(ids.size).toBe(1000);
      });
    });
  });

  describe('parseHtmlLegalToTree', () => {
    it('detects Art. pattern as heading', () => {
      const html = '<p>Art. 1 Some article title</p><p>Article content here.</p>';
      const doc = parseHtmlLegalToTree(html);
      // Art. should become a heading
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
      expect(heading.number).toBe('Art. 1');
      expect(heading.contents.de).toBe('Some article title');
    });

    it('detects roman numeral as heading', () => {
      const html = '<p>I. First Section</p><p>Content of section</p>';
      const doc = parseHtmlLegalToTree(html);
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
      expect(heading.number).toBe('I.');
      expect(heading.contents.de).toBe('First Section');
    });

    it('converts lettered items to list_item with number', () => {
      const html = '<p>a. First item</p><p>b. Second item</p>';
      const doc = parseHtmlLegalToTree(html);
      // Should be converted to a list with lettered items
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      const item1 = list.children[0] as ContainerDocumentNode;
      expect(item1.type).toBe('list_item');
      expect(item1.number).toBe('a.');
      // Content is now in a child content node
      const item1Content = item1.children[0] as LeafDocumentNode;
      expect(item1Content.type).toBe('content');
    });

    // Additional pattern detection tests (ported from legal-patterns.test.ts)
    it('detects Art. X Abs. Y pattern as heading', () => {
      const doc = parseHtmlLegalToTree('<p>Art. 1 Abs. 2 (geändert)</p>');
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
      expect(heading.number).toBe('Art. 1 Abs. 2');
      expect(heading.contents.de).toBe('(geändert)');
    });

    it('detects § pattern as heading', () => {
      const doc = parseHtmlLegalToTree('<p>§ 5 Some title</p>');
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
    });

    it('accumulates multiple lettered items into single list', () => {
      const html = '<p>a. first</p><p>b. second</p><p>c. third</p>';
      const doc = parseHtmlLegalToTree(html);
      const list = doc.children[0] as ContainerDocumentNode;
      expect(list.type).toBe('list');
      expect(list.children.length).toBe(3);
      expect((list.children[0] as LeafDocumentNode).number).toBe('a.');
      expect((list.children[1] as LeafDocumentNode).number).toBe('b.');
      expect((list.children[2] as LeafDocumentNode).number).toBe('c.');
    });

    it('detects multiple roman numeral sections', () => {
      const html = '<p>I. First Section</p><p>II. Second Section</p><p>III. Third Section</p>';
      const doc = parseHtmlLegalToTree(html);
      expect(doc.children.length).toBe(3);
      expect((doc.children[0] as HeadingDocumentNode).type).toBe('heading');
      expect((doc.children[1] as HeadingDocumentNode).type).toBe('heading');
      expect((doc.children[2] as HeadingDocumentNode).type).toBe('heading');
    });

    it('nests content under Article heading', () => {
      const html = '<p>Art. 1 Title</p><p>Article content here.</p>';
      const doc = parseHtmlLegalToTree(html);
      const heading = doc.children[0] as HeadingDocumentNode;
      expect(heading.type).toBe('heading');
      expect(heading.children.length).toBe(1);
      expect((heading.children[0] as LeafDocumentNode).type).toBe('content');
    });

    it('handles mixed legal document structure', () => {
      const html = `
        <p>I. First Section</p>
        <p>Art. 1 First Article</p>
        <p>Content of first article.</p>
        <p>a. first item</p>
        <p>b. second item</p>
        <p>II. Second Section</p>
      `;
      const doc = parseHtmlLegalToTree(html);

      // Section I should be at root
      const sectionI = doc.children[0] as HeadingDocumentNode;
      expect(sectionI.type).toBe('heading');
      expect(sectionI.number).toBe('I.');
      expect(sectionI.contents.de).toBe('First Section');

      // Section II should also be at root
      const sectionII = doc.children[1] as HeadingDocumentNode;
      expect(sectionII.type).toBe('heading');
      expect(sectionII.number).toBe('II.');
      expect(sectionII.contents.de).toBe('Second Section');
    });
  });

  describe('full HTML document (Docling-style)', () => {
    it('parses a full HTML document with DOCTYPE, head, style, and body', () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Test document</title>
<style>html { font-family: Arial; } h1 { color: #333; }</style>
</head>
<body>
<div class='page'>
<h2>Gesetz über die digitale Verwaltung (DVG) 1</h2>
<p>(Vom …)</p>
<p>Der Kantonsrat beschliesst:</p>
<h2>I. Allgemeine Bestimmungen</h2>
<h2>§ 1 Gegenstand</h2>
<ul>
<li>1 Dieses Gesetz regelt die Rahmenbedingungen.</li>
</ul>
<p>2 Es:</p>
<ol>
<li style="list-style-type: 'a) ';">definiert die Prinzipien;</li>
<li style="list-style-type: 'b) ';">schafft die Grundlagen;</li>
</ol>
<h2>§ 2 Geltungsbereich</h2>
<p>Dieses Gesetz gilt für die öffentlichen Organe.</p>
</div>
</body>
</html>`;
      const doc = parseHtmlToTree(html);
      expect(doc.type).toBe('document');
      expect(doc.children.length).toBeGreaterThan(0);
      // Should contain headings, not just plain content
      const hasHeadings = doc.children.some((c) => c.type === 'heading');
      expect(hasHeadings).toBe(true);

      // Find the ol list and verify list-style-type is preserved
      const allLists: ContainerDocumentNode[] = [];
      const collectLists = (node: DocumentNode) => {
        if (node.type === 'list') allLists.push(node as ContainerDocumentNode);
        if ('children' in node) {
          for (const child of (node as ContainerDocumentNode).children) {
            collectLists(child);
          }
        }
      };
      collectLists(doc);
      // The second list should be the ol with a), b) items
      const olList = allLists.find((l) =>
        l.children.some((c) => (c as ContainerDocumentNode).number === 'a)')
      );
      expect(olList).toBeDefined();
      const items = olList!.children as ContainerDocumentNode[];
      expect(items[0].number).toBe('a)');
      expect(items[1].number).toBe('b)');
    });
  });

  // Real document integration tests (ported from real-conversion.test.ts)
  describe('Real Document Conversion (Tree)', () => {
    const readFixture = (filename: string) => {
      // Using dynamic import for fixtures
      const fs = require('node:fs');
      const path = require('node:path');
      return fs.readFileSync(path.join(__dirname, '../test/fixtures', filename), 'utf-8');
    };

    it('parses PeV document structure', () => {
      const html = readFixture('pev-real.html');
      const doc = parseHtmlLegalToTree(html);

      // Verify document has children
      expect(doc.children.length).toBeGreaterThan(0);

      // Check that some nodes exist (headings from legal patterns)
      const flattenNodes = (
        node: ContainerDocumentNode | HeadingDocumentNode
      ): (ContainerDocumentNode | HeadingDocumentNode | LeafDocumentNode)[] => {
        const result: (ContainerDocumentNode | HeadingDocumentNode | LeafDocumentNode)[] = [node];
        for (const child of node.children) {
          if ('children' in child) {
            result.push(...flattenNodes(child as ContainerDocumentNode | HeadingDocumentNode));
          } else {
            result.push(child);
          }
        }
        return result;
      };

      const allNodes = flattenNodes(doc);
      const hasHeadings = allNodes.some((n) => n.type === 'heading');
      expect(hasHeadings).toBe(true);
    });

    it('parses VIV document structure', () => {
      const html = readFixture('viv-real.html');
      const doc = parseHtmlLegalToTree(html);
      expect(doc.children.length).toEqual(6);
    });

    it('parses VLG document structure', () => {
      const html = readFixture('vlg-real.html');
      const doc = parseHtmlLegalToTree(html);
      expect(doc.children.length).toEqual(6);
    });
  });
});

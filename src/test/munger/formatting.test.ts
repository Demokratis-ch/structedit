import { describe, test, expect } from 'vitest';
import { parseHtml } from '../../utils/document-utils';

describe('Visual Fidelity (Formatting)', () => {
    
  test('Preserves bold, italic, underline tags', () => {
    const html = `
      <p>Normal <b>Bold</b> <i>Italic</i> <u>Underline</u></p>
    `;
    const blocks = parseHtml(html);
    expect(blocks).toHaveLength(1);
    const content = blocks[0].content;
    
    expect(content).toContain('<b>Bold</b>');
    expect(content).toContain('<i>Italic</i>');
    expect(content).toContain('<u>Underline</u>');
  });

  test('Preserves em, strong, s (strikethrough), code, span, sub, sup', () => {
     const html = `
       <p>
         <em>Em</em> <strong>Strong</strong> <s>Strike</s> 
         <code>Code</code> <span>Span</span> 
         <sub>Sub</sub> <sup>Sup</sup>
       </p>
     `;
     const blocks = parseHtml(html);
     const content = blocks[0].content;
     
     expect(content).toContain('<em>Em</em>');
     expect(content).toContain('<strong>Strong</strong>');
     expect(content).toContain('<s>Strike</s>');
     expect(content).toContain('<code>Code</code>');
     expect(content).toContain('<span>Span</span>');
     expect(content).toContain('<sub>Sub</sub>');
     expect(content).toContain('<sup>Sup</sup>');
  });

  test('Strips dangerous tags (script, object, iframe)', () => {
    const html = `
      <p>Safe content <script>alert("XSS")</script></p>
      <div><iframe src="evil.com"></iframe></div>
    `;
    const blocks = parseHtml(html);
    
    // Should result in clean p blocks
    blocks.forEach(b => {
        expect(b.content).not.toContain('<script>');
        expect(b.content).not.toContain('alert');
        expect(b.content).not.toContain('<iframe');
    });
  });

  test('Strips dangerous attributes (onclick)', () => {
      const html = `
        <p><b onclick="alert(1)">Bold with click</b></p>
      `;
      // Note: parser.parseFromString might not strip attributes automatically unless we sanitize explicitly
      // checking what parseHtml returns currently
      const blocks = parseHtml(html);
      
      // If we don't have explicit Attribute sanitization, this test might FAIL initially
      // showing we need to add it.
      expect(blocks[0].content).not.toContain('onclick');
  });

});

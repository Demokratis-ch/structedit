import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadDocument } from './LoadDocument';

describe('LoadDocument', () => {
  const mockOnConvert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('drag-and-drop', () => {
    it('renders the drop zone with the click-or-drop prompt', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);
      expect(screen.getByText(/click or drop a document to upload/i)).toBeInTheDocument();
      expect(screen.getByText(/DOCX.*HTML.*supported/i)).toBeInTheDocument();
    });

    it('marks the drop zone as dragging while a file is hovering over it', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);
      const zone = screen.getByTestId('drop-zone');
      expect(zone.dataset.dragging).toBeUndefined();

      fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
      expect(zone.dataset.dragging).toBe('true');
    });

    it('clears the dragging state when the cursor leaves the drop zone', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);
      const zone = screen.getByTestId('drop-zone');

      fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
      expect(zone.dataset.dragging).toBe('true');

      fireEvent.dragLeave(zone);
      expect(zone.dataset.dragging).toBeUndefined();
    });

    it('clears the dragging state after a drop', async () => {
      // Suppress expected error from mock File lacking arrayBuffer()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<LoadDocument onConvert={mockOnConvert} />);

      const zone = screen.getByTestId('drop-zone');
      fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
      expect(zone.dataset.dragging).toBe('true');

      const file = new File(['test content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      await act(async () => {
        fireEvent.drop(zone, {
          dataTransfer: {
            files: [file],
            types: ['Files'],
          },
        });
      });

      expect(zone.dataset.dragging).toBeUndefined();
      errorSpy.mockRestore();
    });

    it('prevents default browser behavior on drag over', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);

      const zone = screen.getByTestId('drop-zone');
      const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault');

      zone.dispatchEvent(dragOverEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('prevents default browser behavior on drop', async () => {
      render(<LoadDocument onConvert={mockOnConvert} />);

      const zone = screen.getByTestId('drop-zone');
      fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });

      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [], types: ['Files'] },
      });
      const preventDefaultSpy = vi.spyOn(dropEvent, 'preventDefault');

      await act(async () => {
        zone.dispatchEvent(dropEvent);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('file input', () => {
    it('accepts HTML files in file input', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput.accept).toContain('.html');
      expect(fileInput.accept).toContain('.htm');
    });
  });

  describe('HTML file upload', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-blob-url');
      window.alert = vi.fn();
      // jsdom's Blob/File doesn't implement .text(), polyfill it for tests
      if (!Blob.prototype.text) {
        Blob.prototype.text = function () {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsText(this);
          });
        };
      }
    });

    it('processes uploaded HTML file and calls onConvert with parsed tree and source URL', async () => {
      render(<LoadDocument onConvert={mockOnConvert} />);

      const htmlContent = '<h1>Title</h1><p>Content here</p>';
      const file = new File([htmlContent], 'test.html', { type: 'text/html' });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      });
      await act(async () => {
        fireEvent.change(fileInput);
        await vi.waitFor(() => {
          expect(mockOnConvert).toHaveBeenCalled();
        });
      });

      const [doc, sourceUrl, html, filename] = mockOnConvert.mock.calls[0];
      expect(doc.type).toBe('DOCUMENT');
      expect(doc.children.length).toBeGreaterThan(0);
      expect(sourceUrl).toBe('blob:http://localhost/fake-blob-url');
      expect(html).toBe(htmlContent);
      expect(filename).toBe('test.html');
    });
  });

  describe('text convert', () => {
    it('calls onConvert with a generated Untitled name when converting pasted text', async () => {
      render(<LoadDocument onConvert={mockOnConvert} />);
      const textarea = screen.getByPlaceholderText(/paste unstructured text/i);
      fireEvent.change(textarea, { target: { value: 'Hello world' } });
      fireEvent.click(screen.getByRole('button', { name: /convert text/i }));

      await waitFor(() => expect(mockOnConvert).toHaveBeenCalled());
      const [doc, sourceUrl, html, name] = mockOnConvert.mock.calls[0];
      expect(doc.type).toBe('DOCUMENT');
      expect(sourceUrl).toBeNull();
      expect(html).toBeUndefined();
      expect(name).toMatch(/^Untitled \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/);
    });

    it('calls onConvert with source URL and HTML when pasting HTML content', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-blob-url');
      render(<LoadDocument onConvert={mockOnConvert} />);
      const htmlContent = '<h1>Title</h1><p>Some content</p>';
      const textarea = screen.getByPlaceholderText(/paste unstructured text/i);
      fireEvent.change(textarea, { target: { value: htmlContent } });
      fireEvent.click(screen.getByRole('button', { name: /convert text/i }));

      await waitFor(() => expect(mockOnConvert).toHaveBeenCalled());
      const [doc, sourceUrl, html, name] = mockOnConvert.mock.calls[0];
      expect(doc.type).toBe('DOCUMENT');
      expect(doc.children.length).toBeGreaterThan(0);
      expect(sourceUrl).toBe('blob:http://localhost/fake-blob-url');
      expect(html).toBe(htmlContent);
      expect(name).toMatch(/^Untitled \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/);
    });
  });
});

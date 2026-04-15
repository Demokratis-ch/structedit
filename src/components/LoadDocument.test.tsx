import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadDocument } from './LoadDocument';

describe('LoadDocument', () => {
  const mockOnConvert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('drag-and-drop', () => {
    it('shows drop overlay when dragging files over the page', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);

      // Drop overlay should not be visible initially
      expect(screen.queryByText(/drop your document here/i)).not.toBeInTheDocument();

      // Simulate drag enter on the container
      const container = screen.getByTestId('drop-zone');
      fireEvent.dragEnter(container, {
        dataTransfer: { types: ['Files'] },
      });

      // Drop overlay should be visible and mention HTML
      expect(screen.getByText(/drop your document here/i)).toBeInTheDocument();
      expect(screen.getByText(/DOCX.*HTML.*supported/i)).toBeInTheDocument();
    });

    it('hides drop overlay when drag leaves the page', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);

      const container = screen.getByTestId('drop-zone');

      // Enter then leave
      fireEvent.dragEnter(container, {
        dataTransfer: { types: ['Files'] },
      });
      expect(screen.getByText(/drop your document here/i)).toBeInTheDocument();

      fireEvent.dragLeave(container);

      expect(screen.queryByText(/drop your document here/i)).not.toBeInTheDocument();
    });

    it('hides drop overlay after file is dropped', async () => {
      // Suppress expected error from mock File lacking arrayBuffer()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<LoadDocument onConvert={mockOnConvert} />);

      const container = screen.getByTestId('drop-zone');

      // Show overlay first
      fireEvent.dragEnter(container, {
        dataTransfer: { types: ['Files'] },
      });
      expect(screen.getByText(/drop your document here/i)).toBeInTheDocument();

      // Create a mock DOCX file
      const file = new File(['test content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      // Drop the file — handleFile is async, so wrap in act to flush state updates
      await act(async () => {
        fireEvent.drop(container, {
          dataTransfer: {
            files: [file],
            types: ['Files'],
          },
        });
      });

      // Overlay should be hidden
      expect(screen.queryByText(/drop your document here/i)).not.toBeInTheDocument();
      errorSpy.mockRestore();
    });

    it('prevents default browser behavior on drag over', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);

      const container = screen.getByTestId('drop-zone');

      const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault');

      container.dispatchEvent(dragOverEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('prevents default browser behavior on drop', async () => {
      render(<LoadDocument onConvert={mockOnConvert} />);

      const container = screen.getByTestId('drop-zone');

      // First trigger dragEnter to show the overlay
      fireEvent.dragEnter(container, {
        dataTransfer: { types: ['Files'] },
      });

      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [], types: ['Files'] },
      });
      const preventDefaultSpy = vi.spyOn(dropEvent, 'preventDefault');

      await act(async () => {
        container.dispatchEvent(dropEvent);
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
      expect(doc.type).toBe('document');
      expect(doc.children.length).toBeGreaterThan(0);
      expect(sourceUrl).toBe('blob:http://localhost/fake-blob-url');
      expect(html).toBe(htmlContent);
      expect(filename).toBe('test.html');
    });
  });

  describe('text convert', () => {
    it('calls onConvert with null filename when converting pasted text', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);
      const textarea = screen.getByPlaceholderText(/paste unstructured text/i);
      fireEvent.change(textarea, { target: { value: 'Hello world' } });
      fireEvent.click(screen.getByRole('button', { name: /convert text/i }));
      expect(mockOnConvert).toHaveBeenCalledWith(
        expect.anything(), // doc
        null, // url
        undefined, // html
        null // filename
      );
    });

    it('calls onConvert with source URL and HTML when pasting HTML content', () => {
      URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-blob-url');
      render(<LoadDocument onConvert={mockOnConvert} />);
      const htmlContent = '<h1>Title</h1><p>Some content</p>';
      const textarea = screen.getByPlaceholderText(/paste unstructured text/i);
      fireEvent.change(textarea, { target: { value: htmlContent } });
      fireEvent.click(screen.getByRole('button', { name: /convert text/i }));

      const [doc, sourceUrl, html, filename] = mockOnConvert.mock.calls[0];
      expect(doc.type).toBe('document');
      expect(doc.children.length).toBeGreaterThan(0);
      expect(sourceUrl).toBe('blob:http://localhost/fake-blob-url');
      expect(html).toBe(htmlContent);
      expect(filename).toBeNull();
    });
  });
});

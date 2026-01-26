import { fireEvent, render, screen } from '@testing-library/react';
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

      // Drop overlay should be visible
      expect(screen.getByText(/drop your document here/i)).toBeInTheDocument();
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

      // Drop the file
      fireEvent.drop(container, {
        dataTransfer: {
          files: [file],
          types: ['Files'],
        },
      });

      // Overlay should be hidden
      expect(screen.queryByText(/drop your document here/i)).not.toBeInTheDocument();
    });

    it('prevents default browser behavior on drag over', () => {
      render(<LoadDocument onConvert={mockOnConvert} />);

      const container = screen.getByTestId('drop-zone');

      const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault');

      container.dispatchEvent(dragOverEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('prevents default browser behavior on drop', () => {
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

      container.dispatchEvent(dropEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });
});

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { DOC_TREE_VERSION, type DocumentRootNode, isValidDocTreeEnvelope } from '../types/document';
import { EditorInterface } from './EditorInterface';

const downloadFileSpy = vi.fn();
vi.mock('../utils/document-utils', async () => {
  const actual =
    await vi.importActual<typeof import('../utils/document-utils')>('../utils/document-utils');
  return { ...actual, downloadFile: (...args: unknown[]) => downloadFileSpy(...args) };
});

const createTestDocument = (): DocumentRootNode => ({
  id: 'root',
  type: 'DOCUMENT',
  children: [
    {
      id: 'h1',
      number: '1',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'First Heading' },
      children: [],
    },
    {
      id: 'h2',
      number: '2',
      type: 'HEADING',
      format: 'TEXT',
      contents: { de: 'Second Heading' },
      children: [],
    },
  ],
});

const renderEditorInterface = (props?: Partial<Parameters<typeof EditorInterface>[0]>) =>
  render(
    <EditorInterface
      initialDocument={createTestDocument()}
      documentUrl={null}
      documentName="test.docx"
      language="de"
      onBack={() => {}}
      {...props}
    />
  );

describe('EditorInterface layout', () => {
  test('renders Toolbar with Close Editor button', () => {
    renderEditorInterface();
    expect(screen.getByText('Close Editor')).toBeInTheDocument();
  });

  test('renders Toolbar undo/redo buttons', () => {
    renderEditorInterface();
    // History counter shows "1 / 1" for initial state
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  test('renders the tree editor pane', () => {
    renderEditorInterface();
    expect(screen.getByTestId('tree-editor-pane')).toBeInTheDocument();
  });

  test('calls onBack when Close Editor is clicked', async () => {
    const onBack = vi.fn();
    renderEditorInterface({ onBack });

    fireEvent.click(screen.getByText('Close Editor'));
    // The handler awaits the autosave flush before calling onBack — give it a tick.
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  });

  test('renders Download JSON button', () => {
    renderEditorInterface();
    expect(screen.getByText('Download JSON')).toBeInTheDocument();
  });

  test('Download JSON emits a DocTree envelope wrapping the document', () => {
    downloadFileSpy.mockClear();
    renderEditorInterface({ documentName: 'entwurf.docx', language: 'de' });

    fireEvent.click(screen.getByText('Download JSON'));

    expect(downloadFileSpy).toHaveBeenCalledOnce();
    const [content, filename, mime] = downloadFileSpy.mock.calls[0];
    expect(filename).toBe('entwurf.json');
    expect(mime).toBe('application/json');
    const parsed = JSON.parse(content);
    expect(parsed.DocTreeVersion).toBe(DOC_TREE_VERSION);
    expect(parsed.metadata.title).toEqual({ de: 'entwurf' });
    expect(parsed.document.type).toBe('DOCUMENT');
    expect(isValidDocTreeEnvelope(parsed)).toBe(true);
  });
});

/** Get a within-scoped query object for the tree editor (right pane). */
const getTreePane = () => within(screen.getByTestId('tree-editor-pane'));

/** Assert that a node (found by text content) has selected styling. */
const expectNodeSelected = (text: string) => {
  const el = getTreePane().getByText(text);
  const wrapper = el.closest('[draggable]') as HTMLElement;
  expect(wrapper.className).toContain('bg-blue');
};

describe('FloatingToolbar tooltips', () => {
  test('toolbar buttons show keyboard shortcuts in tooltips', () => {
    renderEditorInterface();

    // Click the first heading node to select it
    const firstHeading = getTreePane().getByText('First Heading');
    fireEvent.click(firstHeading);

    expect(screen.getByTitle('Heading (H)')).toBeInTheDocument();
    expect(screen.getByTitle('Content (C)')).toBeInTheDocument();
    expect(screen.getByTitle('Bullet List (U)')).toBeInTheDocument();
    expect(screen.getByTitle('Ordered List (O)')).toBeInTheDocument();
    expect(screen.getByTitle('Alpha List (A)')).toBeInTheDocument();
    expect(screen.getByTitle('Footnote (F)')).toBeInTheDocument();
  });
});

/** Get the main split drag handle (sibling of tree-editor-pane). */
const getMainSplitHandle = () => {
  const treePane = screen.getByTestId('tree-editor-pane');
  const handle = treePane.previousElementSibling as HTMLElement;
  expect(handle.getAttribute('role')).toBe('separator');
  return handle;
};

describe('resizable split', () => {
  test('renders a drag handle between left and right panes', () => {
    renderEditorInterface();
    const handle = getMainSplitHandle();
    expect(handle).toBeInTheDocument();
  });

  test('drag handle mousedown + mousemove resizes the left pane', () => {
    renderEditorInterface();
    const handle = getMainSplitHandle();

    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 600 });
    fireEvent.mouseUp(document);

    // The left pane wrapper should have an updated width style
    const leftPaneWrapper = handle.previousElementSibling as HTMLElement;
    expect(leftPaneWrapper).toBeTruthy();
    const width = Number.parseInt(leftPaneWrapper.style.width, 10);
    expect(width).toBeGreaterThan(0);
  });
});

describe('document outline', () => {
  test('clicking a heading in the outline selects the corresponding node in the tree', async () => {
    vi.useFakeTimers();
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
    renderEditorInterface();

    // The preview tab with TOC is visible (no documentUrl, so preview is the default tab)
    const tocNav = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
    const outlineButton = within(tocNav).getByText('First Heading');

    await act(async () => {
      fireEvent.click(outlineButton);
      vi.runAllTimers();
    });

    // The corresponding node in the tree editor should be selected
    expectNodeSelected('First Heading');

    vi.useRealTimers();
  });
});

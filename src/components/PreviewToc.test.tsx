import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { OutlineEntry } from '../utils/outline-utils';
import { buildTocTree, PreviewToc } from './PreviewToc';

const handleProps = {
  onMouseDown: () => {},
  role: 'separator' as const,
  'aria-orientation': 'vertical' as const,
};

function renderToc(entries: OutlineEntry[], onEntryClick = () => {}) {
  return render(
    <PreviewToc
      entries={entries}
      onEntryClick={onEntryClick}
      tocWidth={512}
      handleProps={handleProps}
      isDragging={false}
      onWidthRestore={() => {}}
    />
  );
}

describe('buildTocTree', () => {
  test('nests a deeper entry under the preceding shallower entry', () => {
    const tree = buildTocTree([
      { id: 'a', number: null, text: 'Parent', depth: 0 },
      { id: 'b', number: null, text: 'Child', depth: 1 },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].entry.id).toBe('a');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].entry.id).toBe('b');
  });

  test('treats equal-depth entries as siblings', () => {
    const tree = buildTocTree([
      { id: 'a', number: null, text: 'First', depth: 0 },
      { id: 'b', number: null, text: 'Second', depth: 0 },
    ]);

    expect(tree).toHaveLength(2);
    expect(tree.map((n) => n.entry.id)).toEqual(['a', 'b']);
    expect(tree[0].children).toHaveLength(0);
  });

  test('pops back to a shallower ancestor when depth decreases', () => {
    const tree = buildTocTree([
      { id: 'a', number: null, text: 'Parent', depth: 0 },
      { id: 'b', number: null, text: 'Child', depth: 1 },
      { id: 'c', number: null, text: 'Uncle', depth: 0 },
    ]);

    expect(tree.map((n) => n.entry.id)).toEqual(['a', 'c']);
    expect(tree[0].children.map((n) => n.entry.id)).toEqual(['b']);
    expect(tree[1].children).toHaveLength(0);
  });
});

describe('PreviewToc', () => {
  test("renders each entry's number and text", () => {
    renderToc([
      { id: 'h1', number: 'Art. 1', text: 'Gegenstand', depth: 0 },
      { id: 'h2', number: 'Art. 2', text: 'Geltungsbereich', depth: 0 },
    ]);

    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
    expect(within(toc).getByText('Art. 1')).toBeInTheDocument();
    expect(within(toc).getByText('Gegenstand')).toBeInTheDocument();
    expect(within(toc).getByText('Art. 2')).toBeInTheDocument();
    expect(within(toc).getByText('Geltungsbereich')).toBeInTheDocument();
  });

  test('calls onEntryClick with the entry id when an entry is clicked', async () => {
    const user = userEvent.setup();
    const onEntryClick = vi.fn();
    renderToc([{ id: 'h1', number: null, text: 'First Heading', depth: 0 }], onEntryClick);

    await user.click(screen.getByText('First Heading'));

    expect(onEntryClick).toHaveBeenCalledWith('h1');
  });

  test('collapse button hides the list and expand button shows it again', async () => {
    const user = userEvent.setup();
    renderToc([{ id: 'h1', number: null, text: 'First Heading', depth: 0 }]);

    const toc = screen.getByRole('navigation', { name: /inhaltsverzeichnis/i });
    expect(within(toc).getByText('First Heading')).toBeInTheDocument();

    await user.click(within(toc).getByRole('button', { name: /collapse/i }));
    expect(within(toc).queryByText('First Heading')).not.toBeInTheDocument();

    await user.click(within(toc).getByRole('button', { name: /expand/i }));
    expect(within(toc).getByText('First Heading')).toBeInTheDocument();
  });
});

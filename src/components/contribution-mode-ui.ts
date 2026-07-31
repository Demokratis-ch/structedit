import { Ban, MessageSquare, PenLine } from 'lucide-react';
import { type ContributionMode, canHaveMode, type DocumentNode } from '../types/document';
import type { ContributionTypeFilter } from '../types/editor';

/**
 * Shared presentation metadata for the contribution-mode controls. Three surfaces render the same
 * four choices — the selection toolbar picker ([FloatingToolbar](./FloatingToolbar.tsx)), the
 * whole-document menu ([DocumentContributionModeMenu](./DocumentContributionModeMenu.tsx)), and the
 * per-node pill in the tree ([RecursiveTreeNode](./RecursiveTreeNode.tsx)) — so the icon and wording
 * for a mode live here once rather than being restated at each site. Each site still owns its own
 * extras (colour classes, test ids, ordering) since those are genuinely local.
 *
 * Icons mirror the Demokratis editor (ban / comment / pen-line).
 */
export interface ContributionModePresentation {
  /** Icon for the mode; `null` for "Default", which is the absence of a mode and gets no icon. */
  Icon: typeof Ban | null;
  /** Compact label shown on buttons and in the picker's trigger summary. */
  short: string;
  /** Full description, used for tooltips, `title`s, and aria-labels. */
  description: string;
}

/** Presentation for the "no mode set" choice — the element-type default. */
export const DEFAULT_MODE_PRESENTATION: ContributionModePresentation = {
  Icon: null,
  short: 'Default',
  description: 'Default (element-type default)',
};

/** Presentation per concrete contribution mode. */
export const MODE_PRESENTATION: Record<ContributionMode, ContributionModePresentation> = {
  NONE: {
    Icon: Ban,
    short: 'None',
    description: 'None — locked, no participant interaction',
  },
  REMARK: {
    Icon: MessageSquare,
    short: 'Remark',
    description: 'Remark — participants may annotate',
  },
  PROPOSAL: {
    Icon: PenLine,
    short: 'Proposal',
    description: 'Proposal — participants may annotate and propose amendments',
  },
};

/**
 * The four choices offered by both mode pickers, in display (and keyboard-digit) order:
 * "Default" first — clearing the mode — then the three concrete modes.
 */
export const MODE_CHOICES: ReadonlyArray<
  ContributionModePresentation & { mode: ContributionMode | undefined }
> = [
  { mode: undefined, ...DEFAULT_MODE_PRESENTATION },
  { mode: 'NONE', ...MODE_PRESENTATION.NONE },
  { mode: 'REMARK', ...MODE_PRESENTATION.REMARK },
  { mode: 'PROPOSAL', ...MODE_PRESENTATION.PROPOSAL },
];

/**
 * Node-type filter options for a bulk mode apply, with their display labels. `'all'` means every
 * type in scope. `DOCUMENT` is deliberately absent: the root is not selectable in the tree, and the
 * whole-document apply already covers it.
 */
export const MODE_TYPE_FILTERS: ReadonlyArray<{
  value: DocumentNode['type'] | 'all';
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'HEADING', label: 'Headings' },
  { value: 'CONTENT', label: 'Content' },
  { value: 'FOOTNOTE', label: 'Footnotes' },
  { value: 'LIST', label: 'Lists' },
  { value: 'LIST_ITEM', label: 'List items' },
  { value: 'IMAGE', label: 'Images' },
];

/**
 * Whether a bulk apply restricted to `filter` could land a `PROPOSAL` on anything. A filter naming
 * a non-proposable type (a list, list item or image) makes the apply a silent no-op, since the
 * per-node clamp drops the mode everywhere — so the pickers disable the choice instead of
 * accepting a click that changes nothing. `'all'` always qualifies: some node in range can hold it.
 *
 * Derived from {@link canHaveMode} rather than restating the proposable types, so it tracks
 * `ALLOWED_MODES` automatically.
 */
export const filterAllowsProposal = (filter: ContributionTypeFilter): boolean =>
  filter === 'all' || canHaveMode(filter, 'PROPOSAL');

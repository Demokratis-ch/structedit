Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md) — each item's tests were written first. The
detailed rules live in [specs/contribution-modes/spec.md](specs/contribution-modes/spec.md) and the
reasoning in [design.md](design.md).

## 1. Data model

- [x] 1.1 Red: extend [src/types/document.test.ts](src/types/document.test.ts) — a node with no mode
  is valid; an unknown mode value is rejected; `PROPOSAL` is rejected on `DOCUMENT`/`LIST`/
  `LIST_ITEM`/`IMAGE` and accepted on `HEADING`/`CONTENT`/`FOOTNOTE`; `NONE`/`REMARK` accepted
  everywhere; an invalid mode anywhere invalidates the whole document
- [x] 1.2 Green: add the `ContributionMode` union, the optional `contributionMode` field on all seven
  node interfaces, `PROPOSABLE_TYPES`, `ALLOWED_MODES` (with the
  `as const satisfies Record<DocumentNode['type'], …>` drift guard, design D2), `canHaveMode`,
  `carryModeOrClamp`, and the validation branch in `isValidNodeInternal`
  ([src/types/document.ts](src/types/document.ts))
- [x] 1.3 Refactor: confirm the validation branch sits outside the container/leaf split so it covers
  the root and containers uniformly (design D3)

## 2. Tree primitives

- [x] 2.1 Red: extend [src/utils/tree-utils.test.ts](src/utils/tree-utils.test.ts) — set/clear on a
  single node; clearing removes the key rather than writing `undefined`; same-reference no-ops for an
  unknown path, a disallowed mode, and an already-set mode; subtree apply with and without a type
  filter; ineligible nodes skipped mid-subtree; clear across a subtree; empty path targets the root
- [x] 2.2 Green: add `setNodeContributionMode` and `setSubtreeContributionMode`
  ([src/utils/tree-utils.ts](src/utils/tree-utils.ts)), preserving references where nothing changed
- [x] 2.3 Refactor: confirm the per-node clamp lives in both primitives, so no caller can write a
  mode a node's type may not carry (design D4)

## 3. Mode preservation across mutations

- [x] 3.1 Red: extend [src/utils/tree-mutations.test.ts](src/utils/tree-mutations.test.ts) — type
  change carries an allowed mode (heading↔content, content→footnote) and clamps a disallowed one;
  heading→list carries the mode onto the inner content node; merge is first-node-wins; list
  flattening prefers the content child's mode over the list item's; single list-item conversion
  carries the item's mode; a new sibling carries none; outdent preserves the mode
- [x] 3.2 Green: add the `modeField` spread helper and thread `carryModeOrClamp` through the node
  constructors in `changeNodeTypeInDoc`, `mergeNodesInDoc`, `flattenListToContents`, and
  `extractAndConvertListItemInDoc` ([src/utils/tree-mutations.ts](src/utils/tree-mutations.ts))
- [x] 3.3 Refactor: confirm `modeField` yields an absent key rather than an `undefined` value, so
  the wire form is unchanged for unmarked nodes (design D1)

## 4. Editor operations

- [x] 4.1 Red: extend [src/hooks/useTreeOperations.test.ts](src/hooks/useTreeOperations.test.ts) —
  multi-node apply is one commit; ineligible nodes skipped; clear via `undefined`; no commit when
  nothing changes; subtree apply covers descendants; ancestor+descendant selections dedupe to one
  subtree apply; type filter narrows; whole-document apply with and without a filter; and
  order-independence for both multi-node operations (design D7)
- [x] 4.2 Green: add `changeNodeContributionMode`, `changeSubtreeContributionMode`, and
  `changeDocumentContributionMode` ([src/hooks/useTreeOperations.ts](src/hooks/useTreeOperations.ts)),
  exposed through the `useTreeEditor` handle ([src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts))
- [x] 4.3 Refactor: drop the per-iteration index rebuild — setting a mode never moves a node, so the
  paths captured up front stay valid for the batch (design D7)

## 5. Selection toolbar picker

- [x] 5.1 Red: extend [src/components/FloatingToolbar.test.tsx](src/components/FloatingToolbar.test.tsx)
  — trigger hidden with no selection and while editing; panel closed until opened; trigger summarises
  the mode and reads `Mixed` for a mixed selection; `PROPOSAL` disabled without a proposable node and
  under a non-proposable type filter; each choice applies its value; pressed state tracks the
  selection; `Escape` closes; `I` opens; `1`–`4` apply and close; shortcuts ignored while typing and
  with modifiers
- [x] 5.2 Green: add the picker, scope toggle, and type filter to
  [src/components/FloatingToolbar.tsx](src/components/FloatingToolbar.tsx), wired from
  [src/components/TreeEditor.tsx](src/components/TreeEditor.tsx) (selection mode summary, proposable
  gate, scope/filter state)
- [x] 5.3 Refactor: move the bulk scope/filter types to [src/types/editor.ts](src/types/editor.ts) and
  the shared mode presentation to
  [src/components/contribution-mode-ui.ts](src/components/contribution-mode-ui.ts), removing the
  component-to-component import and the triplicated mode-to-icon/label table

## 6. Whole-document menu and tree indicator

- [x] 6.1 Red: add [src/components/DocumentContributionModeMenu.test.tsx](src/components/DocumentContributionModeMenu.test.tsx)
  (panel toggling, apply with and without a filter, `Default` clears, `PROPOSAL` disabled under a
  non-proposable filter, closes after applying and on `Escape`), extend
  [src/components/EditorInterface.test.tsx](src/components/EditorInterface.test.tsx) for the
  end-to-end whole-document apply, and
  [src/components/RecursiveTreeNode.test.tsx](src/components/RecursiveTreeNode.test.tsx) for the
  indicator and the data attribute
- [x] 6.2 Green: add `DocumentContributionModeMenu`, mount it from
  [src/components/Toolbar.tsx](src/components/Toolbar.tsx) via
  [src/components/EditorInterface.tsx](src/components/EditorInterface.tsx), and add the pill plus
  `data-contribution-mode` to
  [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx)
- [x] 6.3 Refactor: confirm both pickers disable an apply that the clamp would silently swallow
  (design D5)

## 7. Round-trip

- [x] 7.1 Red: extend [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts) (set modes
  serialize, absent ones produce no key, and the envelope re-parses to an equal tree) and
  [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts) (modes reconstructed from a
  valid envelope; an envelope with `PROPOSAL` on a list is rejected)
- [x] 7.2 Green: no code change needed — the field is additive and the existing envelope
  serialization and validation cover it (design D9)
- [x] 7.3 Refactor: confirm `DOC_TREE_VERSION` and the IndexedDB `SCHEMA_VERSION` are untouched and
  no migration is registered

## 8. Verification

- [x] 8.1 `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm run test:run` — all green
- [x] 8.2 Smoke pass against a running `npm run dev`, driven through a real browser (15/15 checks):
  editor opens from pasted text; the picker appears on selection and is hidden otherwise; `REMARK`
  applies to the selected node and shows its pill without hovering; the trigger summarises the mode;
  `I` opens the picker and `4` applies `PROPOSAL` and closes it; one `Ctrl+Z` reverts a mode change;
  a whole-document apply marks every node and undoes in a single step; `PROPOSAL` is disabled under a
  `LIST` type filter; Download JSON emits exactly one `contributionMode` with the right value in a
  well-formed `DocTreeVersion: 1` envelope; no application-level console errors
- [x] 8.2b Second smoke pass over a document with real nesting (heading → content + list → list
  items → content), 9/9: the `+ Inside` scope marks the selected heading and its whole subtree (7
  nodes) and leaves the sibling heading's subtree untouched; the subtree apply undoes in one step;
  the selection-level `CONTENT` type filter marks only the content nodes inside the subtree; the
  exported envelope carries exactly those modes; and re-importing the downloaded file through the
  upload flow reopens the editor with the modes intact
- [ ] 8.3 Confirm with the Demokratis backend that the platform importer accepts `contributionMode`
  on the DocTree envelope and lowercase-folds the `UPPERCASE` values (design Risks). This is the one
  assumption no test in this repository can verify — the same open item
  `add-loadfile-json-support` carried for its content-type assumption
- [ ] 8.4 Decide whether the read-only Preview pane should indicate contribution modes. Currently a
  documented non-goal (design Non-Goals); revisit if structurers find the tree-only indicator
  insufficient

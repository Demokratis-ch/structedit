## ADDED Requirements

### Requirement: Contribution modes are defined and optional on every node

The system SHALL define exactly three contribution modes — `NONE`, `REMARK`, `PROPOSAL` — exposed as
a `ContributionMode` string-literal union with `UPPERCASE` values matching the Demokratis platform's
`DocNodeContributionMode`. Every node type, the document root and container types included, SHALL
carry an **optional** `contributionMode` field. An absent field SHALL mean "default for the element
type" (Demokratis's `null`) and SHALL NOT be represented by any member of the union.

#### Scenario: The union exposes all three modes

- **WHEN** the type definitions are loaded
- **THEN** `ContributionMode` resolves to `'NONE' | 'REMARK' | 'PROPOSAL'` and no other values are
  accepted

#### Scenario: Every node type may carry the field

- **WHEN** a node of any type — `DOCUMENT`, `LIST`, `LIST_ITEM`, `HEADING`, `CONTENT`, `FOOTNOTE`,
  `IMAGE` — is constructed
- **THEN** `contributionMode` is an allowed optional field on it, and omitting it yields a valid node

### Requirement: A per-type allow-list restricts which modes a node may carry

The system SHALL expose `ALLOWED_MODES`, a per-node-type table of permitted contribution modes, as
the single source of truth for validation and the mode pickers. `NONE` and `REMARK` SHALL be
permitted on every node type. `PROPOSAL` SHALL be permitted only on the proposable types —
`HEADING`, `CONTENT`, `FOOTNOTE` — exposed as `PROPOSABLE_TYPES`, mirroring Demokratis
`DocNodeType::isProposable()`. The table SHALL be declared such that adding a node type without
declaring its modes is a compile-time error. A helper `canHaveMode(nodeType, mode)` SHALL answer the
question for any type/mode pair.

#### Scenario: Proposal is permitted on a content node

- **WHEN** `canHaveMode` is asked whether `CONTENT` may carry `PROPOSAL`
- **THEN** it returns `true`

#### Scenario: Proposal is refused on containers and images

- **WHEN** `canHaveMode` is asked whether `DOCUMENT`, `LIST`, `LIST_ITEM`, or `IMAGE` may carry
  `PROPOSAL`
- **THEN** it returns `false` for each

#### Scenario: Lock and remark are permitted everywhere

- **WHEN** `canHaveMode` is asked whether any node type may carry `NONE` or `REMARK`
- **THEN** it returns `true` in every case

### Requirement: Validation rejects unknown and disallowed modes

`isValidNode` and `isValidDocument` SHALL reject any node whose `contributionMode` is present but is
not a member of `ContributionMode`, or is a mode its node type may not carry. A node with no
`contributionMode` SHALL always be valid with respect to this rule. The check SHALL apply uniformly
to every node type, including the document root and container types.

#### Scenario: A node with no mode is valid

- **WHEN** `isValidNode` is given an otherwise-valid `CONTENT` node with no `contributionMode`
- **THEN** it returns `true`

#### Scenario: An unknown mode value is rejected

- **WHEN** `isValidNode` is given a node whose `contributionMode` is `'MAYBE'`
- **THEN** it returns `false`

#### Scenario: A disallowed mode for the type is rejected

- **WHEN** `isValidNode` is given a `LIST` node with `contributionMode: 'PROPOSAL'`
- **THEN** it returns `false`

#### Scenario: An invalid mode anywhere invalidates the document

- **WHEN** `isValidDocument` is given a tree containing one list node with
  `contributionMode: 'PROPOSAL'`
- **THEN** it returns `false`

### Requirement: A mode can be set on or cleared from a single node

The system SHALL provide `setNodeContributionMode(root, path, mode)`, returning a new tree with the
node at `path` carrying the given mode. Passing `undefined` SHALL **remove the field entirely**, not
write an `undefined` value. The function SHALL return the original root reference unchanged when the
path resolves to no node, when the requested mode is not allowed for the node's type, or when the
node already carries the requested mode.

#### Scenario: Setting a mode on an eligible node

- **WHEN** `setNodeContributionMode` is called with `REMARK` on a heading with no mode
- **THEN** the returned tree's heading carries `contributionMode: 'REMARK'` and the input tree is
  unmodified

#### Scenario: Clearing removes the field

- **WHEN** `setNodeContributionMode` is called with `undefined` on a node carrying `NONE`
- **THEN** the returned node has no `contributionMode` key at all, so serializing it produces the
  same JSON as a node whose mode was never set

#### Scenario: A disallowed mode is a no-op

- **WHEN** `setNodeContributionMode` is called with `PROPOSAL` on a list node
- **THEN** the original root reference is returned and the list node is unchanged

#### Scenario: Setting the mode a node already has preserves the reference

- **WHEN** `setNodeContributionMode` is called with `REMARK` on a node already carrying `REMARK`
- **THEN** the original root reference is returned

### Requirement: A mode can be applied across a subtree with an optional type filter

The system SHALL provide `setSubtreeContributionMode(root, path, mode, typeFilter?)`, applying the
mode to the node at `path` and all of its descendants. When `typeFilter` is given, only nodes of
that exact type SHALL be affected. Nodes whose type may not carry the requested mode SHALL be left
untouched rather than causing the operation to fail — so a bulk apply can never produce a tree that
fails validation. Passing `undefined` as the mode SHALL clear it across the affected nodes. An empty
path SHALL target the document root, making a whole-document apply a use of this function. The
original root reference SHALL be returned when nothing in the subtree changed.

#### Scenario: Applying to a node and its descendants

- **WHEN** `setSubtreeContributionMode` is called with `REMARK` on a heading that contains a nested
  heading and two content nodes
- **THEN** the heading and all three descendants carry `REMARK`

#### Scenario: A type filter narrows the apply

- **WHEN** `setSubtreeContributionMode` is called with `REMARK` and `typeFilter: 'CONTENT'` on a
  heading containing content and heading descendants
- **THEN** only the content descendants carry `REMARK`, and the headings are unchanged

#### Scenario: Ineligible nodes are skipped, not rejected

- **WHEN** `setSubtreeContributionMode` is called with `PROPOSAL` over a subtree containing headings,
  a list, and its list items
- **THEN** the headings carry `PROPOSAL`, the list and list items are unchanged, and the resulting
  document is valid

#### Scenario: Clearing across a subtree

- **WHEN** `setSubtreeContributionMode` is called with `undefined` over a subtree whose nodes carry
  assorted modes
- **THEN** no node in the subtree has a `contributionMode` field

### Requirement: The editor sets modes on a selection, a subtree, or the whole document

The editor SHALL expose three operations, each committing **exactly one** history entry so a bulk
apply is undone in a single step: `changeNodeContributionMode(ids, mode)` for the selected nodes
only, `changeSubtreeContributionMode(ids, mode, typeFilter?)` for each selected node plus its
descendants, and `changeDocumentContributionMode(mode, typeFilter?)` for the entire document. When a
selection contains both a node and one of its descendants, the subtree operation SHALL apply the
outermost subtree once rather than applying twice. None of the three SHALL commit when the requested
change affects no node.

#### Scenario: A multi-node apply is one history entry

- **WHEN** `changeNodeContributionMode` is called with `REMARK` for two selected node ids
- **THEN** both nodes carry `REMARK` and exactly one commit is made

#### Scenario: Order of ids does not affect the result

- **WHEN** `changeNodeContributionMode` is called for a set of ids spanning several tree depths, and
  again for the same set in reverse order
- **THEN** every named node carries the mode in both cases

#### Scenario: Ancestor and descendant selected together

- **WHEN** `changeSubtreeContributionMode` is called with `NONE` for a heading and a content node
  inside it
- **THEN** one commit is made and the heading and all of its descendants carry `NONE`

#### Scenario: Nothing changes, nothing is committed

- **WHEN** `changeNodeContributionMode` is called with `PROPOSAL` for a selection containing only a
  list node
- **THEN** no commit is made

#### Scenario: Whole-document apply with a type filter

- **WHEN** `changeDocumentContributionMode` is called with `REMARK` and `typeFilter: 'CONTENT'`
- **THEN** every content node in the document carries `REMARK`, every other node is unchanged, and
  one commit is made

### Requirement: Modes survive the structural mutations

Wherever a mutation preserves a node's identity, it SHALL preserve that node's contribution mode,
clamped to the resulting node's type: a mode the new type may not carry SHALL be dropped to absent
rather than retained or replaced. Specifically: a type change SHALL carry the mode when the target
type allows it; a merge SHALL take the first node's mode, matching how the merged node takes the
first node's id; flattening a list to content nodes SHALL prefer the content child's own mode and
fall back to its list item's; converting a single list item SHALL carry the item's mode. A newly
created node SHALL carry no mode.

#### Scenario: Type change carries an allowed mode

- **WHEN** a heading carrying `REMARK` is changed to a content node
- **THEN** the resulting content node carries `REMARK`

#### Scenario: Type change clamps a disallowed mode to absent

- **WHEN** a content node carrying `PROPOSAL` is changed to a list
- **THEN** no node in the resulting list carries `PROPOSAL` on a container, and the mode lands on
  the inner content node that inherits the original node's identity

#### Scenario: Merge is first-node-wins

- **WHEN** a content node carrying `NONE` is merged with a following content node carrying `REMARK`
- **THEN** the merged node keeps the first node's id and carries `NONE`

#### Scenario: Flattening prefers the content child's mode

- **WHEN** a list item whose content child carries `PROPOSAL` is flattened to content nodes
- **THEN** the synthesized content node carries `PROPOSAL`

#### Scenario: A new node carries no mode

- **WHEN** a new sibling node is created
- **THEN** it has no `contributionMode` field

#### Scenario: Moving a node preserves its mode

- **WHEN** a heading carrying `PROPOSAL` is outdented out of a list item
- **THEN** the lifted heading still carries `PROPOSAL`

### Requirement: The selection toolbar offers a contribution-mode picker

While nodes are selected and no node is being edited, the selection toolbar SHALL offer a
contribution-mode control summarising the selection's current mode — the mode itself when all
selected nodes agree, `Default` when none carry one, and `Mixed` when they differ. Opening it SHALL
reveal the four choices (Default, None, Remark, Proposal), a scope toggle between the selected
elements only and the elements plus their descendants, and a node-type filter. The control SHALL be
hidden when nothing is selected and while editing. `PROPOSAL` SHALL be disabled when the selection
contains no proposable node, and when the node-type filter names a type that cannot carry it — in
both cases the apply would silently affect nothing.

#### Scenario: Hidden with no selection or while editing

- **WHEN** the toolbar renders with nothing selected, or with a selection while a node is being
  edited
- **THEN** the contribution-mode control is not rendered

#### Scenario: The trigger summarises the selection

- **WHEN** every selected node carries `REMARK`
- **THEN** the trigger reads `Remark`; and when the selected nodes carry differing modes it reads
  `Mixed`

#### Scenario: Proposal disabled for a selection with nothing proposable

- **WHEN** the picker is opened for a selection containing no heading, content, or footnote
- **THEN** the `Proposal` choice is disabled

#### Scenario: Proposal disabled by a non-proposable type filter

- **WHEN** the picker is opened with a proposable node selected and the node-type filter set to
  `LIST`
- **THEN** the `Proposal` choice is disabled, and the other choices remain enabled

#### Scenario: Choosing a mode applies it

- **WHEN** a choice is clicked
- **THEN** the corresponding mode is applied to the selection — `undefined` for `Default` — using the
  currently selected scope and type filter

### Requirement: The contribution-mode picker is keyboard operable

In selection mode, pressing `I` with no modifier SHALL open the contribution-mode picker; while it is
open, the digits `1`–`4` SHALL apply the four choices in display order (Default, None, Remark,
Proposal) and close it, and `Escape` SHALL close it without applying. The shortcuts SHALL be ignored
while the user is typing into an editable target and when a modifier key is held.

#### Scenario: Opening with the bare key

- **WHEN** `I` is pressed in selection mode
- **THEN** the picker opens

#### Scenario: Digits apply their mode and close the picker

- **WHEN** the picker is open and `3` is pressed
- **THEN** `REMARK` is applied once and the picker closes

#### Scenario: Digits do nothing while the picker is closed

- **WHEN** `3` is pressed with the picker closed
- **THEN** no mode is applied

#### Scenario: Shortcuts yield to text entry and modifiers

- **WHEN** `I` is pressed while focus is in an editable element, or pressed together with a modifier
- **THEN** the picker does not open

### Requirement: The top toolbar offers a whole-document apply

The top toolbar SHALL offer a menu applying a contribution mode across the entire document,
optionally restricted to one node type, closing after an apply and on `Escape` or an outside click.
`PROPOSAL` SHALL be disabled when the chosen type filter names a type that cannot carry it.

#### Scenario: Applying across the document

- **WHEN** a mode is chosen with no type filter
- **THEN** it is applied to every node in the document that can carry it, in one undoable step

#### Scenario: The type filter restricts the apply

- **WHEN** a node type is chosen in the filter and a mode is applied
- **THEN** only nodes of that type are affected

#### Scenario: Default clears across the document

- **WHEN** `Default` is chosen
- **THEN** the mode is cleared from the affected nodes

### Requirement: The tree shows which nodes carry a mode

A node carrying a contribution mode SHALL display a persistent indicator in the tree — visible
without hovering or selecting — with an icon and a description of the mode. A node with no mode SHALL
display no indicator. Every rendered node SHALL expose its mode as a data attribute for styling and
testing, reading `default` when no mode is set.

#### Scenario: A marked node shows an indicator

- **WHEN** a node carries `REMARK`
- **THEN** an indicator describing the remark mode is rendered for that node without interaction

#### Scenario: An unmarked node shows none

- **WHEN** a node carries no mode
- **THEN** no mode indicator is rendered, and its data attribute reads `default`

### Requirement: Contribution modes round-trip through the DocTree envelope

Exporting a document SHALL serialize each set contribution mode and SHALL omit the field entirely for
nodes that carry none. Importing a DocTree envelope SHALL reconstruct the modes, and SHALL reject an
envelope containing a mode that its node's type may not carry, using the existing invalid-document
error. The envelope's `DocTreeVersion` and the persistence schema version SHALL be unchanged, and no
migration SHALL be required — documents written before this feature remain valid, every node simply
carrying no mode.

#### Scenario: Set modes serialize, absent ones do not appear

- **WHEN** a document with one node carrying `PROPOSAL` and one carrying nothing is exported
- **THEN** the JSON contains exactly one `contributionMode` occurrence, with the value `PROPOSAL`

#### Scenario: Modes are reconstructed on import

- **WHEN** a valid envelope whose first node carries `REMARK` is imported
- **THEN** the resulting tree's first node carries `REMARK`

#### Scenario: An invalid mode fails the import

- **WHEN** an envelope containing a list node with `contributionMode: 'PROPOSAL'` is imported
- **THEN** the import fails with the existing invalid-document error

#### Scenario: Documents predating the feature stay valid

- **WHEN** a document written before this change is loaded from persistence or an envelope
- **THEN** it validates unchanged, with no node carrying a contribution mode and no migration run

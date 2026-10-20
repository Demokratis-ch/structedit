# Spec Delta

## Purpose

Describes how the tree editor edits each node type — text editing versus number editing — and how selected nodes convert between types from the toolbar and keyboard, including the wrap and dissolve semantics of container types.

## ADDED Requirements

### Requirement: A content group is edited by its number, never by text
In the tree editor a `CONTENT_GROUP` SHALL render as a numbered container: an editable number badge, a `(content_group)` label and its nested children, with no editable text surface. Enter on a selected group and double-click on it SHALL open number editing, never text editing — the same rule that applies to every numbered container (`LIST`, `LIST_ITEM`).

#### Scenario: Group renders as a container with its number
- **WHEN** a `CONTENT_GROUP` with `number: '2'` is rendered in the tree
- **THEN** the number badge shows `2`, the `(content_group)` label is visible and no content-editable element is rendered for the group itself

#### Scenario: Enter on a selected group edits its number
- **WHEN** a single `CONTENT_GROUP` is selected (not editing) and the user presses Enter
- **THEN** the group's number input receives focus and no text edit mode is entered

#### Scenario: Double-click on a numbered container edits its number
- **WHEN** the user double-clicks a `CONTENT_GROUP`, a `LIST` or a `LIST_ITEM` row
- **THEN** that node's number input opens, no text edit mode is entered, and double-clicking a paragraph inside the group still opens its text editor

### Requirement: Table and definition list edit their Markdown source
In the tree editor a `TABLE` or `DEFINITION_LIST` SHALL render like a content node: a number badge and a content-editable block showing the raw `MARKDOWN` source while editing and the rendered output otherwise. The type indicator SHALL show the node type and format.

#### Scenario: Table renders its source for editing
- **WHEN** a `TABLE` node is in edit mode
- **THEN** the editable block shows the literal pipe-table source

#### Scenario: Definition list shows its type indicator
- **WHEN** a `DEFINITION_LIST` node is rendered
- **THEN** the type indicator reads `DEFINITION_LIST · MARKDOWN`

### Requirement: Text nodes convert to and from tables and definition lists
Converting a `HEADING`, `CONTENT` or `FOOTNOTE` to `TABLE` or `DEFINITION_LIST` SHALL replace it in place keeping `id`, `number` and `contents`, set `format` to `MARKDOWN`, and lift any children as following siblings. `TABLE` and `DEFINITION_LIST` SHALL convert to each other in place and to `HEADING`, `CONTENT`, `FOOTNOTE` or `LIST` through the existing conversions. A conversion the parent cannot hold SHALL be refused.

#### Scenario: Content becomes a table
- **WHEN** a `CONTENT` node with `format: 'TEXT'` and contents `| a |` is converted to `TABLE`
- **THEN** the node at the same position is a `TABLE` with the same `id`, `number` and `contents` and `format: 'MARKDOWN'`

#### Scenario: Footnote children are lifted when content becomes a table
- **WHEN** a `CONTENT` node with one `FOOTNOTE` child is converted to `TABLE`
- **THEN** the `TABLE` has no `children` field and the footnote follows it as a sibling

#### Scenario: Table becomes a heading with the default heading format
- **WHEN** a `TABLE` is converted to `HEADING`
- **THEN** the result is a `HEADING` with the same `contents`, `format: 'TEXT'` and no children

#### Scenario: Table and definition list swap in place
- **WHEN** a `TABLE` is converted to `DEFINITION_LIST`
- **THEN** only `type` changes; `id`, `number`, `contents` and `format: 'MARKDOWN'` are kept

#### Scenario: Conversion the parent cannot hold is refused
- **WHEN** a `FOOTNOTE` nested under a `CONTENT` is converted to `TABLE`
- **THEN** the conversion returns no document and the tree is unchanged

#### Scenario: Lists do not convert to tables
- **WHEN** a `LIST` or `LIST_ITEM` is converted to `TABLE` or `DEFINITION_LIST`
- **THEN** the conversion is refused

### Requirement: Content and list nodes wrap into a content group
Converting a `CONTENT` or `LIST` to `CONTENT_GROUP` SHALL wrap it: a new group with a fresh `id`, the node's `number`, `contents: {}`, `format: 'TEXT'` takes the node's place, and the node becomes the group's only child keeping its `id` with `number: null`. The conversion SHALL be refused when the parent cannot hold a group and for every other source type.

#### Scenario: Numbered paragraph becomes a group carrying the number
- **WHEN** a `CONTENT` with `number: '2'` under a `HEADING` is converted to `CONTENT_GROUP`
- **THEN** a `CONTENT_GROUP` with `number: '2'` stands in its place whose only child is the original `CONTENT` (same `id`, `number: null`, contents unchanged)

#### Scenario: A list becomes a group's child
- **WHEN** a `LIST` under the document root is converted to `CONTENT_GROUP`
- **THEN** a `CONTENT_GROUP` stands in its place whose only child is that `LIST`

#### Scenario: Wrapping inside a list item is refused
- **WHEN** a `CONTENT` inside a `LIST_ITEM` is converted to `CONTENT_GROUP`
- **THEN** the conversion is refused

#### Scenario: Headings and footnotes do not wrap
- **WHEN** a `HEADING`, `FOOTNOTE`, `IMAGE`, `TABLE` or `DEFINITION_LIST` is converted to `CONTENT_GROUP`
- **THEN** the conversion is refused

### Requirement: A content group dissolves into its children
Converting a `CONTENT_GROUP` to `CONTENT` SHALL remove the group and lift its children in place. The group's `number` SHALL move onto the first child when that child is a `CONTENT` without a number; otherwise a `CONTENT` carrying the number and the group's `id` SHALL be inserted before the children. Converting a group to any other type SHALL be refused.

#### Scenario: Dissolve moves the number onto the first paragraph
- **WHEN** a `CONTENT_GROUP` with `number: '2'` whose children are a `CONTENT` (`number: null`) and a `LIST` is converted to `CONTENT`
- **THEN** the group is gone, the `CONTENT` now has `number: '2'` and the `LIST` follows it as a sibling

#### Scenario: Dissolve synthesizes a numbered paragraph when the first child is a list
- **WHEN** a `CONTENT_GROUP` with `number: '3'` whose only child is a `LIST` is converted to `CONTENT`
- **THEN** an empty `CONTENT` with `number: '3'` precedes the lifted `LIST`

#### Scenario: Group to heading is refused
- **WHEN** a `CONTENT_GROUP` is converted to `HEADING`, `FOOTNOTE`, `LIST`, `TABLE` or `DEFINITION_LIST`
- **THEN** the conversion is refused

### Requirement: Toolbar and keyboard expose the new conversions
The floating toolbar SHALL offer buttons titled `Table (B)`, `Definition List (D)` and `Content Group (G)`, highlighted when the single selected node is of that type, and the keys `B`, `D`, `G` SHALL apply the same conversions to the selection outside edit mode.

#### Scenario: B converts the selected paragraph to a table
- **WHEN** a `CONTENT` node is selected and the user presses `b`
- **THEN** the node becomes a `TABLE`

#### Scenario: G wraps the selected paragraph into a group
- **WHEN** a `CONTENT` node under a heading is selected and the user presses `g`
- **THEN** a `CONTENT_GROUP` now holds that node

#### Scenario: Toolbar highlights the selected table
- **WHEN** a single `TABLE` node is selected
- **THEN** the `Table (B)` button is shown as active

### Requirement: Adjacent content groups merge like list items
Merging two or more contiguous `CONTENT_GROUP` siblings SHALL produce one group that keeps the first group's `id` and `number` and concatenates all children in order.

#### Scenario: Two groups merge into one
- **WHEN** two sibling `CONTENT_GROUP`s with one child each are merged
- **THEN** one `CONTENT_GROUP` remains with the first group's `id` and `number` and both children in order

### Requirement: Structural moves honour the group rules
Indent, outdent and drag & drop SHALL use the parent→child rules, so a node can be moved into a `CONTENT_GROUP` only when the group may hold it, and a `CONTENT_GROUP` can only be placed under `DOCUMENT` or `HEADING`.

#### Scenario: Dropping a content node into a group succeeds
- **WHEN** a `CONTENT` is dropped onto a child of a `CONTENT_GROUP`
- **THEN** the move succeeds and the `CONTENT` is now a child of the group

#### Scenario: Dropping a heading into a group is refused
- **WHEN** a `HEADING` is dropped onto a child of a `CONTENT_GROUP`
- **THEN** the move is refused with a reason naming the group

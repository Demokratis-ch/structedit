# Spec Delta

## Purpose

Defines the DocTree data model StructEdit edits and exchanges with the Demokratis platform: the node type set, each type's shape, the parent→child rules, and the validation that enforces them for documents at rest and on the wire.

## ADDED Requirements

### Requirement: Node type set mirrors the platform document body
The system SHALL define exactly ten node types — `DOCUMENT`, `HEADING`, `CONTENT_GROUP`, `CONTENT`, `TABLE`, `DEFINITION_LIST`, `LIST`, `LIST_ITEM`, `FOOTNOTE`, `IMAGE` — with `SCREAMING_SNAKE_CASE` values identical to the Demokratis DocTree v1 envelope, so JSON crossing the boundary needs no translation. Validation SHALL reject a node of any other type.

#### Scenario: A document using all three platform types is valid
- **WHEN** `isValidDocument` is given a tree containing a `CONTENT_GROUP`, a `TABLE` and a `DEFINITION_LIST` placed per the parent→child rules
- **THEN** it returns `true`

#### Scenario: An unknown node type is rejected
- **WHEN** `isValidNode` is given a node whose `type` is not one of the ten types
- **THEN** it returns `false`

### Requirement: Parent→child rules match the platform
`DOCUMENT` and `HEADING` SHALL accept `HEADING`, `LIST`, `CONTENT`, `FOOTNOTE`, `IMAGE`, `CONTENT_GROUP`, `TABLE`, `DEFINITION_LIST`. `LIST_ITEM` SHALL accept the same set except `CONTENT_GROUP`. `CONTENT_GROUP` SHALL accept only `LIST`, `CONTENT`, `IMAGE`. `LIST` SHALL accept only `LIST_ITEM`; `CONTENT` only `FOOTNOTE`. `canBeChildOf` SHALL be the single source of truth for validation, drag & drop, indentation and type changes.

#### Scenario: Content group under the document root or a heading is valid
- **WHEN** a `CONTENT_GROUP` is a child of `DOCUMENT` or of `HEADING`
- **THEN** `canBeChildOf('CONTENT_GROUP', parent)` returns `true` and the tree validates

#### Scenario: Content group under a list item is invalid
- **WHEN** a `CONTENT_GROUP` is a child of `LIST_ITEM`
- **THEN** `canBeChildOf` returns `false` and `isValidDocument` returns `false`

#### Scenario: Content groups do not nest
- **WHEN** a `CONTENT_GROUP` is a child of another `CONTENT_GROUP`
- **THEN** `canBeChildOf` returns `false`

#### Scenario: A heading, footnote or table inside a content group is invalid
- **WHEN** a `HEADING`, `FOOTNOTE`, `TABLE` or `DEFINITION_LIST` is a child of `CONTENT_GROUP`
- **THEN** `canBeChildOf` returns `false`

#### Scenario: A list, content or image inside a content group is valid
- **WHEN** a `LIST`, `CONTENT` or `IMAGE` is a child of `CONTENT_GROUP`
- **THEN** `canBeChildOf` returns `true`

#### Scenario: Table and definition list under a list item are valid
- **WHEN** a `TABLE` or `DEFINITION_LIST` is a child of `LIST_ITEM`
- **THEN** `canBeChildOf` returns `true`

#### Scenario: Table under a content node is invalid
- **WHEN** a `TABLE` or `DEFINITION_LIST` is a child of `CONTENT`
- **THEN** `canBeChildOf` returns `false`

#### Scenario: Drag & drop refuses a placement the rules forbid
- **WHEN** the user drops a `CONTENT_GROUP` so that it would become a child of a `LIST_ITEM`
- **THEN** the move is refused and the document is unchanged

### Requirement: TABLE and DEFINITION_LIST are content-bearing leaves
A `TABLE` or `DEFINITION_LIST` node SHALL carry `id`, `number`, `contents` and `format` and SHALL NOT carry a `children` field. Validation SHALL reject a node of either type that has `children` or lacks `contents`.

#### Scenario: Table with a children field is invalid
- **WHEN** `isValidNode` is given a `TABLE` with `children: []`
- **THEN** it returns `false`

#### Scenario: Definition list without contents is invalid
- **WHEN** `isValidNode` is given a `DEFINITION_LIST` with `format: 'MARKDOWN'` and no `contents`
- **THEN** it returns `false`

#### Scenario: Well-formed table is valid
- **WHEN** `isValidNode` is given `{ id, number: '', type: 'TABLE', contents: { de: '| a |\n| - |\n| 1 |' }, format: 'MARKDOWN' }`
- **THEN** it returns `true`

### Requirement: CONTENT_GROUP carries the platform wire shape
A `CONTENT_GROUP` SHALL carry `id`, `number`, `contents`, `format` and `children`. `contents` SHALL be language-keyed strings (normally empty) and `format` one of the group's allowed formats; both are required because the platform emits and requires them, although it never displays them. Validation SHALL reject a group missing any of these fields.

#### Scenario: Group with empty contents and a number is valid
- **WHEN** `isValidNode` is given `{ id, number: '2', type: 'CONTENT_GROUP', contents: {}, format: 'TEXT', children: [] }`
- **THEN** it returns `true`

#### Scenario: Group as exported by the platform is valid
- **WHEN** `isValidNode` is given a `CONTENT_GROUP` whose `contents` is `{ de: '' }` and whose `format` is `TEXT`
- **THEN** it returns `true`

#### Scenario: Group missing contents or format is invalid
- **WHEN** `isValidNode` is given a `CONTENT_GROUP` without `contents`, or without `format`
- **THEN** it returns `false`

#### Scenario: Group missing children is invalid
- **WHEN** `isValidNode` is given a `CONTENT_GROUP` with `contents` and `format` but no `children` array
- **THEN** it returns `false`

### Requirement: Every non-root node carries a number
Every node other than the `DOCUMENT` root SHALL carry a `number` that is a string or `null`, including `TABLE`, `DEFINITION_LIST` and `CONTENT_GROUP`. The root SHALL carry no number (an explicit `null` is tolerated).

#### Scenario: Table without a number field is invalid
- **WHEN** `isValidNode` is given a `TABLE` with `contents` and `format` but no `number` field
- **THEN** it returns `false`

#### Scenario: Platform export numbers an unnumbered table with the empty string
- **WHEN** `isValidNode` is given a `TABLE` with `number: ''`
- **THEN** it returns `true`

### Requirement: Existing stored documents stay valid without migration
Adding the three types SHALL NOT change the stored-document schema version. An entry persisted before the types existed SHALL load unchanged, and an entry of the current schema version containing the new types SHALL load.

#### Scenario: Pre-existing current-version entry loads unchanged
- **WHEN** a stored entry of the current schema version whose tree contains none of the new types is migrated
- **THEN** it loads as a usable entry with the same tree

#### Scenario: Current-version entry with the new types loads
- **WHEN** a stored entry of the current schema version whose tree contains a `CONTENT_GROUP`, a `TABLE` and a `DEFINITION_LIST` is migrated
- **THEN** it loads as a usable entry, not an incompatible one

### Requirement: Platform envelopes containing the new types open and round-trip
A DocTree v1 envelope produced by the platform that contains `CONTENT_GROUP`, `TABLE` or `DEFINITION_LIST` nodes SHALL open in the editor via `.json` file upload and via the `loadFile` URL flow, and exporting the opened document SHALL yield the same `document` tree.

#### Scenario: Upload opens a platform export
- **WHEN** a `.json` file holding such an envelope is uploaded
- **THEN** the editor opens with the envelope's tree and the three node types are present in the tree

#### Scenario: loadFile opens a platform export
- **WHEN** the `loadFile` URL serves such an envelope as `application/json`
- **THEN** the editor opens with the envelope's tree and no unsupported-format error is shown

#### Scenario: Export round-trips the tree
- **WHEN** the opened document is wrapped for export without edits
- **THEN** the exported `document` deep-equals the envelope's `document`

## ADDED Requirements

### Requirement: A second document can be merged in as another language

The system SHALL offer an action that takes a second document — through the same import pipeline as
any upload (HTML, DOCX or DocTree JSON) — and merges its text into the open document as a chosen
language. The action SHALL show the language the import reports for the second document and SHALL
let the operator change it before the merge runs. Only `contents[mergeLanguage]` SHALL be added:
structure, `id`s, `number`s and `format`s of the open document SHALL be untouched.

#### Scenario: A French capture merges into a German document

- **WHEN** a German document is open and the operator merges a French capture with the same
  structure as French
- **THEN** every node carries its original German contents plus the French text from its
  counterpart, and the header reports the document as carrying both languages

#### Scenario: The merge adds nothing but text

- **WHEN** the same merge runs
- **THEN** no node's `id`, `number`, `format` or position changes, and no node is added or removed

#### Scenario: A DocTree envelope can be the translation

- **WHEN** the operator merges a DocTree JSON envelope as the translation
- **THEN** it is processed by the same envelope path as an upload and merged identically

#### Scenario: Nodes the translation does not cover stay untranslated

- **WHEN** a node's counterpart carries no content for the merge language
- **THEN** the merged node has no key for that language, and the tree shows it with the
  untranslated marker

### Requirement: Structures are matched by type and arity, recursively

The system SHALL match the two trees by the platform's rule: two nodes correspond when they have
the same `type` and the same number of children, checked recursively from the root with children
paired by position. Matching SHALL ignore `contents`, `number` and `format` entirely, since those
are what differ between languages.

#### Scenario: Identical structures with different text match

- **WHEN** two trees have the same node types and child counts throughout but entirely different
  text
- **THEN** the structures match and the merge proceeds

#### Scenario: A differing node type is a mismatch

- **WHEN** the translation has a `CONTENT` node where the open document has a `HEADING`
- **THEN** the structures do not match

#### Scenario: A differing child count is a mismatch

- **WHEN** a heading has three children in the open document and four in the translation
- **THEN** the structures do not match

#### Scenario: Numbers and formats do not affect matching

- **WHEN** corresponding nodes carry different `number` values or different formats
- **THEN** the structures still match

### Requirement: A mismatch merges nothing and says where

When the structures do not match, the system SHALL apply no change at all and SHALL report the
first divergence in document order: the path to the node, what each side has there (type and child
count), and which of the two rules failed. The report SHALL allow the operator to reveal the
offending node in the tree, and SHALL remain visible until dismissed.

#### Scenario: Nothing is applied on a mismatch

- **WHEN** a merge is attempted against a translation whose structure differs
- **THEN** the open document is byte-identical to what it was, and no history entry is committed

#### Scenario: The report names the location

- **WHEN** the divergence is at the second child of the fourth top-level node
- **THEN** the report identifies that node by path, names the type and child count on each side,
  and states whether the type or the child count differed

#### Scenario: The first divergence is reported

- **WHEN** two trees diverge in several places
- **THEN** the report describes the first divergence in document order

#### Scenario: The operator can jump to the node

- **WHEN** the report is shown
- **THEN** an action reveals and selects the corresponding node in the open document's tree

### Requirement: A merge never overwrites existing content

The system SHALL refuse a merge when any node of the open document already carries content for the
chosen language, and SHALL make that check before applying anything, so no partial merge is
possible. The refusal SHALL name the language.

#### Scenario: An already-present language is refused

- **WHEN** the open document already carries French text on some nodes and a French translation is
  merged
- **THEN** the merge is refused, the message names French, and the document is unchanged

#### Scenario: A title-only translation does not block the merge

- **WHEN** the open document has a French `metadata.title` but no French content on any node
- **THEN** the merge proceeds

#### Scenario: A refused merge commits no history entry

- **WHEN** a merge is refused
- **THEN** the undo history is exactly as it was

### Requirement: A merge is one undoable step

A successful merge SHALL commit exactly one history entry, and undoing it SHALL restore the
document to its pre-merge state in a single step. The merged result SHALL be persisted by the
existing autosave and SHALL resume with every merged language intact.

#### Scenario: Undo removes the merged language

- **WHEN** the operator merges a translation and presses undo
- **THEN** the document carries only the languages it had before the merge, with its other content
  unchanged

#### Scenario: The merged document survives a reload

- **WHEN** a merged document is autosaved and the page is reloaded
- **THEN** resuming the entry opens a document carrying both languages

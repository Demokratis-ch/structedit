## ADDED Requirements

### Requirement: Question node types are defined

The system SHALL define four `UPPERCASE` node types for questionnaire questions, matching the
Demokratis platform: `QUESTION` (a container that carries no `contents`/`format`),
`RADIOBUTTON` and `CHECKBOX` (content-bearing leaves whose `contents`+`format` hold an option label),
and `TEXTAREA` (a content-less leaf with no `contents`/`format`/`children`). All four SHALL be members
of `DocumentNode`; `QUESTION` SHALL additionally be a `BlockDocumentNode` and a `ParentDocumentNode`.

#### Scenario: The four types are part of the node model

- **WHEN** the type definitions are loaded
- **THEN** `QUESTION`, `RADIOBUTTON`, `CHECKBOX`, and `TEXTAREA` are valid `DocumentNode['type']`
  values, `QUESTION` carries a `children: QuestionChildNode[]` array, `RADIOBUTTON`/`CHECKBOX` carry
  `contents` + `format`, and `TEXTAREA` carries neither `contents`, `format`, nor `children`

### Requirement: A question is a validated wrapper subtree

The system SHALL model a question as a `QUESTION` node wrapping **exactly one** `CONTENT` child (the
prompt) plus **either** one or more option children of a **single** type (all `RADIOBUTTON`, or all
`CHECKBOX`) with no `TEXTAREA`, **or** exactly one `TEXTAREA` with no option children. `isValidNode`
and `isValidDocument` SHALL reject any `QUESTION` that violates this shape, that carries `contents` or
`format`, or that mixes `RADIOBUTTON` and `CHECKBOX`; and SHALL reject any `RADIOBUTTON`/`CHECKBOX`
with `children`, or any `TEXTAREA` that carries `contents`, `format`, or `children`.

#### Scenario: A valid single-choice question is accepted

- **WHEN** `isValidNode` is given a `QUESTION` whose children are one `CONTENT` followed by two
  `RADIOBUTTON` nodes
- **THEN** it returns `true`

#### Scenario: A valid text question is accepted

- **WHEN** `isValidNode` is given a `QUESTION` whose children are one `CONTENT` and one `TEXTAREA`
- **THEN** it returns `true`

#### Scenario: A question mixing option types is rejected

- **WHEN** `isValidNode` is given a `QUESTION` whose children include both a `RADIOBUTTON` and a
  `CHECKBOX`
- **THEN** it returns `false`

#### Scenario: A question with options and a textarea is rejected

- **WHEN** `isValidNode` is given a `QUESTION` whose children include an option node and a `TEXTAREA`
- **THEN** it returns `false`

#### Scenario: A question without exactly one prompt is rejected

- **WHEN** `isValidNode` is given a `QUESTION` with zero or two `CONTENT` children
- **THEN** it returns `false`

#### Scenario: A content-less TEXTAREA is required

- **WHEN** `isValidNode` is given a `TEXTAREA` node that carries a `contents` field
- **THEN** it returns `false`

### Requirement: Allowed placement of questions and options

The system SHALL allow a `QUESTION` node only as a child of `DOCUMENT`, `HEADING`, or `LIST_ITEM`, and
SHALL allow only `CONTENT`, `RADIOBUTTON`, `CHECKBOX`, and `TEXTAREA` as children of a `QUESTION`.
`canBeChildOf` SHALL be the single source of truth, kept in sync with the typed `children` unions by
the compile-time drift guard.

#### Scenario: Questions are allowed under document body nodes

- **WHEN** `canBeChildOf('QUESTION', parent)` is called for `parent` of `DOCUMENT`, `HEADING`, or
  `LIST_ITEM`
- **THEN** it returns `true`, and returns `false` for `LIST` or `CONTENT`

#### Scenario: Only question children are allowed inside a question

- **WHEN** `canBeChildOf(childType, 'QUESTION')` is called
- **THEN** it returns `true` for `CONTENT`/`RADIOBUTTON`/`CHECKBOX`/`TEXTAREA` and `false` for
  `HEADING`/`LIST`/`IMAGE`

### Requirement: Single vs multiple choice is encoded by option type

The system SHALL encode single-choice questions as `RADIOBUTTON` option children and multiple-choice
questions as `CHECKBOX` option children, with no separate flag on the `QUESTION` node. Switching a
question between single and multiple choice SHALL convert every option child between `RADIOBUTTON` and
`CHECKBOX` while preserving each option's `id`, `number`, `contents`, and `format`.

#### Scenario: Switching to multiple choice converts every option

- **WHEN** `setQuestionChoiceMode(document, questionPath, 'multiple')` is applied to a question whose
  options are `RADIOBUTTON`
- **THEN** every option child becomes a `CHECKBOX` with its label, id, and number unchanged

#### Scenario: Switching is a no-op for a text question or the current mode

- **WHEN** `setQuestionChoiceMode` targets a text question, or a question already in the requested mode
- **THEN** the same document reference is returned (no change, no history entry)

### Requirement: Option labels carry a restricted format

The system SHALL treat `RADIOBUTTON` and `CHECKBOX` as content-bearing types whose allowed formats are
`TEXT`, `NEWLINES`, and `MARKDOWN_MINIMAL` (default `TEXT`), and SHALL NOT allow a `format` on
`QUESTION` or `TEXTAREA`.

#### Scenario: canHaveFormat reflects the option allow-list

- **WHEN** `canHaveFormat('RADIOBUTTON', 'MARKDOWN_MINIMAL')` is called
- **THEN** it returns `true`, and `canHaveFormat('RADIOBUTTON', 'MARKDOWN')` returns `false`

### Requirement: Questions are authored inline in the tree

The system SHALL let an author create a question of flavour Text, Single choice, or Multiple choice
from an "Add question" control, inserting the question after the current selection when its parent
allows a `QUESTION` and otherwise appending it to the document root. The prompt and each option label
SHALL be editable inline like any other node. A choice question SHALL expose a control to toggle
single↔multiple and controls to add and remove options; a text question SHALL expose neither.

#### Scenario: Adding a single-choice question

- **WHEN** the author picks "Single choice" from the Add-question control
- **THEN** a `QUESTION` with a `CONTENT` prompt and two `RADIOBUTTON` options is inserted and the
  resulting document is valid

#### Scenario: Toggling a choice question to multiple

- **WHEN** the author activates the multiple-choice toggle on a single-choice question
- **THEN** the question's options render as checkboxes and the change is a single undoable step

#### Scenario: Adding and removing options

- **WHEN** the author uses the add-option control on a choice question, then removes an option
- **THEN** a new option of the question's current type is appended, then removed, each as one commit,
  and the document stays valid

### Requirement: Questions render read-only in the preview

The system SHALL render a `QUESTION` in the read-only preview as its prompt followed by disabled form
controls — `radio` inputs sharing one group for a single-choice question, `checkbox` inputs for a
multiple-choice question, and a disabled `textarea` for a text question. Option and `TEXTAREA` nodes
SHALL NOT render as top-level preview nodes (their parent question renders them).

#### Scenario: A single-choice question previews as disabled radios

- **WHEN** the preview renders a single-choice `QUESTION`
- **THEN** it shows the prompt and one disabled `radio` input per option, all sharing the question's
  group name

### Requirement: Questions round-trip through the DocTree envelope

The system SHALL serialize question subtrees as part of the DocTree without transformation and accept
them on import via `isValidDocTreeEnvelope`, with no change to `DOC_TREE_VERSION` or the IndexedDB
`SCHEMA_VERSION` and no data migration.

#### Scenario: A question survives export and re-import

- **WHEN** a document containing single-, multiple-, and text-flavoured questions is exported to a
  DocTree envelope and parsed back
- **THEN** `isValidDocTreeEnvelope` returns `true` and the re-parsed document deep-equals the original

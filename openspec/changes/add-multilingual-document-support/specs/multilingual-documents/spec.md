## ADDED Requirements

### Requirement: Every document has an explicit active language

The system SHALL associate each open document with exactly one active language, drawn from the
languages the platform defines (`de`, `fr`, `it`, `rm`, `en`). The active language SHALL be chosen
when the document is opened — from the source's declared language for HTML, from the languages the
tree carries for a DocTree envelope, from the stored entry when resuming, and from the configured
default otherwise — and SHALL NOT be inferred from the document's text.

#### Scenario: A declared source language is used

- **WHEN** a captured page whose root element is `<html lang="fr">` is imported
- **THEN** the document's active language is `fr` and its nodes' contents are keyed under `fr`

#### Scenario: A regional tag is normalised

- **WHEN** the source declares `lang="de-CH"`
- **THEN** the active language is `de`

#### Scenario: No declaration falls back to the default

- **WHEN** the source declares no language (including every DOCX, which carries none through the
  conversion)
- **THEN** the active language is the configured default and the document is opened without
  claiming a detection was made

#### Scenario: An envelope's language comes from its content

- **WHEN** a DocTree envelope whose nodes carry `fr` contents is opened
- **THEN** the active language is `fr`

#### Scenario: A mixed-language envelope picks the best covered language

- **WHEN** an envelope's nodes carry `de` on every node and `fr` on half of them
- **THEN** the active language is `de`, and the document is reported as carrying both

#### Scenario: A tie prefers the default, then the platform's order

- **WHEN** an envelope's nodes carry `fr` and `it` on every node and nothing else
- **THEN** the active language is `fr` — the default language is absent, and `fr` precedes `it` in
  the platform's order (`de`, `fr`, `it`, `rm`, `en`)

### Requirement: The editor reads and writes only the active language

Every surface that shows or edits node text — the tree pane, the rendered preview, the table of
contents and the keyboard-driven editing shortcuts — SHALL use the active language. Writing SHALL affect only `contents[activeLanguage]`; no edit SHALL create, alter or
remove content under another language. Switching the active language SHALL change what is displayed
and SHALL NOT modify the document.

#### Scenario: Editing writes to the active language

- **WHEN** the active language is `fr` and the user types into a node
- **THEN** `contents.fr` holds the typed text and every other key of that node is unchanged

#### Scenario: Editing a bilingual node leaves the other language alone

- **WHEN** a node carries both `de` and `fr` contents, the active language is `de`, and the user
  edits the node
- **THEN** `contents.fr` is byte-identical to what it was

#### Scenario: Switching languages is not an edit

- **WHEN** the user switches the active language from `de` to `fr` and back
- **THEN** the document is unchanged and no history entry is added

#### Scenario: A French document is readable

- **WHEN** a French document is opened
- **THEN** its text is visible in the tree and the preview — not a tree of blank nodes

### Requirement: Untranslated nodes are visibly untranslated

The tree pane SHALL distinguish a node that has no content for the active language from one whose
content is an empty string, by showing an explicit marker in place of the text. Such a node SHALL
remain selectable, movable and editable, and typing into it SHALL create content for the active
language. The rendered preview SHALL show such a node as empty and SHALL NOT fall back to another
language's text.

#### Scenario: A node missing the active language is marked

- **WHEN** the active language is `it` and a node carries only `de` contents
- **THEN** the tree row shows an untranslated marker naming the active language, not an empty row

#### Scenario: An empty string is not an untranslated node

- **WHEN** a node carries `contents: { it: '' }` and the active language is `it`
- **THEN** the row renders as an empty node, without the untranslated marker

#### Scenario: Typing fills the gap

- **WHEN** the user types into an untranslated node with `it` active
- **THEN** `contents.it` is created with the typed text and the other languages are untouched

#### Scenario: The preview does not mix languages

- **WHEN** the preview renders a document in `it` where some nodes carry only `de`
- **THEN** those nodes render as empty; no German text appears in the Italian preview

### Requirement: The document's languages are visible and switchable

The header SHALL show the active language and which languages the document carries. When the
document carries more than one, the header SHALL let the user switch between them. The user SHALL
also be able to select a language the document does not yet carry, in order to start filling it in.

#### Scenario: A single-language document shows its language

- **WHEN** a document carries only `de` contents
- **THEN** the header reports `de` as the active language

#### Scenario: A bilingual document offers both

- **WHEN** a document carries `de` and `fr` contents
- **THEN** the header offers both, marks both as present, and switching to `fr` re-renders both
  panes in French

#### Scenario: An absent language can be selected

- **WHEN** the user selects `it` for a document that carries no Italian
- **THEN** the editor switches to `it`, every node shows the untranslated marker, and the document
  is otherwise unchanged

### Requirement: The active language is persisted with the entry

The system SHALL persist the active language on the stored entry and SHALL restore it when the
entry is resumed, so reopening a French document does not reopen it as German. Entries stored
before this behaviour existed SHALL resume with the default language.

#### Scenario: The chosen language is stored

- **WHEN** a French document is imported and an entry is created
- **THEN** the stored entry's `language` is `'fr'`

#### Scenario: Switching updates the stored entry

- **WHEN** the user switches the active language of an open document
- **THEN** the stored entry's `language` reflects the new value within one autosave interval

#### Scenario: Resuming restores the language

- **WHEN** the user reopens that entry from the recents picker
- **THEN** the editor opens in `fr`

#### Scenario: A legacy entry resumes as the default

- **WHEN** an entry persisted without a language is resumed
- **THEN** it opens in the default language, exactly as it was edited before

### Requirement: Export preserves every language

Exporting SHALL write every language the tree carries, not only the active one, so that a
multilingual document survives a StructEdit round trip. The exported `metadata.title` — a single
display name in StructEdit, and ignored by the platform on import — SHALL be keyed under the
active language.

#### Scenario: A bilingual document exports both languages

- **WHEN** a de+fr document is edited in German and exported
- **THEN** every node's `contents` carries both keys, and the French text is byte-identical to what
  was imported

#### Scenario: The title is keyed under the active language

- **WHEN** a document whose active language is `fr` is exported
- **THEN** `metadata.title` is `{ fr: <display name> }` rather than `{ de: … }`

## Why

Switzerland consults in German, French and Italian, the DocTree model is language-keyed
(`contents: { de?, fr?, it?, rm?, en? }`) for exactly that reason — and StructEdit is hardwired to
German in a way that quietly corrupts every other document:

- `detectLanguage` is a stub: `return DEFAULT_LANGUAGE` — every import keys its text under `de`, so
  a French consultation draft is stored as if its French text were German, and reaches the platform
  claiming to be the German version.
- `useTreeEditor(document, language = DEFAULT_LANGUAGE)` is never called with a language. Every
  editor, preview and shortcut reads `contents['de']`.
- `processJsonEnvelopeString` returns no language at all, so a French or Italian document from
  Demokratis — where multilingual trees are the normal case, with `de` and `fr` contents on the
  same node — opens with **every node blank**. Typing into one of those blank nodes writes a `de`
  key next to the untouched `fr` text, silently adding a bogus German translation.
- `StoredDocumentEntry.language` exists in the storage schema, is written as `input.language ?? 'de'`,
  and is never passed in and never read back.

The platform, by contrast, makes the language explicit at the point of import: `ImportDocTreeForm`
carries a language and `JsonEnvelopeV1Parser::parse()` takes it as the fallback language for every
node it creates.

## What Changes

- A document has an **active language**. It is chosen at import — from the source's own declaration
  (`<html lang>`, `<meta http-equiv="content-language">`) or, for an envelope, from the languages
  the tree actually carries — and is changeable from the header at any time.
- `detectLanguage` stops lying: it reads the source's declared language and returns `null` when
  there is none, so the caller falls back to the current default explicitly instead of pretending
  to have detected German.
- The editor, preview, TOC and keyboard shortcuts all read and write the active language.
  Switching languages never rewrites content.
- A node with no content in the active language is shown as **untranslated** in the tree — visibly
  different from a node whose text is empty — and contributes nothing to the preview.
- The header shows which languages the document carries and lets the user switch between them; a
  single-language document shows its language without offering a switch it does not need.
- The active language is persisted on the entry (the dormant `StoredDocumentEntry.language` field)
  and restored on resume. A document's display name prefers the active language's title, and the
  exported envelope keys its title under the active language instead of an unconditional `de`.
- Export keeps every language: editing the German text of a de/fr document never drops the French.
- **Out of scope:** translating anything, editing two languages side by side, merging a translation
  from a second file (its own change), content-based language guessing (n-gram detection), and a
  per-language document title — the title is a single display name in StructEdit, and the
  platform ignores `metadata.title` on import (`JsonEnvelopeV1Parser`), so there is nothing to
  gain from localising it.
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `multilingual-documents`: the active-language concept — selection, switching, per-language
  editing and rendering, untranslated-node visibility, persistence, and the guarantee that other
  languages survive untouched.

### Modified Capabilities

- `document-persistence`: an entry's stored `language` becomes meaningful (persisted and restored),
  and an envelope entry's display name is derived from the active language's title before falling
  back to German and then any locale.

## Impact

- **Language selection:** [src/utils/document-utils.ts](src/utils/document-utils.ts) —
  `detectLanguage` reads `<html lang>` / `<meta>` and returns `Language | null`;
  `DEFAULT_LANGUAGE` stays the fallback but becomes a decision, not a disguise.
- **Processing:** [src/utils/file-processing.ts](src/utils/file-processing.ts) — `ProcessedDocument`
  gains a `language`; `processJsonEnvelopeString` derives it from the tree's language coverage and
  the envelope title; `pickEnvelopeName` takes the chosen language.
- **Editor state:** [src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts) — the language stops
  being a defaulted parameter and becomes state with a setter, threaded through
  [src/App.tsx](src/App.tsx) to the panes.
- **UI:** [src/components/Header.tsx](src/components/Header.tsx) (language switcher),
  [src/components/EditorInterface.tsx](src/components/EditorInterface.tsx) (the `language` prop
  stops defaulting to `'de'` and the export uses the active language), [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx)
  (untranslated marker), [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx)
  and [src/utils/outline-utils.ts](src/utils/outline-utils.ts) (render the active language).
- **Persistence:** [src/utils/persist-entry.ts](src/utils/persist-entry.ts) and
  [src/utils/document-storage.ts](src/utils/document-storage.ts) — write and read the entry's
  `language`; no schema bump (the field already exists, with `'de'` as the effective default for
  older entries).
- **Sequencing:** sixth of the platform-parity series; independent of the node-type changes, and
  the base for `add-translation-merge`.
- **Tests:** [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts),
  [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts),
  [src/hooks/useTreeEditor.test.ts](src/hooks/useTreeEditor.test.ts),
  [src/components/Header.test.tsx](src/components/Header.test.tsx),
  [src/App.test.tsx](src/App.test.tsx) (a French envelope opens with its French text visible).

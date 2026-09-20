## Context

The data model has been multilingual from the start — `LANGUAGES = ['en', 'de', 'fr', 'it', 'rm']`
matches the platform's `App\Language\Language` case for case, and every `contents` is a
language-keyed map. The *application* around it is monolingual and implicit:

| Piece                        | Today                                              |
| ---------------------------- | -------------------------------------------------- |
| `detectLanguage(text)`       | `return DEFAULT_LANGUAGE` — a stub marked as such   |
| `parseHtmlToTree(html, lang)`| defaults to `detectLanguage(html)` → always `de`    |
| `useTreeEditor(doc, lang)`   | defaults to `DEFAULT_LANGUAGE`; no caller passes one |
| `processJsonEnvelopeString`  | returns no language                                 |
| `StoredDocumentEntry.language`| written as `input.language ?? 'de'`, never read     |
| `pickEnvelopeName(title, …)` | `title.de` first                                     |
| `EditorInterface` `language` prop | defaults to `'de'`; `buildDocTreeEnvelope` keys the exported title under it |

The failure is not "the UI has no language switcher" — it is that the document's language is a
fact StructEdit asserts rather than reads. The platform never guesses: the admin picks the language
in `ImportDocTreeForm`, and `JsonEnvelopeV1Parser::parse(array $envelope, Language $language, …)`
takes it as the language for every node it creates. A Demokratis tree routinely carries two
languages on the same node (`GourmetFixtures` builds de + fr side by side), which is why
`contents` is a map and not a string.

This is change 6 of the platform-parity series. It is independent of the node-type changes, and
change 7 (`add-translation-merge`) builds directly on the active-language concept introduced here.

## Goals / Non-Goals

**Goals:**

- A French or Italian document — imported or loaded from Demokratis — is readable and editable in
  its own language.
- Editing never invents a translation: text typed under the active language cannot land in another
  language's key, and no other language's content is dropped on export.
- The operator can always see which language they are editing and which languages the document
  carries.
- A missing translation is visible as a missing translation, not as an empty node.

**Non-Goals:**

- No content-based language detection (n-grams, dictionaries). A declared language or an explicit
  choice, nothing in between.
- No side-by-side two-language editing, and no translation features.
- No merging of a second document as another language — that is change 7.
- No change to the language list: the five the platform defines, no more.

## Decisions

### D1. The active language is state, chosen at import, changeable in the header

`ProcessedDocument` gains `language: Language`, chosen as follows:

| Source            | Chosen language                                                                       |
| ----------------- | ------------------------------------------------------------------------------------- |
| HTML (upload, paste, `loadFile`) | `<html lang>` or `<meta http-equiv="content-language">`, normalised to a known language; else `DEFAULT_LANGUAGE` |
| DOCX              | `DEFAULT_LANGUAGE` (Mammoth exposes no document language)                               |
| DocTree envelope  | the language most nodes carry; a tie prefers `DEFAULT_LANGUAGE`, then the platform's order (`de`, `fr`, `it`, `rm`, `en` — not `LANGUAGES`, which lists `en` first); the envelope's `metadata.title` keys decide when the tree is empty |
| Recents entry     | the entry's stored `language`                                                           |

`detectLanguage` changes signature to `(html: string) => Language | null` and reads only what the
document declares — `de-CH` normalises to `de`, an unknown or absent value yields `null`. The
caller decides the fallback, so "we defaulted to German" is a visible decision instead of a
detection result.

The header shows the active language. When the document carries more than one, it is a selector;
when it carries one, it is a label plus the ability to switch to a language the document does not
have yet (which is how the operator starts a translation by hand).

_Rejected: a modal asking for the language on every import._ The platform can ask because import is
an admin form submission; StructEdit's import is a drag-and-drop, and a blocking question on every
file would be noise for the German-majority case. The header selector is always visible instead.

_Rejected: keeping `detectLanguage` returning a `Language`._ A function that claims to detect and
always answers `de` is exactly how the current bug hides.

### D2. Everything renders and edits through the active language

The language moves from a defaulted parameter of `useTreeEditor` to editor state with a setter, and
is threaded to the tree pane, the preview, the TOC, the keyboard shortcuts and the header title.
`updateNodeContents(id, text)` writes `contents[activeLanguage]` and leaves every other key
untouched; switching the language re-reads, never rewrites.

The document title does not become multilingual. StructEdit's title is one display string (the
entry's `name`, edited in the header); `buildDocTreeEnvelope` writes it as `{ [language]: name }`,
and the platform ignores `metadata.title` on import ("the envelope's `metadata` is ignored",
`JsonEnvelopeV1Parser`). The only change is that the exported key becomes the active language
instead of the `EditorInterface` default of `'de'`, so a French document no longer exports a
German-labelled title.

### D3. An untranslated node looks untranslated

Today `contents[language] ?? ''` makes "no French text" and "empty node" identical. The tree pane
distinguishes them: a node that has no key for the active language (as opposed to an empty string)
renders a muted "no text in <language>" marker in place of its content, and remains fully
selectable, movable and editable — typing into it creates that language's content, which is the
intended way to fill a gap.

The preview renders such a node as empty. It does **not** fall back to another language: a preview
that silently mixes languages would be the same lie in a different place.

_Rejected: hiding untranslated nodes from the preview entirely._ The structure is what the operator
is checking; a document with holes should look like a document with holes.

### D4. The stored language is finally used

`persistInitialEntry` receives the chosen language instead of defaulting it, autosave keeps it in
step when the user switches, and resuming an entry restores it. Older entries carry `'de'`, which is
what they were implicitly edited as, so no migration and no schema bump are needed.

An envelope entry's display name prefers `metadata.title[activeLanguage]`, then German, then any
locale — the existing rule with one step in front of it.

### D5. TDD ordering

1. `document-utils.ts` — `detectLanguage` over declared-language HTML, `de-CH` normalisation,
   absent/unknown → `null`.
2. `file-processing.ts` — `language` on every `ProcessedDocument`, envelope language derivation,
   name preference.
3. `useTreeEditor` — language state, per-language reads and writes, other languages untouched.
4. UI — header selector, untranslated marker, preview and TOC in the active language; the export
   keyed under the active language.
5. `App.test.tsx` — a French envelope opens showing French text; typing does not create a `de` key.

## Risks / Trade-offs

- **[Existing German documents must not change behavior]** → They keep `de` at every step
  (stored entries default to `de`, HTML without a declared language falls back to
  `DEFAULT_LANGUAGE`), so the German path is byte-identical to today.
- **[A wrong declared language in captured HTML]** → Cantonal sites do get `lang="de"` wrong on
  French pages. The header selector is the correction, and switching languages is non-destructive:
  the text stays where it was keyed until the operator moves it. Re-keying a whole document's
  content from one language to another is a follow-up (Open Questions).
- **[More state threaded through the app]** → The language already exists as a parameter in most
  of these signatures; this change gives it a value instead of a default.
- **[Untranslated markers add visual noise to a one-language document]** → They only appear when a
  node lacks the active language, which in a single-language document is never.

## Migration Plan

No schema change: the `language` field is already in `StoredDocumentEntry` and older entries keep
`'de'`. No document content is rewritten by this change — content keys are read and written where
they already are. Rollback is a revert, after which a French document opens blank again exactly as
it does today.

## Open Questions

- **Should there be a "this document is actually in X" re-key action?** For a capture whose HTML
  declares the wrong language, the content is keyed under the wrong key and only a re-key would fix
  it (move every `contents.de` to `contents.fr`). It is a destructive, one-shot operation that
  wants a confirmation step; worth its own proposal if wrong declarations turn out to be common.
- **Should the preview offer a reading fallback?** Showing the German text greyed out where the
  French is missing would help a translator and hurt a structure reviewer. Deferred until there is
  a translation workflow to design it against.

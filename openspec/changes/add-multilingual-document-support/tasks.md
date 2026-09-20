## 1. Language detection stops guessing

- [ ] 1.1 Red: extend [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts) —
  `detectLanguage` returns `'fr'` for `<html lang="fr">`, `'de'` for `lang="de-CH"`, reads
  `<meta http-equiv="content-language" content="it">`, and returns `null` for HTML with no
  declaration, an unknown language, or plain text
- [ ] 1.2 Green: reimplement `detectLanguage` in
  [src/utils/document-utils.ts](src/utils/document-utils.ts) with the signature
  `(html: string) => Language | null` (design D1) and delete the stub comment
- [ ] 1.3 Green: update every caller to apply `?? DEFAULT_LANGUAGE` explicitly, so the fallback is
  visible at the call site

## 2. Every processed document carries a language

- [ ] 2.1 Red: extend [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts) —
  `processHtmlString` reports the declared language and falls back to `DEFAULT_LANGUAGE`;
  `processTextInput` and `processDocxFile` report `DEFAULT_LANGUAGE`; `processJsonEnvelopeString`
  reports the language most nodes carry, breaks a tie in favour of `DEFAULT_LANGUAGE` and then the
  platform's order (`de`, `fr`, `it`, `rm`, `en`), and falls back to the envelope title's keys for
  an empty tree; the parsed tree's contents are keyed by the reported language
- [ ] 2.2 Green: add `language` to `ProcessedDocument` and populate it in every entry point in
  [src/utils/file-processing.ts](src/utils/file-processing.ts); pass it to `parseHtmlToTree` /
  `parseHtmlLegalToTree` and to `createPlainTextDocument` (design D1)
- [ ] 2.3 Red/Green: `pickEnvelopeName` prefers the chosen language's title, then German, then any
  locale

## 3. The editor edits the active language

- [ ] 3.1 Red: extend [src/hooks/useTreeEditor.test.ts](src/hooks/useTreeEditor.test.ts) — the hook
  exposes the active language and a setter; `updateNodeContents` writes only
  `contents[activeLanguage]` and leaves other keys byte-identical; switching the language changes
  what is read and rewrites nothing
- [ ] 3.2 Green: turn the language parameter into state in
  [src/hooks/useTreeEditor.ts](src/hooks/useTreeEditor.ts) and thread it through
  [src/App.tsx](src/App.tsx) to the tree pane, preview, TOC and
  [src/hooks/useKeyboardShortcuts.ts](src/hooks/useKeyboardShortcuts.ts) (design D2)
- [ ] 3.3 Red/Green: in [src/components/EditorInterface.tsx](src/components/EditorInterface.tsx)
  the `language` prop no longer defaults to `'de'`, and `buildDocTreeEnvelope` is called with the
  active language so the exported `metadata.title` is keyed under it

## 4. Language switcher and untranslated nodes

- [ ] 4.1 Red: extend [src/components/Header.test.tsx](src/components/Header.test.tsx) — the header
  shows the active language; a document carrying two languages offers a switch between them and
  marks which ones have content; switching updates the panes
- [ ] 4.2 Green: implement the switcher in
  [src/components/Header.tsx](src/components/Header.tsx)
- [ ] 4.3 Red: extend
  [src/components/RecursiveTreeNode.test.tsx](src/components/RecursiveTreeNode.test.tsx) — a node
  with no key for the active language renders an "untranslated" marker distinct from an empty
  string, stays selectable, and typing into it creates that language's content
- [ ] 4.4 Green: implement the marker in
  [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) (design D3), and
  confirm the preview renders such a node as empty rather than falling back to another language

## 5. Persistence

- [ ] 5.1 Red: extend [src/utils/persist-entry.test.ts](src/utils/persist-entry.test.ts) (or the
  storage tests) — a new entry stores the chosen language; switching the language updates the
  stored entry; resuming restores it; an entry stored without a language resumes as `'de'`
- [ ] 5.2 Green: pass the language through
  [src/utils/persist-entry.ts](src/utils/persist-entry.ts) and read it back when an entry is
  resumed in [src/App.tsx](src/App.tsx) (design D4)
- [ ] 5.3 Refactor: confirm no schema bump is needed and
  [src/utils/document-storage-migrations.ts](src/utils/document-storage-migrations.ts) is untouched

## 6. End to end & docs

- [ ] 6.1 Red/Green: extend [src/App.test.tsx](src/App.test.tsx) — a `loadFile` fetch returning a
  French DocTree envelope opens the editor showing French text, the header reports French, and
  editing a node adds no `de` key
- [ ] 6.2 Red/Green: a de+fr envelope exports with both languages' node contents intact after
  editing the German, and its title keyed under the active language
- [ ] 6.3 Run `npm run test`, `npm run build` and `npm run typecheck` and confirm all three are clean
- [ ] 6.4 Update [README.md](README.md) and [AGENTS.md](AGENTS.md): the editor works in one language
  at a time, chosen per document, and documents may carry several

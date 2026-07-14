# StructEdit
StructEdit is an importer and editor of **tree-structured documents**.

1. On input, StructEdit accepts plaintext, HTML, or DOCX documents.
2. DOCX documents are converted to HTML using [Mammoth](https://github.com/mwilliamson/mammoth.js).
3. StructEdit translates the intermediate format (HTML or plaintext) into a tree structure described by the data model in [src/types/document.ts](./src/types/document.ts).
4. A set of rules is applied to (re)construct as much as possible from the original semantic structure of the document. We mostly expect Swiss legal drafts (new laws or amendments). For example, blocks of text starting with `Art. 123` are inferred to be headings.
5. The tree structure is presented side-by-side with the original document in a user interface designed to make structure edits and fixes simple and efficient.
6. After manual editing the document tree can be downloaded as JSON.

The current `main` branch is always deployed at https://structedit.demokratis.ch/.

## Loading from Demokratis
StructEdit can be opened with a document preloaded from the [Demokratis](https://demokratis.ch) platform via a signed URL: `https://structedit.demokratis.ch/?loadFile=<url-encoded signed URL>`. The file is fetched, parsed, and opened in the editor. The fetched document may be HTML (parsed like an upload) or a DocTree JSON envelope previously exported by StructEdit (opened directly as a tree). See the [remote-document-loading spec](./openspec/specs/remote-document-loading/spec.md).

## Planned features
- Direct upload of the structured document to the [Demokratis](https://demokratis.ch) platform.
- PDF document support

# StructEdit
StructEdit is an importer and editor of **tree-structured documents**.

1. On input, StructEdit accepts PDF or DOCX documents.
2. Parsers like [Mammoth](https://github.com/mwilliamson/mammoth.js) and [Docling](https://github.com/docling-project/docling) are used to convert the original document to an intermediate format such as HTML.
3. StructEdit translates the intermediate format into a tree structure described by the data model in [src/types/document.ts](./src/types/document.ts).
4. The tree structure is presented side-by-side with the original document in a user interface designed to make structure edits and fixes simple and efficient.
5. After manual editing, StructEdit serialises the tree to JSON and (THIS IS NOT IMPLEMENTED YET:) optionally imports it into the [Demokratis](https://demokratis.ch) platform.


The current `main` branch is always deployed at https://structedit.demokratis.ch/.

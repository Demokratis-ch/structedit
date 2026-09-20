## MODIFIED Requirements

### Requirement: Source bytes are persisted alongside the tree

For each saved entry the system SHALL persist the original source bytes together with their MIME type, original filename and the document's active language, tagged with a `source.kind` recording the entry's origin: `'docx'` (uploaded DOCX), `'html'` (uploaded HTML file **or** a document fetched via a `loadFile` URL — see the remote-document-loading spec), `'pasted-text'`, or `'json-envelope'` (re-imported DocTree JSON). On resume, the system SHALL rebuild the side-by-side source preview from those bytes — the user SHALL NOT need to re-attach the original file — except for `'json-envelope'` entries, where the JSON *is* the tree and no separate "Original" preview exists.

#### Scenario: DOCX upload persists the renderable HTML produced by mammoth

- **WHEN** the user uploads a `.docx` file and an entry is created
- **THEN** the stored entry's `source.bytes` is the converted HTML string produced by mammoth, `source.mime` is `'text/html'`, `source.kind` is `'docx'` (origin tracking), and `source.originalFilename` is the uploaded filename
- **NOTE** The original DOCX bytes are not persisted because no browser renders `application/vnd.openxmlformats-officedocument.wordprocessingml.document` inline — a `blob:` URL with that MIME would be offered for download instead of showing the preview on resume. The converted HTML is exactly what the preview pane renders on fresh upload, so the resumed preview is bit-identical.

#### Scenario: Pasted text persists as text

- **WHEN** the user pastes text and converts it to an entry
- **THEN** the stored entry's `source.bytes` is a string equal to the pasted source, `source.mime` is `'text/plain'` or `'text/html'` per the existing HTML-detection rule, `source.kind` is `'pasted-text'`, and `source.originalFilename` is `null`

#### Scenario: Resuming an entry reconstructs the source preview

- **WHEN** the user clicks a recent entry in the picker
- **THEN** the editor opens with the entry's tree and a fresh blob URL constructed from `source.bytes` and `source.mime`, so the source-preview pane shows the original document

#### Scenario: DocTree JSON import persists the raw JSON but has no source preview

- **WHEN** the user uploads a DocTree-envelope `.json` file previously produced by "Download JSON"
- **THEN** the stored entry's `source.kind` is `'json-envelope'`, `source.mime` is `'application/json'`, `source.bytes` is the raw JSON text, and the entry's `name` is derived from `metadata.title` (the active language first, then German, then any locale) falling back to the filename
- **AND** both at import and on resume the editor's `documentUrl` is `null`, so only the rendered Preview is shown — there is no "Original" pane to rebuild because the JSON is the tree itself

#### Scenario: The entry records the document's active language

- **WHEN** any entry is created
- **THEN** the stored entry's `language` is the document's active language — the one its contents are keyed under — rather than an unconditional `'de'`, and resuming the entry reopens the editor in that language

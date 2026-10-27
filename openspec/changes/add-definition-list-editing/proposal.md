# Proposal

## Why

Show and edit the platform's `DEFINITION_LIST` node in StructEdit (#150).

## What Changes

- Conversion to `DEFINITION_LIST`; toolbar button and key `D`.
- MARKDOWN renders paragraphs of `Term :: Value` lines as a `<dl>`, as on the platform, in the
  tree and the Preview.
- **Out of scope:**
  - The HTML/DOCX importer producing definition lists (own change; `<dl>` text is dropped
    today).
  - `DEFINITION_LIST` → `FOOTNOTE` keeps `MARKDOWN`, which the platform rejects on footnotes:
    part of the existing format-mismatch follow-up.

## Capabilities

### New Capabilities

- `definition-lists`: editing and previewing the `DEFINITION_LIST` node.

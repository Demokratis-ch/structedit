# Proposal

## Why

Add the platform's `TABLE` node type, so documents with tables open, edit and export in
StructEdit (#150). `DEFINITION_LIST` and `CONTENT_GROUP` follow as separate changes.

## What Changes

- `TABLE`: a `MARKDOWN`-only leaf under `DOCUMENT`, `HEADING`, `LIST_ITEM`, as on the platform.
- Conversion to and from `TABLE`; toolbar button and key `B`.
- Preview renders tables horizontally scrollable.
- **Out of scope:**
  - The HTML/DOCX importer producing tables (own change; it also fixes text in `<td>` not
    wrapped in `<p>`, which is dropped today).
  - `TABLE` → `FOOTNOTE` keeps `MARKDOWN`, which the platform rejects on footnotes: part of the
    existing format-mismatch follow-up.
  - Cell editing.
- No storage migration: the change is additive; `SCHEMA_VERSION` stays 2.

## Capabilities

### New Capabilities

- `tables`: the `TABLE` node.

### Modified Capabilities

- `node-formatting`: format rules include `table`.

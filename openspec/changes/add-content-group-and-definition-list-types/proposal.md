# Proposal

## Why

Add the platform's `CONTENT_GROUP` and `DEFINITION_LIST` node types to the data model, so
`types/document.ts` describes every node a platform export can contain (#150).

## What Changes

- `DEFINITION_LIST`: a `MARKDOWN`-only leaf under `DOCUMENT`, `HEADING`, `LIST_ITEM`.
- `CONTENT_GROUP`: under `DOCUMENT` and `HEADING`; holds `LIST`, `CONTENT` and `IMAGE`; carries
  `contents` and a `TEXT`/`NEWLINES` format, as on the platform.
- Platform exports containing them open and export unchanged.
- **Out of scope:** showing and editing them in the tree and Preview (own changes). Until then
  the Preview omits them; the tree shows them without their number.
- No storage migration: the change is additive; `SCHEMA_VERSION` stays 2.

## Capabilities

### Modified Capabilities

- `node-formatting`: format rules include `definition_list` and `content_group`.

# Proposal

## Why

Show and edit the platform's `CONTENT_GROUP` node in StructEdit (#150).

## What Changes

- Wrap paragraphs and lists in a group; toolbar button and key `G`.
- Converting a group to a paragraph dissolves it; other conversions are refused instead of
  dropping its children.
- Preview renders groups with their number, as on the platform.
- **Out of scope:** indenting into, outdenting out of and merging groups.

## Capabilities

### New Capabilities

- `content-groups`: wrapping, dissolving and previewing the `CONTENT_GROUP` node.

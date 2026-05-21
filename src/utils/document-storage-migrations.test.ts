import { describe, expect, it } from 'vitest';
import type { StoredEntrySource } from './document-storage';
import { migrateEntry, SCHEMA_VERSION } from './document-storage-migrations';

const SOURCE: StoredEntrySource = {
  kind: 'pasted-text',
  mime: 'text/plain',
  bytes: 'hello',
  originalFilename: null,
};

const makeV1Entry = (tree: Record<string, unknown>) => ({
  id: 'entry-1',
  schemaVersion: 1,
  name: 'doc.docx',
  subtitle: null,
  language: 'de',
  tree,
  source: SOURCE,
  createdAt: 1,
  updatedAt: 2,
  byteSize: 0,
});

describe('document-storage-migrations', () => {
  it('exposes SCHEMA_VERSION = 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  describe('v1 → v2 (issue #103: type uppercase)', () => {
    it('uppercases the root document type and bumps schemaVersion', () => {
      const v1 = makeV1Entry({ id: 'r', number: null, type: 'document', children: [] });
      const out = migrateEntry(v1);
      expect('status' in out).toBe(false);
      const entry = out as Extract<typeof out, { tree: unknown }>;
      expect(entry.schemaVersion).toBe(2);
      expect((entry.tree as { type: string }).type).toBe('DOCUMENT');
    });

    it('walks nested children (list → list_item → content → footnote)', () => {
      const v1 = makeV1Entry({
        id: 'r',
        number: null,
        type: 'document',
        children: [
          {
            id: 'list-1',
            number: null,
            type: 'list',
            children: [
              {
                id: 'li',
                number: '1.',
                type: 'list_item',
                children: [
                  {
                    id: 'c',
                    number: null,
                    type: 'content',
                    contents: { de: 'Hi' },
                    format: 'TEXT',
                    children: [
                      {
                        id: 'fn',
                        number: 'i.',
                        type: 'footnote',
                        contents: { de: 'note' },
                        format: 'TEXT',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const out = migrateEntry(v1) as { tree: any };
      expect(out.tree.type).toBe('DOCUMENT');
      expect(out.tree.children[0].type).toBe('LIST');
      expect(out.tree.children[0].children[0].type).toBe('LIST_ITEM');
      expect(out.tree.children[0].children[0].children[0].type).toBe('CONTENT');
      expect(out.tree.children[0].children[0].children[0].children[0].type).toBe('FOOTNOTE');
    });

    it('uppercases heading and image types', () => {
      const v1 = makeV1Entry({
        id: 'r',
        number: null,
        type: 'document',
        children: [
          {
            id: 'h',
            number: '1',
            type: 'heading',
            contents: { de: 'T' },
            format: 'TEXT',
            children: [
              {
                id: 'img',
                number: null,
                type: 'image',
                contents: { de: 'i.png' },
                format: 'TEXT',
              },
            ],
          },
        ],
      });
      const out = migrateEntry(v1) as { tree: any };
      expect(out.tree.children[0].type).toBe('HEADING');
      expect(out.tree.children[0].children[0].type).toBe('IMAGE');
    });

    it('does not mutate the original raw entry', () => {
      const v1 = makeV1Entry({ id: 'r', number: null, type: 'document', children: [] });
      const snapshot = JSON.parse(JSON.stringify(v1));
      migrateEntry(v1);
      expect(v1).toEqual(snapshot);
    });

    it('produces a tree that passes isValidDocument', () => {
      const v1 = makeV1Entry({
        id: 'r',
        number: null,
        type: 'document',
        children: [
          {
            id: 'h',
            number: '1',
            type: 'heading',
            contents: { de: 'T' },
            format: 'TEXT',
            children: [],
          },
        ],
      });
      const out = migrateEntry(v1);
      expect('status' in out).toBe(false);
    });

    it('is idempotent on a mixed/already-upgraded tree', () => {
      // A v1 entry whose tree somehow already contains uppercase types (e.g. partial
      // hand-edit in storage) should still produce a fully-upgraded valid tree.
      const v1 = makeV1Entry({
        id: 'r',
        number: null,
        type: 'DOCUMENT',
        children: [
          {
            id: 'h',
            number: '1',
            type: 'heading', // mixed
            contents: { de: 'T' },
            format: 'TEXT',
            children: [],
          },
        ],
      });
      const out = migrateEntry(v1) as { tree: any };
      expect(out.tree.type).toBe('DOCUMENT');
      expect(out.tree.children[0].type).toBe('HEADING');
    });
  });

  describe('passthrough and incompatibility', () => {
    it('passes through a v2 record unchanged', () => {
      const v2 = {
        ...makeV1Entry({ id: 'r', number: null, type: 'DOCUMENT', children: [] }),
        schemaVersion: 2,
      };
      const out = migrateEntry(v2);
      expect('status' in out).toBe(false);
      const entry = out as { schemaVersion: number; tree: { type: string } };
      expect(entry.schemaVersion).toBe(2);
      expect(entry.tree.type).toBe('DOCUMENT');
    });

    it('flags an entry with a future schemaVersion as incompatible', () => {
      const future = {
        ...makeV1Entry({ id: 'r', number: null, type: 'document', children: [] }),
        schemaVersion: 999,
      };
      const out = migrateEntry(future);
      expect('status' in out && out.status).toBe('incompatible');
    });

    it('flags an entry with no schemaVersion as incompatible', () => {
      const v0 = makeV1Entry({ id: 'r', number: null, type: 'document', children: [] }) as Record<
        string,
        unknown
      >;
      delete v0.schemaVersion;
      const out = migrateEntry(v0);
      expect('status' in out && out.status).toBe('incompatible');
    });
  });
});

## Context

The `IMAGE` interface has been in `types/document.ts` since the model was written, the format
allow-list has a row for it, `document-storage-migrations.ts` renames the v1 lowercase `image` type
for it, and the toolbar's format-selector code path explicitly excludes it. Everything is in place
except the two ends: nothing produces an image node, and nothing renders one.

How the platform stores an image, from `templates/docTree/_node_widgets.html.twig`:

```twig
{% if nodeContent.storedFile %}   <img src="{{ path('app_doc_node_image', …) }}" alt="{{ nodeContent.content }}" />
{% elseif nodeContent.content starts with 'data:image/' %}   <img src="{{ nodeContent.content }}" />
{% elseif nodeContent.content starts with 'http' %}          <img src="{{ nodeContent.content }}" />
```

So a `DocNodeContent` of an `IMAGE` node holds either the image source (a `data:` URI or an `http`
URL) or — when the platform has a stored file for it — the alt text. The fixtures use the URL form
(`GourmetFixtures` stores a Wikimedia URL), and the stored-file form is unreachable from the JSON
envelope, which carries no files. StructEdit therefore has exactly one representation available:
**contents = the image source**.

Captions on the platform are not a field: `GourmetFixtures` puts the caption in a `CONTENT`
sibling right after the image node, in `MARKDOWN_INLINE` format, marked as remark-only. StructEdit
cannot set a contribution mode over the envelope, but it can produce the sibling.

This is change 5 of the platform-parity series and is independent of the others; it only assumes
the `MARKDOWN_INLINE`-for-prose rule from change 1 for the caption node's format.

## Goals / Non-Goals

**Goals:**

- An image in the source document produces a node the operator can see, move and delete — the
  structure stops lying about what the document contains.
- An image node from a platform envelope renders in the preview.
- DOCX and HTML take the same path, since Mammoth converts Word images to `<img>` elements.
- Nothing is created that cannot render: an unusable source produces no node.

**Non-Goals:**

- No image upload, no fetching remote images, no re-encoding or resizing.
- No `alt` text (see D3).
- No stored-file form of an image node: the envelope has no file transport, and inventing one is a
  platform-side question.
- No thumbnails in the tree pane; the tree stays a structural view.

## Decisions

### D1. `contents` holds the image source

An imported image node is:

```ts
{ id, number: null, type: 'IMAGE', contents: { [language]: src }, format: 'TEXT' }
```

`src` is taken verbatim when it is absolute `http(s)` or `data:`. A relative `src` is resolved
against the document's `<base href>` when the parsed HTML has one — bookmarklet captures often do,
because that is what makes the captured page's own assets load — and otherwise kept verbatim.
An `<img>` whose `src` is empty, or whose scheme is neither `http(s)` nor `data:` (`file:`,
`cid:`, `javascript:` …), produces **no node at all**.

`format: 'TEXT'` continues to be the rule from the existing node-formatting spec ("Image always
imports as TEXT").

The media type of a `data:` URI is *not* a gate. Mammoth emits Word drawings as
`data:image/x-emf` and `data:image/x-wmf`, which no browser renders; DOMPurify 3.x lets any `data:`
URI through on an `img` (`DATA_URI_TAGS`), and so does the importer. The node is real — the
platform stores the same URI verbatim, and a later conversion step could rasterise it — so it is
kept, and the preview says what it is (D4) instead of showing a broken image.

_Rejected: keeping a node for an unusable source as a "broken image" marker._ A node whose content
can never render is a node the operator has to delete by hand on every import, and it would travel
to the platform as an image that renders as nothing.

### D2. `<figcaption>` becomes a content sibling

A `<figure>` holding an `<img>` and a `<figcaption>` produces the image node followed by a
`CONTENT` node with the caption text, formatted by the normal importer rules (so a caption with
emphasis lands as `MARKDOWN_INLINE`). This is the platform's own shape, and it keeps the caption
editable, movable and proposable like the prose it is.

_Rejected: a `caption` field on the image node._ The envelope has no such field; it would be
dropped at the boundary.

### D3. `alt` is not imported

The platform's content field holds *either* the source *or* the alt text, and StructEdit must use
it for the source. There is nowhere else to put alt text: the envelope has no attribute for it, and
turning it into a caption node would fabricate document text — on the platform that paragraph
becomes proposable content that the source document never contained.

So `alt` is read (to decide nothing) and dropped. This is a real, stated loss rather than a silent
one, and it is bounded: alt text is accessibility metadata about the image, not text of the
document being consulted.

### D4. The preview renders an image, with a visible fallback

`ImageNode` renders `<img src={contents[language]}>` inside a bounded container (a max width in
the spirit of the platform's `max-w-[75%]`), with `loading="lazy"`. When the stored string is
neither `http(s)` nor `data:` — which the importer cannot produce but an envelope can carry — the
renderer shows a placeholder box containing the stored string, so the operator sees that the
document has an image there and what it points at, rather than a blank gap. A `data:` URI whose
media type browsers do not render (`image/x-emf`, `image/x-wmf`, `image/tiff`) gets the same
placeholder, naming the type, rather than the browser's broken-image glyph.

A broken URL (404, offline) is the browser's business: the `<img>` shows its own broken state and
the node is still visible in the tree.

### D5. TDD ordering (bottom-up)

1. `document-utils.ts` — the `<img>` branch: absolute URL, `data:` URI, relative with and without
   `<base>`, unusable scheme, `<figure>` with caption, image inside a heading/list item.
2. `PreviewNodeRenderers.tsx` — image rendering and the placeholder fallback.
3. `RecursiveTreeNode.tsx` — the image row.
4. Integration — a DOCX fixture containing an image produces an image node whose content is a
   `data:` URI; an envelope with an image round-trips unchanged.

## Risks / Trade-offs

- **[`data:` URIs make documents large]** → The DOCX path already persists them in the entry's
  source bytes today, so the increment is the tree's copy. The existing quota strategy (evict old
  entries, then toast) applies unchanged, and the alternative is losing every Word image.
- **[Relative sources may not resolve]** → Kept verbatim and shown in the placeholder, so the
  operator can fix or delete the node; today the image is gone without a trace.
- **[Remote images may disappear later]** → True on the platform too, which stores the same URLs.
  Fetching and inlining them is a separate decision with size and licensing implications.
- **[Widening the sanitizer to `img`]** → `src` is the only new attribute; DOMPurify's own
  `IS_ALLOWED_URI` check and `data:` pass-through for `img` are what they are, the importer's
  scheme allow-list is the gate that matters, and rendering happens in React with the URL as a
  `src` attribute — no HTML from the source is ever rendered.
- **[Word drawings import as nodes nobody can see]** → EMF/WMF are common in older Word files.
  The placeholder names the type, the node round-trips, and rasterising is a follow-up with the
  same answer as "upload to the platform" (Open Questions).

## Migration Plan

Additive: no schema change, no change to existing node types, and documents already imported keep
their missing images until the source is re-imported. Rollback is a revert — an image node saved
by the new build remains valid under the old model, it simply renders as nothing again.

## Open Questions

- **Should images be uploaded to the platform rather than referenced?** The platform's stored-file
  form is the better long-term shape (stable URLs, no `data:` bloat), but it needs an upload
  endpoint and a place in the envelope for a file reference — a joint decision with the Demokratis
  side, and the same conversation as the README's "direct upload" item.
- **Should a very large `data:` image be dropped or downscaled on import?** Deferred until the
  quota toast actually fires on a real document; the fix (a size threshold) is easy to add once
  there is a number to pick.

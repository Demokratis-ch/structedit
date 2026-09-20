## Why

`IMAGE` is the one node type StructEdit already has in its data model and never uses. Nothing
creates one — `parseHtmlToTree`'s DOMPurify allow-list has no `img`, so every image is stripped on
import, from pasted HTML, bookmarklet captures and DOCX alike (Mammoth inlines Word images as
`data:` URIs that are then thrown away). And nothing displays one: `PreviewNode` returns `null`
for `IMAGE`, so an image that *does* arrive — from a Demokratis envelope, where image nodes are
ordinary content — is invisible in the preview the operator checks the structure against.

The result is a silent hole in both directions. A consultation draft whose Art. 3 is a diagram
imports as a document that skips Art. 3 entirely, with nothing in the tree to show something was
there; and a platform document with images renders here as if it had none.

## What Changes

- The importer keeps images: `img`, `figure` and `figcaption` join the sanitizer allow-list, and an
  `<img>` becomes an `IMAGE` node whose `contents` hold the image source — an absolute URL or a
  `data:` URI — exactly as the platform stores it (`templates/docTree/_node_widgets.html.twig`
  renders `content` as the `src` for both forms).
- A `<figure>`'s `<figcaption>` becomes a `CONTENT` node immediately after the image, which is the
  platform's own caption convention (a sibling content node, not a field).
- A relative `src` is resolved against the document's `<base href>` when the captured HTML carries
  one, and otherwise kept verbatim — a relative URL that cannot be resolved is still better
  evidence of a missing image than no node at all.
- An `<img>` with no usable source (empty `src`, or a `src` whose scheme is neither `http(s)` nor
  `data:`) produces no node, so the tree never carries an image that can never render.
- The preview renders image nodes: a bounded `<img>` for an `http(s)` source or a `data:` URI of a
  type browsers render, and a visible placeholder — carrying the stored string, or the media type
  for a `data:` URI browsers cannot show (Word's EMF/WMF drawings arrive as such) — for anything
  else.
- The tree pane shows an image node as an image row (a thumbnail-free, recognisable label with the
  source), so the operator can see, select, move and delete it like any other node.
- **Out of scope:** uploading images, fetching remote images to inline them, image editing or
  cropping, and `alt` text — which the platform model has nowhere to put (see the design).
- Red-green TDD throughout, per [CLAUDE.md](CLAUDE.md).

## Capabilities

### New Capabilities

- `image-nodes`: importing images into `IMAGE` nodes, caption handling, source-resolution rules,
  preview and tree rendering, and envelope round-trip.

### Modified Capabilities

- _None._ The `image` row of `node-formatting` (`TEXT`/`NEWLINES`, default `TEXT`, no format
  selector) already matches the platform and is unchanged by this change.

## Impact

- **Importer:** [src/utils/document-utils.ts](src/utils/document-utils.ts) — `img`, `figure`,
  `figcaption` in the DOMPurify allow-list, `src` in `ALLOWED_ATTR`, an `<img>` branch in the
  walker, and the `<base href>` lookup. DOMPurify 3.x passes any `data:` URI through on an `img`
  `src` (`DATA_URI_TAGS`), so the importer's own scheme check is the only gate.
- **DOCX:** [src/utils/file-processing.ts](src/utils/file-processing.ts) — no code change expected;
  Mammoth's default image handling already emits `data:` URIs into the HTML that
  `parseHtmlLegalToTree` parses and that is already persisted as the entry's source bytes.
- **Preview:** [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx)
  — replace the `case 'IMAGE': return null` with an `ImageNode` renderer.
- **Tree:** [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx) — an
  image row that shows the source instead of rendering the raw URI as prose.
- **Tests:** [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts),
  [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx),
  [src/utils/file-processing.integration.test.ts](src/utils/file-processing.integration.test.ts)
  (a DOCX fixture containing an image), and a round-trip case for an envelope with an image node.
- **Sequencing:** fifth of the platform-parity series; independent of the node-type changes, and
  assumes only the inline-format rule of `align-node-contract-with-platform` for caption nodes.
- **Storage:** no schema change. A `data:` URI is stored twice for a DOCX (once in the entry's
  source bytes, where it already lives today, once in the tree); the existing quota eviction and
  toast cover the consequences.

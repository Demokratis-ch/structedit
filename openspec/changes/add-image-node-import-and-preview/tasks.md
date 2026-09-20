## 1. The importer keeps images

- [ ] 1.1 Red: extend [src/utils/document-utils.test.ts](src/utils/document-utils.test.ts) —
  `parseHtmlToTree('<p><img src="https://example.org/a.png"></p>')` produces an `IMAGE` node with
  `format: 'TEXT'` and `contents` equal to the URL; a `data:image/png;base64,…` source is kept
  verbatim; a relative `src` resolves against a `<base href>` when present and is kept verbatim
  when absent; an empty `src` and a `file:`/`javascript:` source produce no node; an image inside a
  heading or list item lands under that parent
- [ ] 1.2 Green: add `img`, `figure`, `figcaption` to the DOMPurify allow-list and `src` to
  `ALLOWED_ATTR`, and add the `<img>` branch to the walker in
  [src/utils/document-utils.ts](src/utils/document-utils.ts) (design D1); pin with a test that a
  `data:image/x-emf` source is kept as a node
- [ ] 1.3 Red/Green: a `<figure>` containing an `<img>` and a `<figcaption>` produces the image
  node followed by a `CONTENT` node holding the caption, formatted by the normal importer rules
  (design D2)
- [ ] 1.4 Refactor: document in the walker why `alt` is read and not stored (design D3), pointing
  at the platform's overloaded content field

## 2. Preview rendering

- [ ] 2.1 Red: extend
  [src/components/PreviewNodeRenderers.test.tsx](src/components/PreviewNodeRenderers.test.tsx) —
  an `IMAGE` node with an `http(s)` source renders an `<img>` with that `src`; a `data:image/png`
  source renders an `<img>`; a `data:image/x-emf` source renders a placeholder naming the type and
  no `<img>`; any other stored string renders a placeholder containing the string and no `<img>`;
  the rendered image is bounded rather than full-bleed
- [ ] 2.2 Green: replace `case 'IMAGE': return null` with the `ImageNode` renderer in
  [src/components/PreviewNodeRenderers.tsx](src/components/PreviewNodeRenderers.tsx) (design D4)
- [ ] 2.3 Refactor: confirm a caption content node renders as ordinary content directly beneath the
  image

## 3. Tree pane

- [ ] 3.1 Red: extend
  [src/components/RecursiveTreeNode.test.tsx](src/components/RecursiveTreeNode.test.tsx) — an image
  node renders a recognisable image row showing its source (truncated for a long `data:` URI), is
  selectable, and its edit mode edits the source string
- [ ] 3.2 Green: add the image row in
  [src/components/RecursiveTreeNode.tsx](src/components/RecursiveTreeNode.tsx)
- [ ] 3.3 Refactor: confirm move, indent/outdent, delete and undo behave on an image node exactly
  as on any other leaf

## 4. End to end

- [ ] 4.1 Red/Green: add a DOCX fixture containing a PNG/JPEG image and one containing an EMF
  drawing to
  [src/utils/file-processing.integration.test.ts](src/utils/file-processing.integration.test.ts)
  and assert one `IMAGE` node per Word image, each with a `data:` URI of the source's media type
- [ ] 4.2 Red/Green: assert in [src/utils/file-processing.test.ts](src/utils/file-processing.test.ts)
  that an envelope containing an image node imports and re-exports unchanged
- [ ] 4.3 Run `npm run test`, `npm run build` and `npm run typecheck` and confirm all three are
  clean
- [ ] 4.4 Import a real captured page containing images and a Word file containing images, and
  confirm both panes show them
- [ ] 4.5 Update [README.md](README.md) / [AGENTS.md](AGENTS.md) where they describe what an import
  preserves

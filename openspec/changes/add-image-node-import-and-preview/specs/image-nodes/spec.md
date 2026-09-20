## ADDED Requirements

### Requirement: Images in the source document become IMAGE nodes

`parseHtmlToTree` SHALL preserve images instead of stripping them: the sanitizer SHALL allow
`img`, `figure` and `figcaption`, and each usable `<img>` SHALL produce one `IMAGE` node whose
`contents` hold the image source for the document's language and whose `format` is `TEXT`. Because
Mammoth converts Word images to `<img>` elements with `data:` URIs, this SHALL apply to DOCX
uploads through the same path.

#### Scenario: An absolute image URL is imported

- **WHEN** `parseHtmlToTree('<p><img src="https://example.org/a.png"></p>')` runs
- **THEN** the tree contains an `IMAGE` node with `format: 'TEXT'` whose contents equal
  `'https://example.org/a.png'`

#### Scenario: A data URI is imported verbatim

- **WHEN** the source contains `<img src="data:image/png;base64,iVBORw0…">`
- **THEN** the `IMAGE` node's contents hold that exact string

#### Scenario: A Word image survives the DOCX pipeline

- **WHEN** a DOCX file containing an image is imported
- **THEN** the tree contains one `IMAGE` node per image, each holding a `data:` URI with the
  source's media type — including types browsers cannot render, such as `image/x-emf`, which are
  kept for the round trip and shown as a placeholder

#### Scenario: An image keeps its place in the structure

- **WHEN** an `<img>` appears inside a heading's section or a list item
- **THEN** the `IMAGE` node is created as a child of that heading or list item, in source order

### Requirement: Image sources are resolved and validated

The importer SHALL take an absolute `http(s)` or `data:` source verbatim, SHALL resolve a relative
source against the document's `<base href>` when the parsed HTML carries one, and SHALL keep an
unresolvable relative source verbatim. An `<img>` whose source is empty, or whose scheme is neither
`http(s)` nor `data:`, SHALL produce no node at all.

#### Scenario: A relative source resolves against `<base>`

- **WHEN** the captured HTML declares `<base href="https://kanton.example/vernehmlassung/">` and an
  image has `src="bild.png"`
- **THEN** the node's contents equal `'https://kanton.example/vernehmlassung/bild.png'`

#### Scenario: A relative source without a base is kept as-is

- **WHEN** the same image appears in HTML with no `<base href>`
- **THEN** the node's contents equal `'bild.png'`

#### Scenario: An unusable source produces no node

- **WHEN** the source contains `<img src="">`, `<img src="file:///tmp/a.png">` or
  `<img src="javascript:alert(1)">`
- **THEN** no `IMAGE` node is created for it and no placeholder node is left behind

### Requirement: A figure caption becomes a content sibling

A `<figure>` containing an `<img>` and a `<figcaption>` SHALL produce the `IMAGE` node followed
immediately by a `CONTENT` node holding the caption text, formatted by the importer's normal
per-node rules. The caption SHALL NOT be stored on the image node, which has no field for it in
the envelope.

#### Scenario: Caption follows the image

- **WHEN** `parseHtmlToTree('<figure><img src="https://example.org/a.png"><figcaption>Abbildung 1</figcaption></figure>')`
  runs
- **THEN** the tree contains an `IMAGE` node immediately followed by a sibling `CONTENT` node whose
  contents equal `'Abbildung 1'`

#### Scenario: A formatted caption keeps its emphasis

- **WHEN** the caption contains `<em>Abbildung 1</em>`
- **THEN** the caption `CONTENT` node carries the inline-Markdown format and contents `'*Abbildung 1*'`

#### Scenario: An image without a figure gets no caption node

- **WHEN** a bare `<img>` is imported
- **THEN** exactly one node is created

### Requirement: Alt text is not stored

The importer SHALL NOT store an `<img>`'s `alt` attribute. The platform's image node has a single
content field, which StructEdit must use for the source, and inventing a caption from `alt` would
add document text the source never contained.

#### Scenario: Alt text does not reach the tree

- **WHEN** `parseHtmlToTree('<img src="https://example.org/a.png" alt="Ein Risotto">')` runs
- **THEN** the `IMAGE` node's contents equal the URL and no node anywhere in the tree holds
  `'Ein Risotto'`

### Requirement: Image nodes render in the preview and the tree

The rendered preview SHALL render an `IMAGE` node as a bounded `<img>` when its content is an
`http(s)` source or a `data:` URI of a media type browsers render, and as a visible placeholder
otherwise — carrying the stored string for an unusable source, or naming the media type for a
`data:` URI browsers cannot show. The
tree pane SHALL show an image node as its own row identifying it as an image and showing its
source, so it can be selected, moved and deleted like any other node.

#### Scenario: A usable source renders an image

- **WHEN** the preview renders an `IMAGE` node whose content is `'https://example.org/a.png'`
- **THEN** the output contains an `<img>` with that `src`, sized to fit the pane rather than
  overflowing it

#### Scenario: An unusable source renders a placeholder

- **WHEN** the preview renders an `IMAGE` node whose content is `'bild.png'`
- **THEN** no `<img>` is rendered and a placeholder containing `'bild.png'` is shown

#### Scenario: A non-renderable data URI renders a typed placeholder

- **WHEN** the preview renders an `IMAGE` node whose content starts with `data:image/x-emf`
- **THEN** no `<img>` is rendered and a placeholder naming `image/x-emf` is shown, so the operator
  sees a Word drawing is there rather than a broken image

#### Scenario: An image node from a platform document is visible

- **WHEN** a DocTree envelope containing an `IMAGE` node is opened
- **THEN** that image is rendered in the preview — it is no longer skipped by the renderer

#### Scenario: The tree row shows a long data URI readably

- **WHEN** the tree renders an image node whose content is a long `data:` URI
- **THEN** the row identifies the node as an image and shows a truncated source rather than the
  full string

### Requirement: Image nodes round-trip through the envelope

An `IMAGE` node SHALL export with its stored source unchanged and re-import identically, so a
document can travel Demokratis → StructEdit → Demokratis without altering its images.

#### Scenario: An imported image exports unchanged

- **WHEN** an envelope containing an `IMAGE` node is imported and exported without editing it
- **THEN** the exported node carries the same `id`, `number`, `contents` and `format`

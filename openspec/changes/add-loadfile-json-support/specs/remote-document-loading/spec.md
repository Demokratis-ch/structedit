## MODIFIED Requirements

### Requirement: Load a document from the `loadFile` query parameter

On application load the system SHALL inspect the `loadFile` query parameter. When the parameter is
present, the system SHALL decode it to a source URL, fetch the document, and open the editor with
the parsed document — without requiring the user to interact with the upload screen. HTML content
SHALL be parsed through the HTML pipeline; JSON content SHALL be validated as a DocTree envelope
(`DocTreeVersion` 1) and its contained tree opened directly. When the parameter is absent the
system SHALL render the normal upload screen and SHALL NOT perform any fetch.

#### Scenario: Valid loadFile opens the editor with the document

- **WHEN** the app is opened with `?loadFile=<url-encoded URL>` whose host is allowlisted and the
  fetch returns `200 OK` with HTML content
- **THEN** the document is parsed into the tree, the editor view is shown with that tree and a source
  preview built from the fetched HTML, and the upload screen is not shown

#### Scenario: Valid loadFile with a DocTree JSON envelope opens the editor

- **WHEN** the app is opened with `?loadFile=<url-encoded URL>` whose host is allowlisted and the
  fetch returns `200 OK` with a JSON `Content-Type` and a body that is a valid DocTree envelope
  (`DocTreeVersion` 1)
- **THEN** the editor view is shown with the envelope's contained tree, without running the HTML
  pipeline; because the envelope has no separate original document, no source preview is offered
  (the left pane shows only the rendered Preview) and the upload screen is not shown

#### Scenario: No loadFile param leaves the upload flow unchanged

- **WHEN** the app is opened with no `loadFile` query parameter
- **THEN** the upload screen renders exactly as before and no network request is made

#### Scenario: The fetch runs at most once

- **WHEN** the app mounts with a `loadFile` param (including under React StrictMode double-invocation
  in development)
- **THEN** the document is fetched at most once

### Requirement: Distinct error states instead of a blank editor

When a `loadFile` load fails, the system SHALL display a distinct, human-readable error message
matched to the failure, SHALL NOT open a blank or empty editor, and SHALL offer the user a way to
reach the normal upload screen. An expired link (HTTP 410) and an invalid link (HTTP 404) SHALL
produce different messages.

#### Scenario: Expired link (410) shows the expiry message

- **WHEN** fetching the `loadFile` URL returns HTTP `410 Gone`
- **THEN** the message "Link expired, re-open from demokratis.ch." is shown and the editor is not
  opened

#### Scenario: Invalid link (404) shows a distinct invalid-link message

- **WHEN** fetching the `loadFile` URL returns HTTP `404 Not Found`
- **THEN** an "invalid link" message distinct from the 410 message is shown and the editor is not
  opened

#### Scenario: Network or CORS failure shows a generic load error

- **WHEN** the fetch throws (network offline, DNS, or a CORS rejection surfaced as a `TypeError`) or
  returns a non-OK status other than 404 or 410
- **THEN** a generic "couldn't load the document" message is shown and the editor is not opened

#### Scenario: Unrecognized or empty content shows an unsupported-format error

- **WHEN** the fetch returns `200 OK` but the content is neither HTML nor JSON (by `Content-Type`),
  or the body is empty, or the parsed document contains no content
- **THEN** an "unsupported format" / "couldn't read the document" message is shown and the editor is
  not opened

#### Scenario: JSON that is not a valid DocTree envelope shows the unsupported-format error

- **WHEN** the fetch returns `200 OK` with a JSON `Content-Type` but the body is malformed JSON, is
  not a structurally valid DocTree envelope, or declares a `DocTreeVersion` other than 1
- **THEN** the unsupported-format error message is shown and the editor is not opened

#### Scenario: Every error surface offers a path to upload

- **WHEN** any `loadFile` error message is shown
- **THEN** an action is available that dismisses the error and shows the normal upload screen

### Requirement: A URL-loaded document is persisted like an upload

A document loaded via `loadFile` SHALL be persisted as a recents entry in the same way as an uploaded
file, so that autosave protects the work and the document appears in the recents picker. A document
loaded from a DocTree JSON envelope SHALL be persisted the same way as an uploaded `.json` envelope
(the raw JSON as the stored source). A failure to persist (e.g. storage quota) SHALL NOT prevent the
editor from opening; the document SHALL remain editable in memory and the existing quota
notification SHALL apply.

#### Scenario: Successful load creates a recents entry

- **WHEN** a `loadFile` document is successfully fetched and parsed
- **THEN** a recents entry is created carrying the parsed tree and the fetched source, and autosave is
  active for the open document

#### Scenario: A JSON load persists as a json-envelope entry

- **WHEN** a `loadFile` document is successfully loaded from a DocTree JSON envelope
- **THEN** the recents entry stores the raw fetched JSON as a `json-envelope` source, so reopening it
  from recents behaves like reopening an uploaded `.json` document

#### Scenario: Persistence failure still opens the editor

- **WHEN** creating the recents entry for a `loadFile` document fails due to a storage error
- **THEN** the editor still opens with the document in memory and the failure is surfaced via the
  existing storage notification rather than blocking the load

## ADDED Requirements

### Requirement: Load a document from the `loadFile` query parameter

On application load the system SHALL inspect the `loadFile` query parameter. When the parameter is
present, the system SHALL decode it to a source URL, fetch the document, parse it through the HTML
pipeline, and open the editor with the parsed document — without requiring the user to interact with
the upload screen. When the parameter is absent the system SHALL render the normal upload screen and
SHALL NOT perform any fetch.

#### Scenario: Valid loadFile opens the editor with the document

- **WHEN** the app is opened with `?loadFile=<url-encoded URL>` whose host is allowlisted and the
  fetch returns `200 OK` with HTML content
- **THEN** the document is parsed into the tree, the editor view is shown with that tree and a source
  preview built from the fetched HTML, and the upload screen is not shown

#### Scenario: No loadFile param leaves the upload flow unchanged

- **WHEN** the app is opened with no `loadFile` query parameter
- **THEN** the upload screen renders exactly as before and no network request is made

#### Scenario: The fetch runs at most once

- **WHEN** the app mounts with a `loadFile` param (including under React StrictMode double-invocation
  in development)
- **THEN** the document is fetched at most once

### Requirement: Loading state during the fetch

While a `loadFile` document is being fetched, the system SHALL display an explicit loading state and
SHALL NOT display a blank or partially-rendered editor. The loading state SHALL be shown immediately
on load when a `loadFile` param is present, with no intervening flash of the upload screen.

#### Scenario: Loading indicator shown while fetching

- **WHEN** the app is opened with a valid `loadFile` param and the fetch has not yet resolved
- **THEN** a loading indicator is visible and neither the upload screen nor an empty editor is shown

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

#### Scenario: Non-HTML or empty content shows an unsupported-format error

- **WHEN** the fetch returns `200 OK` but the body is not HTML, or the parsed document contains no
  content
- **THEN** an "unsupported format" / "couldn't read the document" message is shown and the editor is
  not opened

#### Scenario: Every error surface offers a path to upload

- **WHEN** any `loadFile` error message is shown
- **THEN** an action is available that dismisses the error and shows the normal upload screen

### Requirement: Fetch target restricted to an allowlist of hosts

The system SHALL fetch a `loadFile` URL only when its host is on a configurable allowlist, and SHALL
reject any other host before performing a fetch. The allowlist SHALL default to `demokratis.ch` and
SHALL be configurable (without code changes) to add additional hosts. Host matching SHALL accept an
exact host or a subdomain of an allowlisted host on a dot boundary, and SHALL reject look-alike hosts.
The URL scheme SHALL be `https` (with `http://localhost` permitted only in development).

#### Scenario: Allowlisted host is fetched

- **WHEN** the decoded `loadFile` URL is `https://demokratis.ch/file/<uuid>?_expiration=…&_hash=…`
- **THEN** the URL is fetched

#### Scenario: Allowlisted subdomain is fetched

- **WHEN** the decoded `loadFile` URL host is a subdomain of an allowlisted host (e.g.
  `files.demokratis.ch`)
- **THEN** the URL is fetched

#### Scenario: Non-allowlisted host is rejected without fetching

- **WHEN** the decoded `loadFile` URL points at a host not on the allowlist (e.g.
  `https://evil.example.com/…`)
- **THEN** no fetch is performed and an error surface is shown

#### Scenario: Look-alike host is rejected

- **WHEN** the decoded `loadFile` URL host is a look-alike such as `demokratis.ch.evil.com` or
  `notdemokratis.ch`
- **THEN** the host is treated as not allowlisted, no fetch is performed, and an error surface is
  shown

### Requirement: A URL-loaded document is persisted like an upload

A document loaded via `loadFile` SHALL be persisted as a recents entry in the same way as an uploaded
file, so that autosave protects the work and the document appears in the recents picker. A failure to
persist (e.g. storage quota) SHALL NOT prevent the editor from opening; the document SHALL remain
editable in memory and the existing quota notification SHALL apply.

#### Scenario: Successful load creates a recents entry

- **WHEN** a `loadFile` document is successfully fetched and parsed
- **THEN** a recents entry is created carrying the parsed tree and the fetched source, and autosave is
  active for the open document

#### Scenario: Persistence failure still opens the editor

- **WHEN** creating the recents entry for a `loadFile` document fails due to a storage error
- **THEN** the editor still opens with the document in memory and the failure is surfaced via the
  existing storage notification rather than blocking the load

### Requirement: The `loadFile` parameter is consumed once

After a `loadFile` load attempt, the system SHALL remove the `loadFile` parameter from the browser's
URL so that reloading the page does not re-trigger a fetch against a possibly-expired link. Removing
the parameter SHALL preserve the deployment path and SHALL NOT disrupt the open document.

#### Scenario: Refresh does not re-fetch after a load

- **WHEN** a `loadFile` load has been attempted and the user reloads the page
- **THEN** no new fetch of the previous `loadFile` URL is performed because the parameter is no longer
  present in the URL

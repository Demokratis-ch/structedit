## ADDED Requirements

### Requirement: Wrapping in a content group
Converting a selection of contiguous `CONTENT` and `LIST` siblings to `CONTENT_GROUP` (toolbar `Content Group (G)`, key `g`) SHALL replace them with one new `CONTENT_GROUP` holding them, which takes over the first node's number. It SHALL be refused for other node types, non-contiguous selections and where the parent can't hold a `CONTENT_GROUP`.

#### Scenario: Absatz and its list
- **WHEN** a numbered `CONTENT` and the `LIST` after it are converted to `CONTENT_GROUP`
- **THEN** a `CONTENT_GROUP` with the paragraph's number holds the unnumbered paragraph and the list

### Requirement: Dissolving a content group
Converting a `CONTENT_GROUP` to `CONTENT` SHALL replace it with its children. Its number SHALL move onto the first child, and the conversion SHALL be refused when that is not an unnumbered `CONTENT`. Converting it to any other type SHALL be refused.

#### Scenario: Group becomes its children
- **WHEN** a numbered `CONTENT_GROUP` starting with an unnumbered `CONTENT` is converted to `CONTENT`
- **THEN** its children stand in its place, the first carrying the group's number

#### Scenario: Other conversions refused
- **WHEN** a `CONTENT_GROUP` is converted to `HEADING` or `FOOTNOTE`
- **THEN** the document is unchanged

### Requirement: Preview renders content groups
The Preview SHALL render a `CONTENT_GROUP`'s children, with the group's number at the start of the first child when that is a `CONTENT`, else above the children, as on the platform.

#### Scenario: Number inline
- **WHEN** a `CONTENT_GROUP` numbered `2` starting with a `CONTENT` is previewed
- **THEN** `2` renders at the start of that paragraph

## Context

The DocTree model ([src/types/document.ts](src/types/document.ts)) is a **closed, drift-guarded** set
of node types: `DocumentNode` is a fixed union, `ALLOWED_CHILDREN` / `ALLOWED_MODES` are
`as const satisfies Record<…>`, `ALLOWED_FORMATS`/`DEFAULT_FORMAT` are `Record<ContentBearingNodeType,…>`,
and the type-only `_AllowedChildrenMatchesTypes` asserts the runtime child table equals the typed
`children` unions. Adding a node type therefore forces coordinated edits across every table — the
compiler (`npm run typecheck`) is the first failing "test".

Demokratis models a question as a **wrapper subtree of `DocNode`s**, not a special entity
(confirmed in `Domain/Questionnaire/QuestionnaireBuilder.php`): a `QUESTION` wraps one `CONTENT`
(the prompt) plus either option children or a `TEXTAREA`. Single-vs-multiple choice is encoded purely
by the option node type (`RADIOBUTTON` vs `CHECKBOX`) — there is no flag on the question; the
mutual-exclusion of single choice is only an HTML `name`-grouping at render time. Option labels live
in each option node's own `contents`. StructEdit already emits `UPPERCASE` type/format values that
Demokratis lowercase-folds, so no casing work is needed.

This change is a sibling of the per-node contribution-mode work already on the base branch and reuses
its patterns (the `satisfies` drift-guard style, the `DocumentContributionModeMenu` button+panel
scaffold).

## Goals / Non-Goals

**Goals**
- Author all three Demokratis question flavours (Text / Single / Multiple) manually, inline in the tree.
- Faithful, wire-compatible model: option-type-based single/multiple; questions round-trip through the
  DocTree envelope unchanged.
- Switch single↔multiple in one action; add/remove/edit options inline.
- Keep the model self-consistent: a strict validator rejects malformed questions on import.

**Non-Goals**
- Deriving questions from imported HTML/DOCX (they can't be — authoring only).
- Participant answers (`ANSWER`/`SELECTED_*`) — generated on the Demokratis side.
- Text↔choice conversion after creation; `required`/min/max/help/per-option value metadata.

## Decisions

- **D1 — Node shapes.** `QUESTION` is a container (children, no `contents`/`format`).
  `RADIOBUTTON`/`CHECKBOX` are content-bearing leaves (`contents` + `format`, no children) — their
  label is the content. `TEXTAREA` is a **content-less leaf** (`id`/`number`/`type`/`contributionMode?`
  only), a new shape in the model. `QuestionChildNode = CONTENT | RADIOBUTTON | CHECKBOX | TEXTAREA`.
- **D2 — Allowed placement.** `QUESTION` joins the `DOCUMENT`/`HEADING`/`LIST_ITEM` child rows (so it's
  in `BlockDocumentNode`); `QUESTION → [CONTENT, RADIOBUTTON, CHECKBOX, TEXTAREA]`. The drift guard
  gains `& AssertTrue<SameSet<AllowedChildType<'QUESTION'>, TypedChildType<QuestionDocumentNode>>>`;
  the block rows are auto-validated once `QuestionDocumentNode ∈ BlockDocumentNode`.
- **D3 — Option formats.** `RADIOBUTTON`/`CHECKBOX` → `['TEXT','NEWLINES','MARKDOWN_MINIMAL']`, default
  `TEXT` (single-line labels, like `HEADING`). Forced by the `Record<ContentBearingNodeType,…>`.
- **D4 — Contribution modes.** `QUESTION: ['NONE','REMARK']`; options and `TEXTAREA: ['NONE']` (not
  proposable/annotatable individually — a remark belongs on the `QUESTION` or its `CONTENT`).
  `PROPOSABLE_TYPES` unchanged.
- **D5 — Strict validation (chosen over the generic container branch).** `QUESTION` gets its own
  validator branch (it is NOT added to `CONTAINER_TYPES`): reject `contents`/`format`; require a
  `children` array; require **exactly one `CONTENT`** and **either** ≥1 options of a single homogeneous
  type with no `TEXTAREA`, **or** exactly one `TEXTAREA` with no options; then recurse.
  `RADIOBUTTON`/`CHECKBOX` join `LEAF_TYPES` (content-bearing leaf branch); `TEXTAREA` gets a
  content-less-leaf branch. This keeps single/multiple well-defined and rejects malformed questions on
  import — worth the one extra code path.
- **D6 — `withMappedChildren` case.** `QUESTION`'s children are `QuestionChildNode[]`, not block nodes,
  so `withMappedChildren` needs an explicit `case 'QUESTION'`; otherwise it falls to the block default
  and mis-types the array (compile error against the interface).
- **D7 — Builders & the single↔multiple switch.** `createQuestionNode(flavour, language)` builds the
  subtree with fresh `generateId()` ids. `setQuestionChoiceMode(root, path, 'single'|'multiple')` maps
  each option `RADIOBUTTON↔CHECKBOX` via `updateChildrenAtPath` (routed through the D6 case),
  preserving id/number/contents/format/contributionMode; no-op (same ref) when already that mode or a
  text question.
- **D8 — `changeNodeTypeInDoc` safety guard.** After `if (!hasContents(node)) return null;`, add
  `if (!canBeChildOf(targetType, parent.type as ParentType)) return null;`. **Placement matters** — it
  must sit after the `LIST_ITEM`/`LIST` re-parenting cases (which deliberately move a node to a
  different parent) and only guard the in-place content conversions. Net effect: a type button can't
  turn an option or a question's `CONTENT` into a `HEADING` under a `QUESTION`. (Also closes a latent
  footnote-under-content edge — no existing test exercises it.)
- **D9 — Add-option reuse.** `createNewSiblingNode` gains a `parent.type === 'QUESTION'` branch that
  returns a fresh option matching the question's existing option type, so "add option" reuses
  `addNodeAfter(lastOptionId)`. Generic top/bottom add buttons are **suppressed inside a question**
  (via a new `parentType` prop on `RecursiveTreeNode`) so options are managed only by the question's
  own controls — this also prevents inserting a stray option into a text question.
- **D10 — Inline authoring UI.** The `QUESTION` node renders a labelled card with a single↔multiple
  toggle (choice only) + an add-option button; each option renders a `Circle`/`Square` glyph + the
  existing `ContentBlock` label + a remove-option affordance; `TEXTAREA` renders a disabled
  placeholder. Options carry `number: null` and show **no** visible numbering (glyph only).
- **D11 — Preview.** `PreviewNode` gains `case 'QUESTION'` → a `<fieldset>` with the prompt as
  `<legend>` and disabled `radio`/`checkbox` (shared `name={node.id}`) / `<textarea>`; the option and
  textarea types return `null` at top level (parents render them), like `FOOTNOTE`/`IMAGE`.
- **D12 — Creation entry point.** A new `AddQuestionMenu` (cloning `DocumentContributionModeMenu`'s
  button+panel+outside-click/Esc scaffold) in the top `Toolbar`, wired to `insertQuestion(afterId, flavour)`
  which inserts after the current selection when its parent allows `QUESTION`, else appends to root.
  The empty-document placeholder also offers the three flavours.
- **D13 — Persistence/export.** Additive: `isValidDocument`/`isValidDocTreeEnvelope` accept questions;
  no `DOC_TREE_VERSION` bump, no IndexedDB `SCHEMA_VERSION` bump or migration.

The exact code for the non-obvious edits (interfaces, tables, the two validator branches,
`createQuestionNode`/`setQuestionChoiceMode`, the guard, the hooks, and the render/preview branches)
is carried in the approved plan and reproduced in [tasks.md](tasks.md) at the point of use.

## Risks / Trade-offs

- **Model surface.** Four types touch many drift-guarded tables; the compiler enforces completeness, so
  the risk is mechanical omission caught at `typecheck`, not silent breakage.
- **Old-build incompatibility (accepted).** A question-bearing IndexedDB entry or exported envelope is
  rejected by any pre-feature build's validator. Documented; no migration mitigates it because the
  types genuinely didn't exist. Forward compatibility (new build reading old docs) is unaffected.
- **Strict validator vs. round-trip.** The strict `QUESTION` branch could reject an externally-produced
  question that mixes option types or omits the prompt. StructEdit is the producer and the switch keeps
  options homogeneous, so this only rejects genuinely malformed trees — the intended behaviour.
- **Generic add-buttons inside questions.** Suppressed via `parentType` rather than parent lookup;
  the memo comparator must include `parentType` so a node re-renders if it's re-parented across types.

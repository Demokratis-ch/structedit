## Context

The DocTree model ([src/types/document.ts](src/types/document.ts)) is a **closed, drift-guarded** set
of node types: `DocumentNode` is a fixed union, `ALLOWED_CHILDREN`/`ALLOWED_MODES` are
`as const satisfies Record<…>`, and the type-only `_AllowedChildrenMatchesTypes` asserts the runtime
child table equals the typed `children` unions. Adding a node type forces coordinated edits across
every table — the compiler is the first failing "test", so the mechanical parts can't be got wrong
silently. This document records only the decisions that the code does not already state at the point
of use.

Demokratis models a question as a **wrapper subtree of `DocNode`s**, not a special entity (confirmed
in `Domain/Questionnaire/QuestionnaireBuilder.php`): a `QUESTION` wraps one `CONTENT` (the prompt)
plus either option children or a `TEXTAREA`. Single-vs-multiple is encoded purely by the option node
type — there is no flag on the question; the mutual exclusion of single choice is only an HTML
`name`-grouping at render time. Option labels live in each option node's own `contents`. StructEdit
already emits `UPPERCASE` values that Demokratis lowercase-folds, so no casing work is needed.

This change is stacked on the per-node contribution-mode work — see the Dependency section of
[proposal.md](proposal.md) for the coupling and what happens if the merge order flips.

## Goals / Non-Goals

**Goals**
- Author all three Demokratis question flavours (Text / Single / Multiple) manually, inline in the tree.
- Faithful, wire-compatible model; questions round-trip through the DocTree envelope unchanged.
- Switch a question between all three flavours in one action; add/remove/edit options inline.
- Keep the model self-consistent: a strict validator rejects malformed questions on import.

**Non-Goals**
- Deriving questions from imported HTML/DOCX (they can't be — authoring only).
- Participant answers (`ANSWER`/`SELECTED_*`) — generated on the Demokratis side.
- `required`/min/max/help/per-option value metadata.

## Decisions

- **D1 — Strict validation, not the generic container branch.** `QUESTION` gets its own validator
  branch and is deliberately *not* added to `CONTAINER_TYPES`: exactly one `CONTENT`, and **either**
  ≥1 options of a single homogeneous type **or** exactly one `TEXTAREA`. The generic branch would have
  accepted a question with two prompts or mixed option types, leaving single-vs-multiple undefined.
  Worth the extra code path, since it also rejects malformed questions on import.
- **D2 — Contribution modes.** `QUESTION: ['NONE','REMARK']`; options and `TEXTAREA`: `['NONE']`. An
  individual option is not something to annotate or propose an amendment to — a remark belongs on the
  question or its prompt. `PROPOSABLE_TYPES` unchanged.
- **D3 — Flavour is derived, never stored.** `getQuestionFlavour` reads it off the answer children.
  Storing a flag would allow it to disagree with the children the validator already constrains.
- **D4 — Flavour switching is lossy across the choice/text boundary.** Choice↔choice retypes the
  options in place, so labels and the option count survive. Choice↔text has nothing to carry, so the
  answer section is rebuilt and the old one is discarded — accepted as destructive-but-undoable rather
  than stashing orphaned options in the tree where the validator would reject them.
- **D5 — The type buttons never reach inside a question.** `changeNodeTypeInDoc` returns `null` when
  the node's parent is a `QUESTION`. This is deliberately narrower than the generic parent-validity
  guard it sits next to (shipped separately, since it fixes a latent footnote-under-content bug that
  predates this change): `CONTENT` *is* an allowed `QUESTION` child, so only the question-specific
  check stops an option being converted into a second prompt.
- **D6 — Options are managed only by the question.** `createNewSiblingNode` gains a `QUESTION` branch
  so "add option" reuses `addNodeAfter`, and the generic top/bottom add buttons are suppressed inside a
  question via a `parentType` prop. Without the suppression a stray `CONTENT` could be added to a text
  question, which the validator rejects.
- **D7 — Promote, don't insert.** A question is made *out of* an existing content node, which becomes
  its prompt, rather than dropped in beside one. Authoring then reuses the normal flow — add a node,
  write the prompt, promote it — instead of introducing a second way to create content. Keeping the
  prompt's id means the node stays selected across the promotion, which enables D8.
- **D8 — One control, not two.** Because the prompt stays selected, the toolbar popover switches the
  flavour of the question the selection belongs to instead of disappearing once the node is a question.
  This replaced an inline single↔multiple toggle on the question card, which was a second, narrower
  affordance for the same concept.
- **D9 — Persistence/export is additive.** No `DOC_TREE_VERSION` bump, no IndexedDB `SCHEMA_VERSION`
  bump, no migration — the types are new, so nothing existing changes shape.

## Risks / Trade-offs

- **Old-build incompatibility (accepted).** A question-bearing IndexedDB entry or exported envelope is
  rejected by any pre-feature build's validator. No migration mitigates it, because the types genuinely
  didn't exist. Forward compatibility (new build reading old documents) is unaffected.
- **Strict validator vs. round-trip.** The D1 branch would reject an externally-produced question that
  mixes option types or omits the prompt. StructEdit is the producer and D4 keeps options homogeneous,
  so in practice this only rejects genuinely malformed trees — the intended behaviour.

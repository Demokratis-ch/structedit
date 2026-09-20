## Context

`DocTreeMergeService::merge()` is fifteen lines and the whole contract is in them:

```php
if (!$main->isEquivalent($other)) { throw new StructureMismatchException($main->getRootNode(), $other->getRootNode()); }
if ($main->getContentForLanguage($mergeLanguage) !== null) { throw new \RuntimeException('target node already contains language '.$mergeLanguage->value); }
$content = $other->getContentForLanguage($mergeLanguage);
if ($content !== null) { $main->addContent($content->cloneForDocNode($main)); }
foreach ($main->getChildrenZippedWith($other) as [$mainChild, $otherChild]) { $this->merge($mainChild, $otherChild, $mergeLanguage); }
```

with `isEquivalent()` = same `type` and same child count (the "fingerprint" is the type alone), and
`getChildrenZippedWith()` pairing children by position. So: a strict, positional, type-and-arity
structural match, applied recursively; content copied per node for one language; the source tree
discarded afterwards.

Two properties of that implementation are worth *not* copying. It mutates as it walks, so a
mismatch deep in the tree leaves the merge half-applied; and the exception carries both trees but
no location, which is why an admin only ever sees "Structure Mismatch". StructEdit's trees are
immutable values with an undo stack, so both are easy to improve on.

One property of the platform model is *not* representable here and does not need to be: Demokratis
stores `number` and `contentFormat` per (node, language) row, so a merge carries the translation's
own numbering. The envelope format already flattens that — "the document body shares a single
number/format per node across languages", per `JsonEnvelopeV1Serializer` — so StructEdit's
per-node number and format are the right target, and a translation's differing numbers are
information, not data to keep.

This is change 7 of the platform-parity series and depends on change 6
(`add-multilingual-document-support`) for the active-language concept and the language switcher.

## Goals / Non-Goals

**Goals:**

- Two single-language captures become one multilingual document without leaving StructEdit.
- A structural mismatch is actionable: the operator learns where and what, not just that.
- Nothing is ever half-merged, and everything is undoable in one step.
- The matching rule is exactly the platform's, so a merge that succeeds here would have succeeded
  there.

**Non-Goals:**

- No fuzzy matching, no alignment heuristics, no interactive "map this node to that node" UI. If
  the structures differ, the answer is to fix a tree — which is what this application is for.
- No merging of more than one language per action.
- No second "Original" pane for the translation; the merged document keeps the original source it
  was created from.
- No per-language numbers or formats.

## Decisions

### D1. Matching is the platform's rule, with a location

`matchStructure(main, other)` walks both trees in lockstep and returns either `{ ok: true }` or
`{ ok: false, path, mainNode, otherNode, reason }` for the **first** divergence in document order,
where `reason` is `'type'` (types differ) or `'arity'` (child counts differ).

`path` is the index path already used everywhere else in the codebase (`NodePath`, e.g.
`[0, 2, 1]`), so the mismatch surface can select and reveal the offending node in the tree rather
than describing it in prose.

Matching ignores content entirely — as the platform's fingerprint does. Two nodes with completely
different text match as long as their type and arity agree; that is the point, because the text is
what differs between languages.

### D2. Merge is a pure function over the whole tree, applied atomically

`mergeLanguageIntoTree(main, other, language)` returns a new tree in which every node has gained
`contents[language]` from its counterpart, and returns nothing else — no numbers, no formats, no
structure. It is only called after `matchStructure` reports a match, so it can zip children
positionally without re-checking.

Because it builds a new tree, there is no half-merged state: either `useTreeOperations` commits the
result as one history entry or the document is untouched. Undo removes the merged language in one
step.

Nodes whose counterpart has no content for the merge language are left without that key — the
`multilingual-documents` untranslated marker then shows exactly which nodes the translation did not
cover.

### D3. Existing content in the merge language refuses the merge

The platform throws when a target node already has the merge language; because it mutates as it
goes, that happens mid-merge. StructEdit checks first: if **any** node of the open document already
carries content for the chosen language, the merge is refused with a message naming the language,
and nothing is applied.

_Rejected: merging only into the nodes that lack the language._ A partly-translated document merged
against a full translation would silently keep whichever text was already there, with no way to see
which nodes came from where.
_Rejected: an overwrite option._ Destroying text the operator typed needs a stronger story than a
checkbox in a file-picker flow; re-importing the base document is the honest way back.

### D4. The translation is a document, imported the usual way

The action takes a file through the existing `processFile` pipeline, so HTML, DOCX and DocTree JSON
all work, and the translation gets the same legal transforms the main document did — which matters,
because a match requires the two trees to have been built by the same rules.

Its language is the language the import reports (a declared `<html lang>`, or an envelope's
coverage), shown to the operator and changeable before the merge runs. Its source bytes are
discarded; only the tree is used.

_Rejected: a second editor pane for the translation._ Fixing a mismatch means editing one of the
two trees; the flow is "merge, see the mismatch, open the other file as a document, fix it, merge
again", which needs no simultaneous second editor.

### D5. TDD ordering (bottom-up)

1. `tree-merge.ts` — `matchStructure`: equal trees, differing types, differing arity, first
   divergence in document order, correct path; deep trees.
2. `tree-merge.ts` — `mergeLanguageIntoTree`: contents added per node, other keys untouched,
   numbers/formats/structure untouched, missing counterpart content leaves no key.
3. `useTreeOperations` — one history entry, undo restores, refusal cases leave the document
   unchanged.
4. UI — the action, the language confirmation, the mismatch surface, selecting the offending node.
5. `App.test.tsx` — merging a French capture into a German one, then switching languages.

## Risks / Trade-offs

- **[Strict matching will reject many real pairs]** → That is the platform's rule, and loosening it
  would produce documents that fail on upload instead. The mismatch report is the mitigation: it
  turns a rejection into a specific, fixable defect.
- **[The operator must import the translation twice if it needs fixing]** → Acceptable for the
  first version; the alternative (a second live editor) is a much larger change.
- **[Numbers from the translation are dropped]** → The envelope cannot carry them; the merged
  document keeps the main tree's numbering, which is what the platform would end up serialising
  anyway.
- **[A merged document is large]** → It carries two languages of text; the existing quota handling
  applies unchanged.

## Migration Plan

Purely additive: a new action and a new module, no change to the model, the storage schema or any
existing flow. A document that has never been merged behaves exactly as before. Rollback is a
revert; documents that already carry two languages stay valid and keep rendering through the
language switcher.

## Open Questions

- **Should a mismatch offer to open the translation as a document in one click?** It is the obvious
  next step after reading the report, and it is a small addition once the report exists — left out
  of the first version to keep the flow (and its state machine) simple.
- **Should the merge report which nodes the translation did not cover?** The untranslated markers
  already show it node by node; a summary count after the merge might be worth adding once there is
  feedback from a real bilingual capture.

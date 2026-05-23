---
name: issue
description: Work on a GitHub issue end-to-end. Fetches the issue, plans implementation, writes tests first (TDD), then implements. Use when given a GitHub issue number to work on.
argument-hint: <issue-number>
---

You are about to work on GitHub issue $ARGUMENTS.

## Step 1: Fetch the issue

Run:
```bash
gh issue view --json number,title,body,state,labels,comments $ARGUMENTS
```

Read the full output carefully: title, description, comments, labels.

If the command fails (no repo context, wrong ID, etc.), stop and tell the user.

## Step 2: Enter plan mode

Call the `EnterPlanMode` tool now. While in plan mode:

1. Explore the codebase to understand the relevant code areas.
2. Design a concrete implementation plan that follows the project's existing patterns and conventions.
3. **Plan tests first**: identify which test files to create or modify, and what test cases are needed to drive the implementation via red-green TDD.
4. Present the plan clearly, with:
   - Summary of what the issue asks for
   - Files to change
   - Test cases to write (with names/descriptions)
   - Implementation steps

Then call `ExitPlanMode` to get user approval before proceeding.

## Step 3: Red-Green TDD cycle

Follow strict TDD. **No production code before a failing test.**

For each feature unit:

### RED
- Write the test.
- Run it: `npm run test -- <path>` (or the project's test command).
- Confirm it **fails** for the right reason (feature missing, not a syntax error).
- If it passes immediately, the test is wrong — fix it.

### GREEN
- Write the minimal production code to make the test pass.
- Run tests again. Confirm it passes.
- Do not add anything beyond what the test requires.

### REFACTOR
- Clean up code while keeping tests green.
- Run tests again to confirm.

Repeat for each behaviour unit.

Run the full test suite when done: `npm run test`

All tests must pass before proceeding.

## Step 4: Get review

Use the @code-reviewer subagent to get a code review of your implementation.

Show the full review to the user.

Then address any feedback by iterating on the code and tests until the reviewer approves. Always show the review comments to the user.

## Step 5: Seek PR approval

Present the user with:
- A summary of changes made
- The test cases added
- A proposed PR title and body

Ask: **"Shall I create a pull request for this?"**

Wait for explicit approval. Do **not** push or create a PR until the user says yes.

## Step 6: Create the pull request (only after approval)

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<bullet points>

## Test plan
<checklist>

Closes #$ARGUMENTS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL to the user.

---
name: Debugging & Code Review
description: Use when tracking down a bug, investigating unexpected behavior, or reviewing a diff or pull request. Guides toward root causes and practical, prioritized feedback.
---

You help find the actual cause of a bug and give code review feedback that's
worth acting on.

## Debugging method
- Reproduce first. A fix for a bug you can't reliably trigger is a guess.
- Read the actual error, stack trace, and logs before theorizing — most bugs
  say exactly where they are if you look.
- Bisect: narrow with the smallest change that flips behavior (a commit, an
  input, a code path) rather than staring at the whole diff.
- Form one hypothesis at a time and test it directly; don't shotgun several
  speculative fixes at once.
- Fix the root cause, not the symptom — a null check that hides a bug is a
  second bug.
- Once fixed, ask what let it happen (missing test, missing type, missing
  validation) and close that gap too.

## Code review
- Lead with correctness: does it do what it claims, including on empty
  input, errors, and concurrent or repeated calls?
- Flag security and data-integrity issues before style — unvalidated input,
  missing auth checks, unsafe deserialization, leaked secrets.
- Prefer the smallest change that solves the stated problem; call out
  unrequested abstraction, scope creep, or premature generalization.
- Point at reuse: existing helpers, patterns, or types the change should use
  instead of reinventing them.
- Distinguish blocking issues from nits explicitly, so the author knows what
  actually needs to change before merge.
- Give a concrete failure scenario for every bug you flag — a real input or
  sequence of calls, not just "this looks wrong."

## How to respond
- State the root cause plainly before proposing a fix; don't bury it in
  narration of what you tried.
- Show the minimal diff that fixes the issue, not a surrounding rewrite.
- For a structured pass over a diff, consult the `review-checklist.md`
  resource.

<!-- skill:resource name="review-checklist.md" -->
# Code review checklist

- [ ] Reproduces/handles the empty, error, and boundary cases, not just the
      happy path.
- [ ] No unvalidated input reaches a query, shell command, template, or
      deserializer.
- [ ] Auth/permission checks are present on every new endpoint or action.
- [ ] No secrets, tokens, or credentials in code, logs, or comments.
- [ ] Tests cover the change, including the bug's original failure case.
- [ ] No dead code, commented-out blocks, or leftover debug statements.
- [ ] Naming matches existing conventions in the surrounding file.
- [ ] Errors are handled or explicitly propagated, never silently swallowed.
- [ ] No new abstraction introduced for a single call site.
- [ ] Diff is scoped to the stated change — no unrelated drive-by edits.
<!-- /skill:resource -->

# Task 2 Report: Provider-Neutral Candidate and Hard-Filter Spike

## Scope

Created only the Task 2 implementation and test files:

- `spikes/recommendation/candidate.js`
- `spikes/recommendation/candidate.test.js`

No live provider calls, ranking behavior, or LLM behavior were added.

## RED Evidence

1. Before `candidate.js` existed, ran:

   ```text
   node --test spikes/recommendation/candidate.test.js
   ```

   Result: failed as expected with `Error: Cannot find module './candidate.js'` and 0 passing tests.

2. During self-review, added a regression test for incomplete branch identity and ran the focused suite again.

   Result: failed as expected: `dedupe keeps records with incomplete branch identity separate` asserted 2 canonical candidates but received 1. This demonstrated that matching empty branch, address, and coordinate fields could silently merge uncertain records.

## GREEN Evidence

After the minimal implementation and conservative deduplication adjustment:

```text
node --test spikes/recommendation/candidate.test.js
```

Result: 4 passing tests, 0 failures.

Final full verification:

```text
npm.cmd test
```

Result: 19 passing tests, 0 failures.

## Implemented Behavior

- Normalizes provider-neutral candidate fields and carries evidence without inferring absent facts.
- Merges records only when complete normalized name, branch name, address, and coordinates match; otherwise, only identical provider/place IDs may merge.
- Keeps different branches and records with incomplete branch identity separate.
- Enforces category, budget, walking distance, walking duration, and opening-at-ETA requirements deterministically.
- Requires valid walking-route facts for final travel filtering; straight-line distance cannot substitute.
- Treats required high-consequence evidence as pass only when it is explicitly `true`; absent or non-true evidence is reported as an unknown and fails the candidate.

## Commit

`6e1eca0029e088c4657a80c38a194bea94698d9e` - `spike: validate candidate qualification boundaries`

## Self-Review

- Reviewed the staged diff and confirmed only the two Task 2 files were staged and committed.
- Ran `git diff --cached --check` before committing; it reported no whitespace errors.
- Confirmed the candidate layer contains no provider networking, ranking, or LLM behavior.
- Confirmed the conservative regression test closes the incomplete-identity merge risk discovered during review.

## Concerns

- This is an intentionally local domain spike. Provider-specific provenance, source freshness, route validity, opening-hours policy, and evidence reliability are future adapter/policy work.
- Canonicalization uses a conservative exact normalized branch identity rather than probabilistic matching, so it may retain duplicates. That is deliberate: uncertain matches must remain separate or be excluded, never silently merged.

## Fix After Review

### RED Evidence

After adding focused regressions for blank/null numeric fields and conflicting high-consequence evidence in both input orders, ran:

```text
node --test spikes/recommendation/candidate.test.js
```

Result: 4 passing tests and 2 expected failures. Blank and null numeric fields were coerced to `0`, and false-then-true evidence merged to `true` and incorrectly qualified the candidate.

Added one further focused candidate-plus-route evidence regression and reran the focused suite.

Result: 6 passing tests and 1 expected failure. Route evidence with a later `true` still overwrote contradictory candidate evidence and incorrectly qualified the candidate.

### GREEN Evidence

Implemented finite-only numeric parsing so blank, null, undefined, and non-finite values remain `NaN`. Deduplication now preserves contradictory evidence as `null`, which is non-true and therefore fails high-consequence qualification regardless of source order.

```text
node --test spikes/recommendation/candidate.test.js
```

Result: 7 passing tests, 0 failures.

```text
npm.cmd test
```

Result: 22 passing tests, 0 failures.

# Part Record Convention

Each Markdown file is a retrieval unit. Keep the fields at the top stable so an RAG index can answer both Korean and English queries.

## Required fields

```yaml
record_id: part.<state>.<stable-name>
state: purchased | observed-only | candidate
status: purchased_observed | purchased_observed_identity_unresolved | observed_only | candidate_not_confirmed | gated
aliases: []
role: short product role
quantity_observed: unknown | integer | set
source_ids: []
identity_confidence: confirmed | medium | low | unresolved
```

Then use the same sections:

- `RAG summary` — one short, safe answer.
- `Identity` — what was seen and how it maps to a source.
- `Known specifications` — one row per fact with confidence and source.
- `Unknown / do not assume` — missing values and dangerous assumptions.
- `Product role` — intended use without claiming acceptance.
- `Dependencies and validation gate` — what must be checked before wiring or product claims.

## Status semantics

| Status | Meaning |
|---|---|
| `purchased_observed` | The object is visible in the user photo and the identity has a credible source match. |
| `purchased_observed_identity_unresolved` | The object is visible, but the exact marketplace listing, model, or variant is not closed. |
| `observed_only` | Visible accessory or spare with no linked purchase record; specifications are intentionally blank. |
| `candidate_not_confirmed` | A planning component from the feasibility documents; not evidence that it was bought or is present. |
| `gated` | May be used only after an explicit electrical, physical, or field validation. |

## Safety rule

Never derive a wiring diagram from a record marked `identity_unresolved`, `unknown`, or `candidate_not_confirmed`. Use the validation gate to close the missing field first.

# Study A protocol v1 — native navigation and embodied product acceptance

Status: frozen before participant evidence. This protocol does not authorize recruitment,
provider use, public deployment, or collection of precise location. Those remain separately
approved external gates.

## Purpose and claims

Study A produces two independent results:

1. `navigationGate`: whether one exact native/PWA navigation candidate may be promoted to RC.
2. `physicalGate`: whether an embodied mockup has sufficient handling and display evidence.

A `physicalGate=BLOCK` does not turn visual animation into physical evidence and does not
invalidate otherwise valid navigation calibration. A navigation failure cannot be hidden by a
physical pass.

## Evidence boundary

- Run 5–8 valid, supervised sessions after both bound builds exist.
- Include both `dyad-shared-selection` and `individual-handling` sessions, and exercise both the
  exact native iOS and PWA iOS build receipts.
- Use pseudonymous participant codes only. Never put names, contacts, addresses, venue identity,
  raw coordinates, trace content, provider payloads, or free-form participant notes in governed
  JSON.
- Keep any raw trace privately under the approved retention policy. The governed session records
  only `traceStoredPrivately=true`.
- Record the consent document version. Consent withdrawal invalidates the session immediately.
- The separately approved Study A supervisor signs every complete session and the aggregate with
  Ed25519 over canonical JSON. The signer registry must match the repository pin.

## Session modes

`dyad-shared-selection` uses exactly two participant codes and measures shared comprehension,
selection time, comparison reopening, movement start, navigation safety, Stop, and Reveal.

`individual-handling` uses exactly one participant code and additionally observes display
readability, one-hand use, accidental Stop, carry comfort, and state distinction. An animation or
screen-only demonstration must use `visual-only-animation`, set
`claimsEmbodiedPointing=false`, and cannot produce a physical pass.

Allowed embodied methods are `embodied-wizard-of-oz`, `wired-prototype`, and `ble-prototype`.

## Frozen measures and thresholds

All measures in `session-v1.schema.json` are mandatory. The signed aggregate must contain these
unchanged thresholds:

| Measure | RC rule |
| --- | --- |
| Comprehension pass rate | at least 0.8 |
| Movement-start rate | at least 0.8 |
| Stop or Reveal trusted rate | at least 0.8 |
| Route/sensor failures | 0 |
| False arrivals | 0 |
| Missed arrivals | 0 |
| Each embodied physical measure pass rate | at least 0.8 |

Selection time, comparison reopening, and accidental Stop remain visible observations even when
they are not RC thresholds. Changing a threshold after evidence collection requires a new protocol
version and new sessions.

## Stop rules

Stop immediately for `safety-concern`, `consent-withdrawal`, `unreliable-route`, or
`data-boundary-breach`. A stopped session is not a valid session and must not be included in the
5–8 signed receipts. Open critical safety issues make navigation promotion ineligible.

## Fixed bindings

Before the first session, record SHA-256 digests for the exact native build receipt, PWA build
receipt, route contract, provider configuration, calibration navigation policy, calibration
evidence package, session schema, and aggregate schema, plus the physical mockup version. Every
session repeats its applicable bindings; the aggregate repeats the complete set. Evidence whose
start time precedes its build completion is invalid.

Current schema byte digests:

- `session-v1.schema.json`: `981f9413e65c8eebcee35566f02368e099a127a4f5135dc734de6bcf95043618`
- `aggregate-v1.schema.json`: `b9419404f49085350235ca3f564be37fa98229601f90330488e0ac2830a85790`

If either schema file changes, update this protocol and use a new version; do not silently replace
the hashes in collected evidence.

## Private package layout and execution

```text
/private/study-a/
  study-a-evidence.json   # existing navigation calibration evidence
  aggregate.json          # signed expanded aggregate
  sessions/
    study-a-....json      # 5–8 signed sessions
```

Validate before RC promotion:

```bash
bun research/study-a/validate-study-a.mjs \
  --input /private/study-a \
  --trusted-supervisors /private/authority/study-a-signers.json \
  --output /private/study-a-verdict.json
```

Exit codes are `0=PASS`, `1=FAIL`, and `2=BLOCK`. Only a signed, digest-bound aggregate with
`navigationGate=PASS`, `rcPromotionEligible=true`, 5–8 valid sessions, and zero open critical
issues may feed RC promotion. The promoter independently revalidates the private expanded package;
editing a verdict JSON cannot authorize promotion.

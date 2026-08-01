# Somewhere project status

Status as of 2026-08-01

This page distinguishes three different claims that previously appeared close
enough to be confused:

| Scope | Current gate | Meaning |
|---|---|---|
| V2 mobile-web and Cloudflare repository slice | **PASS** | Exact commit `d9605bc21bc2809b9d0391f1481f7ac451e14545` passed its Ubuntu repository seal. |
| Approved blueprint project | **BLOCK** | Native iOS, the high-fidelity full-scale physical compass, Study A, Study B, and provider/legal evidence are incomplete. |
| Public release | **BLOCK** | Production Cloudflare, domain/origin/PITR, exact-device, provider, legal, study, and Apple distribution authority receipts are absent. |

The first row is strong evidence, but it cannot imply either later row. The
approved [blueprint](../BLUEPRINT.md) calls the native iOS field experience and
physical compass mockup required final outcomes. The current repository contains
neither a Swift/Xcode client nor a physical design package, and Ubuntu cannot
prove macOS signing, iPhone behavior, fabrication, ergonomics, participant
results, counsel approval, provider rights, or production control-plane state.

## Machine-readable result

Run:

```bash
bun run verify:blueprint-status
```

The source is
[`scripts/completion/blueprint-completion-v1.json`](../scripts/completion/blueprint-completion-v1.json).
Its validator derives three separate values:

```text
serviceSlice: PASS
blueprintProject: BLOCK
publicRelease: BLOCK
```

Gate algebra is fail-closed: `FAIL` wins over `BLOCK`, and `BLOCK` wins over
`PASS`. A tracked registry entry may describe required external evidence, but
editing it is not authority to create that evidence.

## Track status

| Track | Gate | Current evidence boundary |
|---|---|---|
| Service web/backend | PASS | Sealed d9605bc final verdict and manifest outside Git |
| Native iOS | BLOCK | No Swift/Xcode source, macOS build receipt, signing, or native field evidence |
| Physical product | BLOCK | No full-scale high-fidelity model or embodied handling/readability evidence |
| Study A | BLOCK | No 5–8 supervised sessions or promoted navigation RC |
| Study B | BLOCK | No 10–15 counterbalanced dyads or frozen-result analysis |
| Provider/legal | BLOCK | No authorized provider rights/quota or independent Korean review |
| Public operations | BLOCK | No production Cloudflare, final physical-device, or Apple distribution receipts |

## Execution authority

The complete dependency order is in the
[blueprint completion runbook](operations/blueprint-completion.md). The detailed
implementation plan is
[`2026-08-01-somewhere-blueprint-completion.md`](superpowers/plans/2026-08-01-somewhere-blueprint-completion.md).
The old exact-tree seal remains valid historical evidence for d9605bc; every new
tracked change requires a new repository final wave before a later release
candidate can use it.

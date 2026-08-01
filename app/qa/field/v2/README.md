# Somewhere V2 iPhone release evidence gate

This directory versions the V2 field contract. It does not replace or rewrite
the historical v0.2 runbook in the parent directory.

Repository completion and device release are separate results. Ubuntu browser
tests may validate this package and still must report `deviceGate=BLOCK`.
Only four post-freeze physical runs on one iPhone 15 Pro Max can produce
`deviceGate=PASS`. Changing an origin label is insufficient: every tester
attestation must verify against a separately controlled field-release signer
registry.

`authority-pins.json` is deliberately `BLOCK` by default. A reviewed source
commit must activate it with the exact SHA-256 digests of the separately held
field and Study A registries. A registry selected only with a CLI path is not
trusted. The final binding reads these pins from the exact build commit, so an
uncommitted local replacement cannot establish release authority.

## Order of evidence

1. Freeze and follow [`research/study-a/protocol-v1.md`](../../../../research/study-a/protocol-v1.md),
   then run five to eight supervised Study A calibration sessions. The package
   must include both dyad shared-selection and individual handling sessions,
   and must bind the exact native/PWA builds, route, provider, policy, schemas,
   and physical mockup.
2. Put the navigation calibration records in private `study-a-evidence.json`
   matching `calibration-session.schema.json`. Every record must use the same
   in-envelope candidate, the calibration parent, a unique trace and
   attestation, and zero unsafe events. Supervisor attestations must verify
   against a separately controlled Study A signer registry.
   The candidate must be a new immutable calibration version, change exactly
   one coupled family, stay inside the versioned numeric envelope, cover both
   browser modes and both environments, and record all mandatory zero-safety
   counters plus reviewed misses/recoveries.
3. Put the separately signed expanded aggregate in `aggregate.json` and the
   signed de-identified sessions in `sessions/*.json`. Validate them with
   `research/study-a/validate-study-a.mjs`. Raw coordinates, participant names
   or contacts, and free-text venue identity are forbidden.
4. Run `promote-navigation-policy.mjs`. It is the only tool allowed to create
   `contracts/policy/navigation-v2-rc-1.json`. It independently validates the
   expanded package and binds its signed aggregate; a hand-edited verdict file
   cannot authorize promotion. Physical handling may remain `BLOCK` while a
   valid navigation result promotes, but visual-only evidence cannot claim an
   embodied pass.
5. Commit the promoted policy, then finalize the external promotion receipt
   with that policy-introduction commit SHA.
6. Build and deploy a new RC after promotion. Calibration runs are not release
   runs.
7. Execute Safari and Home Screen runs in open-sky and building-dense
   environments, each for at least 20 minutes.
8. Validate the four private packages and bind them to the exact RC build.

Do not create the RC policy when Study A evidence is absent. Do not publish raw
traces: they contain exact location. Keep only `trace.sha256` plus the declared
private retention or discard disposition in the governed package.

## Physical run matrix

| Run | Browser mode | Environment | Directory suffix |
| --- | --- | --- | --- |
| A | Safari | open sky | `safari-open-sky` |
| B | Safari | building dense | `safari-building-dense` |
| C | Home Screen | open sky | `home-screen-open-sky` |
| D | Home Screen | building dense | `home-screen-building-dense` |

Each exact directory is
`iphone-v2-<40-character-build-sha>-<suffix>` and contains only:

- `metadata.json`
- `checklist.md`
- `trace.sha256`
- `screens/`

The physical `screens/` directory contains locally reviewed PNG screenshots.
Every exact filename and byte digest is declared in `metadata.json`; the
metadata attestation therefore covers screenshot replacement as well as the
checklist and trace digest.
Raw trace files, coordinates, API payloads, cookies, capabilities, and provider
credentials are forbidden.

## P1-P7

- P1: direct-action permissions and first trustworthy direction
- P2: denied/degraded capability remains safe and nondirectional
- P3: background, screen-lock, freshness, and Wake Lock recovery
- P4: real walking-route agreement, corridor exit, and provider failure
- P5: Near hysteresis and fail-closed latched arrival
- P6: Reveal orthogonality, immediate Stop, Continue, and guarded recovery
- P7: phone UI, accessibility, PWA/offline/update, and trace privacy

Use the detailed approved protocol when recording notes. All seven gates must
be checked in `checklist.md` and represented as `PASS` objects in metadata.
Any observed unsafe event or critical defect invalidates the package.

## Commands

Schema validation proves shape only:

```bash
bun app/qa/field/v2/validate-evidence.mjs \
  --mode schema \
  --input app/qa/field/v2/fixtures/synthetic-schema-valid \
  --output /private/evidence/task-21-schema-valid.json
```

The same synthetic package in release mode exits `2` and reports `BLOCK`.
Malformed or contradictory evidence exits `1` and reports `FAIL`.

Validate the expanded private package first:

```bash
bun research/study-a/validate-study-a.mjs \
  --input /private/study-a \
  --trusted-supervisors /private/authority/study-a-signers.json \
  --output /private/evidence/study-a-verdict.json
```

Promotion without either the navigation calibration records or the expanded
Study A package exits `2`, writes a blocked receipt, and does not create an RC
policy:

```bash
bun app/qa/field/v2/promote-navigation-policy.mjs \
  --input /private/study-a \
  --trusted-supervisors /private/authority/study-a-signers.json \
  --parent-policy contracts/policy/navigation-v2-calibration-1.json \
  --output-policy contracts/policy/navigation-v2-rc-1.json \
  --receipt /private/evidence/rc-promotion-receipt.json
```

After promotion and the post-promotion build, bind all evidence:

```bash
bun scripts/release/verify-rc-build-binding.mjs \
  --repo . \
  --policy contracts/policy/navigation-v2-rc-1.json \
  --promotion-receipt /private/evidence/rc-promotion-receipt.json \
  --build-receipt /private/evidence/build-receipt.json \
  --evidence /private/evidence/physical-runs \
  --trusted-signers /private/authority/field-signers.json \
  --output /private/evidence/rc-build-binding.json
```

Exit codes are stable: `0=PASS`, `1=FAIL`, `2=BLOCK`.

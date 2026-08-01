# V2 release runbook

This runbook separates repository completion from public release. It never
deploys, writes a secret, promotes a policy, or manufactures external evidence.

## 1. Authority and prerequisites

Use the order in [`../README.md`](../README.md) and
[`../authority-map-v2.json`](../authority-map-v2.json). Run from a clean,
committed Git tree with Bun 1.3.14, Node 24, Git, tar, OpenSSL, curl, Wrangler,
Playwright, and the pinned read-only `codex2` reviewer available.

The reviewed plan is external to the product tree and is bound by SHA-256. The
evidence root must also be outside the repository. Never place credentials,
raw physical traces, exact user coordinates, or provider payloads in the Git
tree or public evidence.

## 2. Repository verification

```bash
bun install --frozen-lockfile
bun run verify:release
git diff --check
```

`verify:v2` covers the frozen prototype, contracts, app, server, operations,
types, lint, and builds. `verify:release` additionally validates release
schemas, command/check registries, canonical document links, exact-tree
materialization, signal cleanup, digest binding, and honest BLOCK behavior.
Use `verify:v2` alone for a shorter development gate; `verify:release` already
includes it.

## 3. CI and protected staging

[`v2-ci.yml`](../../.github/workflows/v2-ci.yml) runs on pushes and pull
requests with read-only repository permission and no secret references. It
verifies V2, validates the synthetic field schema while requiring release
`BLOCK`, audits pinned dependencies, creates a gitless production build and
Worker dry-run in runner-temporary output, scans emitted artifacts, and uploads
only sanitized repository evidence.

[`v2-staging.yml`](../../.github/workflows/v2-staging.yml) is manual-only and
declares the `somewhere-v2-staging` GitHub Environment. Repository validation
can prove that declaration, but required reviewers, branch restrictions, and
administrator bypass policy are control-plane facts; release remains `BLOCK`
until an administrator verifies them in GitHub.

The protected workflow requires an exact reviewed release SHA, an annotated
`somewhere-v2-rc-*` tag on protected `main`, the base64 repository verdict and
terminal manifest, their approved SHA-256 digests, an approved prior
release/config digest, the protected environment's external fence-receipt
digest, and an approved HTTPS origin. The repository verdict and manifest are
non-secret inputs; their digests must equal protected environment variables and
exact lines in the annotated tag. `verify-staging-seal.mjs` then proves that the
verdict and terminal manifest are untampered, name the checked-out SHA/tree,
contain `repositoryReady: PASS`, and still contain `releaseReady: BLOCK`.
Staging deliberately consumes repository readiness only: requiring public
release readiness here would create a cycle because Study A and physical-device
evidence are collected from the staged exact build. The RC tag must therefore
be created only after the repository seal exists. The D1 target is derived from
the checked-in staging binding; it is never accepted as workflow input. It then
performs this fixed sequence:

Before any staging or production deployment, the Cloudflare authority must set
`CANONICAL_ORIGIN` with `wrangler secret put CANONICAL_ORIGIN --env staging` or
`--env production`. The value is external evidence and must be the exact
normalized public HTTPS origin: no credentials, trailing slash, path, query, or
fragment. It is never committed or printed. Immediately before deployment,
`cloudflare-acceptance-gates.sh deployment-secret-check <environment>` queries
the target Worker with `wrangler secret list --format json` and aborts unless
the exact secret name exists; Wrangler returns names and types, not values.
The staging workflow runs this check in the deploy step. The Worker also rejects
every session and mutation when the binding is missing or malformed. Local
loopback development does not use this secret.

1. prove the prior Durable Object lifecycle/export and current binding are
   identical;
2. verify that the external operations authority has already closed admission;
3. prove old-epoch reservations are drained;
4. record D1 Time Travel state and export a portable backup, encrypt it to the
   protected staging recipient certificate, hash the ciphertext, and keep the
   plaintext outside the uploaded artifact directory;
5. apply forward-only expand migrations;
6. verify the remote `CANONICAL_ORIGIN` secret and deploy one atomic Worker
   version while admission stays closed;
7. smoke-test same-origin static/API routing and private no-store headers;
8. wait for the operations authority's two-sample recovery policy to reopen
   admission, then verify ready/OPEN health.

Failure never opens the fence. A failure handler rechecks that admission is
still closed. The workflow does not accept inline SQL, gradual deployment,
Durable Object rollback, lifecycle rename/transfer, or secret-bearing pull
requests. Restore uses the governed backup/Time Travel runbook and a raised
epoch; schema contraction and lifecycle changes require a separately reviewed
forward release.

The historical [v0.2 Pages workflow](../../.github/workflows/app.yml) now
verifies only. It contains no Pages write permission, artifact upload, or
deployment action, so current V2 source cannot silently replace the historical
origin.

## 4. Prepare the exact commit

```bash
export SOMEWHERE_SHARED_EVIDENCE_ROOT=/absolute/external/.somewhere-v2-evidence
export SOMEWHERE_FINAL_SHA="$(git rev-parse HEAD)"
export SOMEWHERE_PLAN=/absolute/path/somewhere-v2-launch-architecture.md
export SOMEWHERE_PLAN_SHA256=sha256:<64-hex>

bun scripts/release/prepare-final-wave.mjs \
  --repo "$PWD" \
  --sha "$SOMEWHERE_FINAL_SHA" \
  --plan "$SOMEWHERE_PLAN" \
  --plan-sha256 "$SOMEWHERE_PLAN_SHA256" \
  --evidence-root "$SOMEWHERE_SHARED_EVIDENCE_ROOT" \
  --output "$SOMEWHERE_SHARED_EVIDENCE_ROOT/final/$SOMEWHERE_FINAL_SHA/preparation.json"
```

Preparation archives and verifies the exact commit in an isolated directory,
runs frozen installation and release verification, creates one production
build, copies only digest-bound artifacts, and emits default external BLOCK
receipts. It selects a tracked, validated RC policy only when one exists;
otherwise calibration remains explicit and the Study A/RC gate stays BLOCK.

## 5. Run the four lanes

Each detached lane receives the same absolute evidence root and the derived
`final/<sha>` root:

```bash
for lane in F1 F2 F3 F4; do
  bun scripts/release/run-final-lane.mjs \
    --lane "$lane" \
    --repo "$PWD" \
    --preparation "$SOMEWHERE_SHARED_EVIDENCE_ROOT/final/$SOMEWHERE_FINAL_SHA/preparation.json" \
    --commands scripts/release/final-lane-commands-v1.json \
    --evidence-root "$SOMEWHERE_SHARED_EVIDENCE_ROOT" \
    --final-root "$SOMEWHERE_SHARED_EVIDENCE_ROOT/final/$SOMEWHERE_FINAL_SHA" \
    --harness-receipt "$SOMEWHERE_SHARED_EVIDENCE_ROOT/final/$SOMEWHERE_FINAL_SHA/$lane/harness-command.json" \
    --output "$SOMEWHERE_SHARED_EVIDENCE_ROOT/final/$SOMEWHERE_FINAL_SHA/$lane/lane-verdict.json"
done
```

- F1 checks plan/evidence completeness and its bound independent review.
- F2 checks code, runtime, security, dependency audit, red-team cases, and
  prepared production artifacts.
- F3 starts the prepared build only, runs Chromium/WebKit/curl/Lighthouse,
  collects exact-build visual evidence, and keeps unavailable physical-device
  evidence as an external BLOCK.
- F4 checks blueprint provenance, build identity, V2 scope, production markers,
  and an independent scope review.

Every argv is executed by `capture-command-receipt.mjs`; each primary output,
stdout, stderr, command, policy, SHA, tree, and digest is bound. Missing
registered checks are BLOCK; extra, contradictory, foreign, or tampered
receipts are FAIL.

## 6. Cleanup and final verdict

Run `verify-final-cleanup.mjs` for exact lanes F1–F4 and closed ports 8787/8788,
then `validate-final-verdict.mjs`. Only after repository readiness is PASS may
`seal-final-manifest.mjs` write the terminal manifest. A repository PASS does
not override an external BLOCK. The repository finalizer is intentionally
incapable of authenticating external PASS: `external-gates.json` is bound to
the exact SHA/tree and its digest is recorded in the verdict, but an internally
consistent `releaseGate: PASS` is rejected as `UNAUTHENTICATED_EXTERNAL_PASS`.
The repository seal accepts only `repositoryReady: PASS` with
`releaseReady: BLOCK`. A later public-release authority must verify independent
signed receipts outside the repository-writable evidence tree; editing the
external-gates JSON is never an authorization path.

Signal handlers are installed before lane allocation. HUP, INT, and TERM must
terminate the owned process group, remove guarded temporary state, and write a
probe receipt. Any open port, live PID, browser context, or temporary root
prevents cleanup PASS.

## 7. External public-release gates

All of these must be supplied by their actual authority:

1. Cloudflare production account, target-specific bindings/secrets, exact
   `CANONICAL_ORIGIN`, domain, migrations, deployment and rollback evidence.
2. Place and walking-route provider rights, attribution, quota and production
   adapter approval.
3. Independent Korean privacy/location-information review.
4. Study A evidence and a tracked, digest-bound RC navigation policy.
5. Four exact-build iPhone 15 Pro Max runs: Safari and Home Screen in open-sky
   and building-dense environments.
6. If native distribution is required, macOS/Xcode signing, TestFlight and
   App Store evidence.

Until every required receipt passes, `releaseReady` remains `BLOCK` even when
`repositoryReady` is `PASS`. External PASS synthesis belongs to a separate,
authority-backed public-release decision after staging/Study A/device evidence;
the repository finalizer must not manufacture it.

## 8. Cost and retention

Cloudflare Free-first is a budget target, not a zero-cost guarantee. The
versioned operations policy warns at 50% and closes new admission at 80%.
Before production, revalidate current official limits and pricing against the
target account.

Official pages rechecked on 2026-07-29 reported:

| Surface | Workers Free allowance relevant to this pilot |
|---|---|
| [Workers](https://developers.cloudflare.com/workers/platform/pricing/) | 100,000 dynamic requests/day and 10ms CPU/invocation; static asset requests are free/unlimited |
| [D1](https://developers.cloudflare.com/d1/platform/pricing/) | 5M rows read/day, 100k rows written/day, 5GB account storage; the [D1 limit](https://developers.cloudflare.com/d1/platform/limits/) remains 500MB/database |
| [SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) | 100k requests/day, 13k GB-s/day, 5M rows read/day, 100k rows written/day, 5GB total stored data |
| [Queues](https://developers.cloudflare.com/queues/platform/pricing/) | 10k operations/day and fixed 24h retention; a normal delivery commonly consumes write, read, and delete operations |
| [Workers Logs](https://developers.cloudflare.com/workers/platform/pricing/#workers-logs) | 200k events/day and 3-day retention |

These are account/product counters, not a promise that one Somewhere request
costs one unit. D1 indexes add writes, Queue retries/DLQ add operations, and a
journey can call both a Worker and a Durable Object. The executable 15-meter
collector and reservation ledger therefore govern admission from measured
usage instead of estimating from HTTP traffic alone. Exceeding a Free limit can
cause operations to fail; it does not silently convert this repository into a
paid deployment.

Canonical retention is machine-checked from
[`../architecture/operations-policy-v1.json`](../architecture/operations-policy-v1.json):
session 24h, CSRF 30m, prepared receipt 1h, sealed selection 180d, inbox/outbox
48h, feedback capability 7d, coarse operations 7d, security/migration/deletion
audit 180d, Queue/DLQ 24h, Worker logs 3d, D1 Time Travel 7d, Durable Object
PITR 30d, and tombstone 48h.

## 9. Optimization disposition

Todo 22 extracted lane lifecycle/process cleanup from the runner after
characterization tests, reducing the executable runner below 250 lines without
changing its public argv. No additional deletion was judged safe: historical
v0.1/v0.2 documents and tests are retained for provenance and regression, and
release schemas/registries are deliberately explicit. This is the recorded
`NO_SAFE_OPTIMIZATION` outcome beyond the measured lifecycle extraction.

# V2 pilot backend operations

This runbook describes the executable V2 operations boundary. It does not
replace the product blueprint or the frozen operations policy.

## Production authority boundary

Staging and production call a private, same-account collector Worker through
the `OPERATIONS_AUTHORITY` Service Binding every five minutes. The application
Worker has no public admin route. It signs the fixed internal request and
accepts a response only when all of the following match:

- exact environment, release digest, and current D1 write epoch;
- configured key ID and HMAC-SHA256 signature;
- timestamp within five minutes and a fresh 128-bit-or-greater nonce;
- strict 64 KiB JSON with no unknown fields;
- exactly the frozen 15 meter IDs;
- exact-byte provider-rights and Korean-review artifact digests;
- versioned PostgreSQL trigger facts.

Transport nonces and semantic command IDs are separate. A nonce is never
reusable. An already-applied command replays only when its exact payload digest
and capture time match; a changed body is a conflict.

The legal, meter, and PostgreSQL projections commit in one D1 batch. A failure
in any statement rolls back all three. Missing binding/configuration, source
failure, authentication failure, malformed data, legal BLOCK, or persistence
failure immediately sets admission to `METER_BLOCK`, resets recovery progress,
records only a coarse failure receipt, and skips scheduled producers.

## Required deployment configuration

The collector Worker must be deployed before the API Worker. The checked-in
Wrangler configuration binds:

- staging to `somewhere-operations-authority-staging`;
- production to `somewhere-operations-authority-production`.

The deployment control plane must provide these target-specific values:

```text
OPERATIONS_AUTHORITY_HMAC_KEY
OPERATIONS_AUTHORITY_KEY_ID
OPERATIONS_RELEASE_DIGEST
OPERATIONS_DATA_FLOW_DIGEST
OPERATIONS_RETENTION_POLICY_DIGEST
OPERATIONS_PROVIDER_ID
OPERATIONS_PROVIDER_ADAPTER_VERSION
OPERATIONS_PROVIDER_ORIGINS
OPERATIONS_REPRESENTED_CONDITION_GATES
OPERATIONS_REVIEWER_DIGEST
```

The HMAC key is a Cloudflare secret and must be at least 32 bytes. The other
values are release configuration, not request input. Staging and production
must not reuse authority Workers, keys, provider credentials, D1 databases,
Queues, or Durable Object namespaces.

The repository intentionally contains no synthetic production values. If any
required binding or value is absent, admission remains closed.

## Recovery

One healthy sample moves a blocked release to `RECOVERY_VERIFY`. Re-reading the
same sample or receiving a new sample after 299 seconds does not advance
recovery. A second distinct healthy authority captured at least 300 seconds
later may reopen admission, provided the current fence, exact release
envelopes, two verified legal gates, provider budget, Queue health, old-epoch
reservations, and every meter still pass.

## PostgreSQL decision

Every authenticated authority command produces a `postgres-trigger-v1`
decision receipt from strict measured facts. The receipt is release-bound,
reviewer-bound, retained for 180 days, and always records `dualWrite: false`.
Equal facts for different releases receive different decision IDs. A
`PLAN_POSTGRES_CUTOVER` receipt starts planning only; it does not enable
dual-write or execute a migration.

## Local verification and external gates

Run:

```bash
bun run verify:ops
```

The command runs Task 14 tests, strict type checking, the app build, a Wrangler
dry run, live local HTTP/D1/Durable Object/Queue/DLQ probes, the eight-surface
canary scan, and executable local export/restore and rollback fixtures. It must
finish with `summary.txt` reporting every surface as `PASS` and leave no Worker
or temporary runtime behind.

The export/restore exercise is deliberately labeled
`local_executable_fixture`. It is not evidence of production retention,
authorized cutover, provider rights, independent Korean legal review, real
Cloudflare account-meter access, or public deployment. Those remain external
release gates and must stay BLOCK until their target-specific receipts exist.

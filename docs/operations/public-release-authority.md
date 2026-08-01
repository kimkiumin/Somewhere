# Public release authority

The repository finalizer cannot authenticate external `PASS`. This runbook is
for the separate authority that receives eight Ed25519-signed receipts outside
the repository and binds them to one exact release identity.

## Required purposes

The receipt directory contains exactly one `<purpose>.json` for each purpose:
`cloudflare-production`, `cloudflare-canonical-origin`,
`cloudflare-production-pitr`, `provider-rights-quota`,
`korean-privacy-location-review`, `study-a-rc`, `physical-iphone`, and
`native-distribution`.

The trust store explicitly grants each authority only the purposes it owns.
Provider/licensing, qualified Korean counsel, Study A supervision, physical
field acceptance, Apple distribution, and Cloudflare operations are separate
roles. One key covers multiple purposes only when every purpose is explicit.

## Verification

Keep the trust store, receipts, and output outside Git. Then run:

```bash
bun scripts/public-release/verify-public-release.mjs \
  --trust-store /private/authority/trusted-authorities.json \
  --receipts /private/release-receipts \
  --final-sha "$FINAL_SHA" \
  --source-tree "$SOURCE_TREE" \
  --terminal-manifest-sha256 "$TERMINAL_MANIFEST_SHA256" \
  --repo "$PWD" \
  --output /private/public-release-decision.json
```

Every receipt signs canonical JSON containing its purpose, authority,
issue/expiry time, exact Git SHA/tree, terminal-manifest digest, decision,
evidence digests, and enforced conditions. Verification rejects missing,
duplicate, reordered, unknown, expired, out-of-scope, untrusted, altered, or
repository-resident receipts. Output is mode `0600` and is never overwritten.

`PASS` means all eight inputs were valid and individually said `PASS`. A signed
`FAIL` dominates; otherwise a signed `BLOCK` dominates. The decision does not
deploy, change DNS, set a secret, sign an app, recruit a participant, or waive a
legal condition. The output records the canonical trust-store digest and every
complete signed-receipt digest so a protected control plane can pin the exact
authority inputs it approved.

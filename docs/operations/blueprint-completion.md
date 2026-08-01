# Blueprint completion runbook

This runbook governs the whole approved product. It sits above the
[V2 repository release runbook](v2-release.md), which proves only the mobile-web
and Cloudflare service slice.

## 1. Read the three gates separately

```bash
bun run verify:blueprint-status
```

- `serviceSlice` covers the current web app, contracts, Worker, operations, and
  repository evidence.
- `blueprintProject` additionally requires native iOS, the physical compass,
  Study A, Study B, and provider/legal feasibility.
- `publicRelease` additionally requires production operations and distribution.

Never publish one value under another name.

## 2. Dependency order

```text
truthful scope gate
→ external receipt authority
→ provider and Korean legal preflight
→ native iOS source and macOS verification
→ physical form, display, and full-scale model
→ protected exact-build staging
→ Study A and navigation RC promotion
→ final PWA/native physical-device runs
→ physical handling evidence
→ frozen Study B comparison
→ final blueprint and public-release synthesis
```

Provider and legal preflight precede participant exposure. Study A precedes RC
promotion. RC promotion precedes final exact-build device acceptance. Study B
does not start until Study A freezes its primary endpoint, practical-difference
threshold, and decision rule, and until the mockup can be handled safely.

## 3. Local versus authority-owned work

Ubuntu may implement and test schemas, validators, the service, native source,
cross-client fixtures, parametric design source, display simulation, study
protocols, and fail-closed evidence tooling.

The following remain authority-owned:

- macOS/Xcode build, signing, TestFlight, and App Store state;
- real iPhone sensor and route behavior;
- fabricated full-scale form, mass, grip, carry, outdoor readability, and
  embodied pointing behavior;
- informed participant sessions and de-identified research evidence;
- provider terms, attribution, quota, and production credentials;
- independent Korean privacy and location-information advice;
- Cloudflare account, secret, DNS, migration, backup, deployment, and rollback
  control-plane facts.

Absence of one of these inputs is a normal `BLOCK`, not a failed local build and
not an invitation to synthesize a `PASS`.

## 4. Exact-tree renewal

The d9605bc seal proves its own tree only. After implementation changes:

1. run `bun install --frozen-lockfile`;
2. run `bun run verify:release` and `bun run verify:blueprint`;
3. commit the reviewed tree;
4. prepare and run F1–F4 for the new SHA;
5. seal the new repository manifest;
6. bind every later native, physical, study, and external receipt to that exact
   SHA, tree, policy, route, provider, schema, and manifest digest.

## 5. Completion rule

Whole-project completion is `PASS` only when every
`requiredForBlueprint: true` track in
[`blueprint-completion-v1.json`](../../scripts/completion/blueprint-completion-v1.json)
has authority-backed evidence. Public release is `PASS` only when every track
required for public release also passes through an independent signed-receipt
decision described in the
[public release authority runbook](public-release-authority.md). Repository
files cannot authenticate those external signatures.

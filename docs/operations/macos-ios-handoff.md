# macOS iOS development handoff

This is a non-authoritative operational handoff. It does not add product
requirements, change the approved blueprint, or promote any completion or
release gate. When this page conflicts with product authority, follow
[`../README.md`](../README.md).

## 1. Load only the context needed for the task

For a new macOS checkout, read these files in order:

1. root [`AGENTS.md`](../../AGENTS.md) for repository rules and version
   boundaries;
2. [`../README.md`](../README.md) for document authority;
3. [`../project-status.md`](../project-status.md) for the three separate
   service, blueprint, and public-release gates;
4. [`../../ios/README.md`](../../ios/README.md) for canonical native build
   commands;
5. [`ios-field-release.md`](ios-field-release.md) only when collecting signed
   build, TestFlight, or physical-device evidence.

Read root [`BLUEPRINT.md`](../../BLUEPRINT.md) and the one relevant file under
`docs/blueprint/` only when a product decision is required. Do not use
`docs/codex_handoff_agents.md`, `docs/repo_setup_guide.md`,
`docs/codex_first_prompt.md`, or `docs/combined_source_pack.md` as V2
authority; they are retained working or historical material.

Do not replace variable status with a percentage copied into prose. Run
`bun run verify:blueprint-status` to obtain the current machine-readable gate
values.

## 2. Fetch the handoff branch exactly

The Mac handoff branch is `codex/v2-macos-handoff`. The implementation baseline
before the handoff-only fixes was `73b7491`. The current remote branch tip, not
that historical baseline, is the checkout to continue from.

For a fresh clone:

```bash
git clone git@github.com:kimkiumin/Somewhere.git
cd Somewhere
git fetch --prune origin
git switch --track origin/codex/v2-macos-handoff
git status --short --branch
git rev-parse HEAD
git rev-parse HEAD^{tree}
```

For an existing checkout:

```bash
git fetch --prune origin
git switch codex/v2-macos-handoff
git pull --ff-only
git status --short --branch
```

Start only from a clean tree. Record the observed commit and tree in the CI or
private evidence for that run; do not hard-code a self-referential “latest
commit” into this document.

## 3. Toolchain and repository verification

The repository pins Bun `1.3.14` in `.bun-version` and requires Node 24. The
native project requires iOS 17+, Swift 6, Xcode, and XcodeGen 2.42.0. Install
dependencies without changing the lockfile:

```bash
bun install --frozen-lockfile
bun run verify:blueprint
```

`verify:blueprint` includes the native source gates but honestly keeps
authority-owned work `BLOCK` when its external receipts are absent. The broader
`verify:release` command includes Linux-specific operations and process evidence
(`sha256sum`, GNU `find`, and `/proc` boundaries), so run it on the Ubuntu
development host or the repository's Linux CI rather than treating it as a Mac
prerequisite. Its success is repository evidence for that exact tree, not a
replacement for the separately sealed release result.

Use the exact generation, unit, UI, and unsigned archive commands in
[`../../ios/README.md`](../../ios/README.md). A pull request also runs the
read-only [`ios-ci.yml`](../../.github/workflows/ios-ci.yml) job on a GitHub
`macos-15` runner. That job proves buildability only; it does not sign or
distribute the app.

## 4. Local configuration boundary

The checked-in bundle identifiers under `example.*` and
`SOMEWHERE_API_ORIGIN=https://example.invalid` are deliberate non-production
values. Keep them until the owner approves the real application identifiers and
canonical HTTPS origin. For an authorized local field build, override those
Xcode build settings locally or in an authorized secret-bearing CI environment;
never put Apple credentials or private signing material in `ios/project.yml`.

Do not commit:

- generated `Somewhere.xcodeproj`, DerivedData, archives, or result bundles;
- certificates, provisioning profiles, App Store Connect keys, or authority
  private keys;
- raw coordinates, route traces, provider payloads, or participant identity;
- files from the private native evidence directory described in
  [`ios-field-release.md`](ios-field-release.md).

The repository ignores common generated and signing files, but ignore rules are
only a guardrail. Check `git status` before every commit.

## 5. What macOS completion can and cannot claim

Passing project generation, unit tests, UI tests, and an unsigned archive can
advance the native buildability evidence. It cannot make any of these claims:

- production signing or TestFlight distribution;
- behavior on the exact iPhone 15 Pro Max hardware identifier `iPhone16,2`;
- open-sky, building-dense, network interruption, or heading-interference field
  acceptance;
- provider rights, Korean legal review, physical-product acceptance, study
  evidence, Cloudflare production authority, or public release.

Those remain separate signed or authority-owned gates in
[`ios-field-release.md`](ios-field-release.md) and
[`blueprint-completion.md`](blueprint-completion.md).

## 6. End-of-session handoff checklist

Before handing the Mac work back:

1. record `git rev-parse HEAD` and `git rev-parse HEAD^{tree}`;
2. record Xcode, SDK, macOS, and XcodeGen versions;
3. retain sanitized test/archive digests outside raw private artifacts;
4. run the relevant commands from `ios/README.md` again;
5. run `git diff --check` and confirm `git status --short` contains only the
   intended source changes;
6. update operational documentation only when the procedure changed, without
   rewriting product authority or historical evidence;
7. commit and push to a review branch, then use the pull request's macOS CI as
   the shared handoff record.

# macOS iOS development handoff

This is a non-authoritative operational handoff. It does not add product
requirements, change the approved blueprint, or promote any completion or
release gate. When this page conflicts with product authority, follow
[`../README.md`](../README.md).

For the current `Roll the compass!` source map, Xcode GUI quickstart, Simulator
demo states, local Worker/GPS test, physical-iPhone setup, and copyable AI
context, continue with
[`native-ios-collaboration-handoff.md`](native-ios-collaboration-handoff.md).

## 1. Load only the context needed for the task

For a new macOS checkout, read these files in order:

1. root [`AGENTS.md`](../../AGENTS.md) for repository rules and the V2 authority
   and version boundary; do not load its frozen v0.1 implementation sections
   into V2 work unless the task explicitly targets `prototype/`;
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
`bun run verify:blueprint-status` to read the tracked project-status registry,
then compare its evidence commit with [`../project-status.md`](../project-status.md).
That registry is not an exact-tree seal for the current checkout; a newer HEAD
requires its own repository evidence before it can inherit a release claim. The
recorded service PASS depends on authority receipts outside Git, so a GitHub-only
clone can validate the registry but cannot recreate or re-sign those receipts.

## 2. Fetch the handoff branch exactly

The Mac handoff branch is `codex/v2-macos-handoff`. The implementation baseline
before the handoff-only fixes was `73b7491`. The current remote branch tip, not
that historical baseline, is the checkout to continue from.

For a fresh clone with SSH configured:

```bash
git clone git@github.com:kimkiumin/Somewhere.git
cd Somewhere
git fetch --prune origin
git switch --track origin/codex/v2-macos-handoff
git status --short --branch
git rev-parse HEAD
git rev-parse HEAD^{tree}
```

If SSH is unavailable, clone the same repository through authenticated HTTPS or
GitHub CLI, then run the same `fetch` and `switch` commands:

```bash
git clone https://github.com/kimkiumin/Somewhere.git
# alternatively, use instead of the previous line:
# gh repo clone kimkiumin/Somewhere Somewhere
cd Somewhere
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

The repository pins Bun `1.3.14` in `.bun-version`. Repository-wide historical
regression parity requires Node 24 from `.nvmrc`; the native build itself uses
Bun, Swift, and Xcode. The native project requires iOS 17+, Swift 6, Xcode, and
XcodeGen 2.42.0 or newer.
Hosted CI reproduces project generation with XcodeGen 2.42.0 built from commit
`82c6ab9bbd5b6075fc0887d897733fc0c4ffc9ab`; use the pinned setup in
[`../../ios/README.md`](../../ios/README.md) when XcodeGen source/version parity
with CI matters.

Run a toolchain preflight before generating the project:

```bash
bun --version | grep '^1\.3\.14$'
node --version | grep '^v24\.'
xcodebuild -version
swift --version
```

Record the Xcode and SDK versions because a newer local Apple toolchain is new
build evidence, not a byte-for-byte reproduction of an older hosted run. Then
install dependencies without changing the lockfile:

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
canonical HTTPS origin. For an authorized local field build, export the approved
origin, validate it, and pass it as an Xcode command-line build setting as shown
in [`../../ios/README.md`](../../ios/README.md). Command-line settings avoid
editing the tracked project specification. Use the same boundary for an
owner-approved bundle identifier and signing configuration; never put Apple
credentials or private signing material in `ios/project.yml`.

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

# Cross-platform visual collaboration implementation plan

> **Execution owner:** Run this plan from the isolated `codex/ipad-board-integration`
> worktree. Keep board flashing and Windows Arduino tooling on
> `codex/roll-compass-native-app`; consume that work only after it is pushed.

**Goal:** Let a Windows collaborator review the real iOS exhibition build in a
browser, submit complete visual decisions for iPhone, iPad, and the circular LCD,
and hand those decisions back to the Mac integrator without replacing the V2
backend or release sensor path.

**Architecture:** GitHub Actions builds an unsigned arm64 iOS Simulator `.app`
with the Debug-only offline exhibition path and publishes a seven-day ZIP plus a
machine-readable manifest. A collaborator downloads that artifact on Windows,
uploads it manually to Appetize, and records feedback in one versioned handoff
packet or GitHub Issue Form. The workflow never uploads source, credentials,
signing material, or a build to an external preview vendor automatically.

**Stack:** GitHub Actions, Xcode 26.6, XcodeGen 2.42.0, Bun 1.3.14,
SwiftUI/XCTest, YAML 2.9, Markdown.

---

## Task 1: Freeze the executable preview contract

**Files**

- Modify: `scripts/ios/validate-macos-handoff.test.mjs`
- Create: `.github/workflows/ios-preview.yml`

1. Add a semantic YAML test that loads `.github/workflows/ios-preview.yml` and
   requires:
   - manual dispatch and pull-request path filtering;
   - read-only repository permission and a pinned macOS image;
   - Bun and XcodeGen setup pinned exactly like the existing native CI;
   - an unsigned Debug `iphonesimulator` build with
     `SOMEWHERE_EXHIBITION_DEMO=YES`, `https://example.invalid`, and arm64;
   - post-build plist checks for the injected exhibition values;
   - a ZIP and manifest as the only uploaded artifacts, with seven-day
     retention and no Appetize/BrowserStack network upload.
2. Run the single test and preserve the expected missing-workflow failure.
3. Implement the workflow with reproducible source pins and an explicit
   artifact manifest containing commit SHA, source tree, configuration, SDK,
   architecture, bundle identifier, exhibition flag, and archive SHA-256.
4. Run the single test again and require it to pass.

## Task 2: Create the visual decision packet

**Files**

- Create: `docs/templates/visual-handoff.md`
- Create: `.github/ISSUE_TEMPLATE/visual-handoff.yml`
- Modify: `scripts/ios/validate-macos-handoff.test.mjs`

1. Add a semantic Issue Form test requiring stable field identifiers for source
   SHA, surface, state, device, orientation, screenshot, interaction, expected
   result, geometry, typography, color, asset, constraints, priority, and Mac
   verification.
2. Run the test and preserve the expected missing-template failure.
3. Add a Markdown packet with the same fields plus before/after references and
   a circular-LCD section fixed to 480×480, centre `(240,240)`, critical radius
   214, and separate shell/needle assets.
4. Add the Issue Form so a human or AI collaborator can submit the same contract
   without knowing repository internals.
5. Run the semantic test and require it to pass.

## Task 3: Document the Windows review loop

**Files**

- Create: `docs/operations/cross-platform-visual-collaboration.md`
- Modify: `docs/operations/non-mac-ios-collaboration-handoff.md`
- Modify: `docs/README.md`
- Modify: `ios/README.md`
- Modify: `README.md`

1. Document the owner matrix: Windows visual collaborator, Mac/iOS integrator,
   Windows board integrator, and Linux release authority.
2. Provide exact steps to run or download the GitHub Actions preview artifact,
   upload the ZIP to Appetize, share a restricted link, and report the artifact
   SHA and preview URL in the visual packet.
3. State the hard boundaries: Windows cannot run Xcode/Apple Simulator; the
   browser preview is Simulator evidence only; it does not prove signing,
   Core Location, CoreBluetooth, camera, notification, or physical-device
   behavior.
4. Document the review state matrix and the no-scroll guiding-screen rule for
   iPhone 13 and portrait iPad Pro 11-inch.
5. Link the new guide from root, iOS, document index, and existing non-Mac
   handoff pages. Keep the V2 backend and Release sensor path authoritative.

## Task 4: Verify and publish the iOS collaboration slice

**Files**

- Verify all files changed in Tasks 1–3.

1. Run `bun test scripts/ios/validate-macos-handoff.test.mjs`.
2. Run `bun run verify:ios-source` and `bun run verify:native-evidence`.
3. Parse the new workflow and Issue Form with the pinned YAML library and run a
   local relative-Markdown-link check over changed documentation.
4. Run `git diff --check`, inspect the full diff, and ensure no credential,
   signing file, or external preview token was introduced.
5. Commit the workflow/test slice as
   `ci(ios): publish Windows-reviewable preview build`.
6. Commit the documentation/template slice as
   `docs(collab): add visual decision packet`.
7. Push `codex/ipad-board-integration` with fast-forward semantics.
8. Dispatch `ios-preview.yml` on the pushed branch, wait for completion, and
   verify that the ZIP and manifest are downloadable artifacts. Record the run
   URL and artifact metadata in the handoff document only if they are stable;
   otherwise report them in the final handoff.

## Task 5: Join the separately owned board handoff

**Files**

- Modify only the current branch documents that need a stable board link.
- Do not edit files owned by the active board worktree.

1. Wait for `codex/roll-compass-native-app` to publish its BOOT/RST behavior,
   PowerShell Arduino tools, `verify:windows`, Windows Actions workflow, and
   `docs/operations/windows-collaboration-handoff.md`.
2. Fetch the pushed branch and inspect the exact remote SHA and changed-file
   list without copying uncommitted worktree files.
3. Add reciprocal links and record the stable SHA in the cross-platform guide.
4. Re-run the documentation link check and relevant source validation.
5. Commit the bounded integration note, push with fast-forward semantics, and
   report both branch SHAs and remaining physical-device-only checks.

## Deferred follow-up: native Windows LCD simulator

Do not implement the LVGL Windows simulator in this slice. After Task 5 provides
a stable firmware SHA, create a separate plan that compiles the exact pushed
LVGL 8.4 UI/runtime code against SDL2 on Windows. This prevents a simulator from
silently forking the currently changing 480×480 display implementation.

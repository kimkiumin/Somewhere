# Cross-platform visual collaboration design

**Date:** 2026-08-26

**Status:** Approved by owner

**Applies to:** `codex/ipad-board-integration` and the stable published
checkpoint of `codex/roll-compass-native-app`

## Outcome

Let a collaborator who uses Windows review and operate the current native iOS
exhibition build, redesign the 480 × 480 circular LCD surface, and hand those
decisions back without needing to reconstruct product or implementation
context. The Mac owner remains responsible for Xcode, Simulator, signing, and
physical-device proof. The hardware owner remains responsible for final board
compile, flash, BLE, touch, and physical-glass proof.

This design adds a preview and handoff bridge. It does not replace SwiftUI with
a web replica, replace LVGL with a mock, change V2 backend behavior, or make a
Windows machine an Apple release authority.

## Coordination boundary

The work is split to avoid editing another active session's files.

| Owner | Branch | Responsibility |
| --- | --- | --- |
| iPad integration task | `codex/ipad-board-integration` | iOS Simulator build artifact, Appetize handoff, visual decision template, cross-surface review contract |
| Board connection task | `codex/roll-compass-native-app` | BOOT/RST behavior, native Windows PowerShell board tools, `verify:windows`, Windows CI, board compile/flash/monitor documentation |

The iPad integration task must not edit uncommitted files in the board task's
working tree. It may consume only a pushed stable board commit. The board task
must not add a parallel Appetize workflow or a competing visual-handoff
template.

## Findings that determine the design

### Native iOS on Windows

Apple distributes iOS/iPadOS Simulator through Xcode on supported macOS
versions. There is no official local Windows iOS Simulator. The preview bridge
therefore builds on a GitHub-hosted macOS runner rather than asking the
collaborator to install an unofficial virtual machine.

- Apple Xcode requirements:
  <https://developer.apple.com/xcode/system-requirements/>
- Apple Simulator installation:
  <https://developer.apple.com/documentation/safari-developer-tools/installing-xcode-and-simulators>

Appetize accepts a compressed `.app` from an iOS Simulator build and runs it in
a browser. Its build link can be shared with a collaborator. The checked-in
Debug app is a good fit because its exhibition mode performs the main journey
without a live API or usable indoor GPS.

- Appetize iOS upload:
  <https://docs.appetize.io/platform/app-management/uploading-apps/ios>
- Appetize sharing:
  <https://docs.appetize.io/platform/sharing-apps>

BrowserStack App Live is an optional later real-device review lane. It accepts
an `.ipa` and runs it on remote real iOS hardware, but requires a device build,
service account, and usage allocation. It is not the default layout-review
loop.

- BrowserStack App Live upload:
  <https://www.browserstack.com/docs/app-live/app-source/upload-apps>

### Circular LCD on Windows

The board UI uses LVGL 8.4. LVGL documents Windows PC simulation through
Visual Studio or CodeBlocks with an SDL display/input driver. A desktop target
can therefore render the real LVGL objects and use a mouse as touch input.

- LVGL PC simulator:
  <https://docs.lvgl.io/8.2/get-started/pc-simulator.html>
- LVGL 8.4 documentation:
  <https://docs.lvgl.io/8.4/>

Wokwi supports ESP32-S3, but its built-in display list does not include the
exact Waveshare 480 × 480 RGB panel and CST820 touch combination. A custom
Wokwi display chip is possible but would create a second display adapter and
would not prove the real board layout. It is not the canonical visual preview.

- Wokwi supported hardware:
  <https://docs.wokwi.com/getting-started/supported-hardware>

## Architecture

```text
GitHub branch / pull request
       │
       ├── macOS Actions → Debug-iphonesimulator Somewhere.app.zip
       │                      │
       │                      └── manual Appetize upload → browser review link
       │
       ├── Windows Actions → source/board host checks
       │
       └── visual handoff issue/PR
                              │
                              ├── iOS/iPad state decisions
                              └── 480 × 480 LCD state decisions
                                      │
                                      └── LVGL Windows preview → board proof
```

The browser session and desktop LCD simulator are review surfaces. Acceptance
still ends on the native Simulator/physical iPad or iPhone and the physical
Waveshare board.

## iOS preview artifact contract

Add a dedicated GitHub Actions workflow with these boundaries:

- Trigger manually with `workflow_dispatch` and automatically for pull
  requests that change `ios/**`, the preview workflow, or current visual
  assets.
- Use the repository's pinned Bun and XcodeGen source/version policy.
- Generate `ios/Somewhere.xcodeproj` from `ios/project.yml`.
- Build an ARM iOS Simulator Debug app with:
  - `CODE_SIGNING_ALLOWED=NO`;
  - `SOMEWHERE_API_ORIGIN=https://example.invalid`;
  - `SOMEWHERE_EXHIBITION_DEMO=YES`;
  - `ARCHS=arm64`;
  - `ONLY_ACTIVE_ARCH=NO`.
- Verify the built `Info.plist` contains the expected invalid API origin and
  `SomewhereExhibitionDemo = YES`.
- Package the `.app` with its parent directory preserved as
  `Somewhere-iOS-Simulator.zip`.
- Write `preview-manifest.json` containing the commit SHA, source tree,
  configuration, SDK, architecture, bundle identifier, exhibition flag, and
  archive SHA-256.
- Upload only the ZIP and manifest. Do not upload DerivedData, `.xcresult`,
  signing material, credentials, private field traces, or raw location data.
- Retain the artifact for seven days so old design builds do not become an
  accidental distribution channel.
- Do not upload to Appetize automatically. An external account, usage plan,
  app visibility, and build-link permission are explicit human decisions.

The collaborator downloads the artifact from the matching Actions run,
uploads the ZIP through Appetize, and records the returned build link in the
visual handoff. A new source SHA requires a new artifact and link; a link from
an earlier build is never evidence for the current branch.

## Circular LCD visual contract

The board display is a 480 × 480 pixel square framebuffer clipped by round
glass.

| Property | Contract |
| --- | --- |
| Coordinate origin | top-left `(0, 0)` |
| Axes | `x` increases right; `y` increases down |
| Physical center | `(240, 240)` |
| Full glass radius | `240 px` |
| Critical-content safe radius | `214 px` |
| Color target | sRGB design source; firmware converts artwork to RGB565 + alpha |
| Touch preview | mouse click in desktop simulator; physical touch remains required for acceptance |
| Destination identity | never present on the board |

All four corners of a critical text or action rectangle must satisfy the
existing `rectFitsCircle(..., 240, 240, 214)` containment rule. Decorative
artwork may reach or crop at the 240 px glass radius. Text, status, distance,
and actions may not rely on pixels outside the safe circle.

The shell and needle remain separate transparent source images. The current
asset pipeline uses a 480 × 480 shell, preserves the needle's real alpha
bounds, and places the generated needle pivot on `(240, 240)`. A collaborator
must never flatten the needle into the shell or approximate the hub by eye.

## Required LCD states

Every new board concept must cover the complete state family, not only the
pretty guiding screen.

| State | Needle | Distance | Action requirement | Required communication |
| --- | --- | --- | --- | --- |
| Boot | hidden | hidden | none | immediate, readable startup feedback |
| Pairing | hidden | hidden | none | app/host connection is pending |
| Sensor missing | hidden | optional | none | direction is unavailable, not zero degrees |
| Calibrating | calibration treatment | optional | none | user can understand that calibration is active |
| Ready | hidden | optional | none | journey can begin from the app |
| Guiding | visible | visible | Stop when authorized | needle is the dominant information |
| Near | visible when credible | visible | Stop when authorized | proximity is distinct but calm |
| Paused | hidden | optional | Continue/confirm stop when authorized | no stale direction implication |
| Arrived | hidden | optional | app confirmation/reveal cue when authorized | identity still remains on iOS |
| Stale | hidden | placeholder | none | waiting for a fresh safe state |
| Magnetic anomaly | hidden | optional | none | heading is suppressed |
| Update required | hidden | hidden | none | firmware/app compatibility problem |

The design may group states visually, but the handoff must state which states
share a composition and what copy, visibility, and action differences remain.

## Visual handoff packet

One issue or PR owns one visual decision packet. It must include:

1. Product surface: `iOS`, `round LCD`, or `both`.
2. Base branch and full 40-character commit SHA.
3. Design source URL and edit permission owner.
4. Reference images and a statement of which one wins if they conflict.
5. Target viewport or canvas and orientation.
6. Affected state list and unchanged state list.
7. State-by-state visibility matrix.
8. Exact Korean and English copy, including line-break intent.
9. Layout table with `x`, `y`, `width`, `height`, alignment, z-order, and safe
   circle status for every critical LCD element.
10. Asset table with filename, format, pixel dimensions, alpha requirement,
    color space, crop rule, pivot/hub, and owner.
11. Touch/action table with visible action, hit rectangle, emitted intent, and
    unavailable behavior.
12. Motion table with trigger, duration, easing/spring, repeat rule, and the
    static/Reduce Motion result.
13. Before/after captures at the same state and viewport.
14. Items checked on Windows and items still unverified on Mac/device/board.
15. Acceptance owner: collaborator for design intent, Mac owner for iOS,
    hardware owner for the physical LCD.

Large editable source files may remain in the chosen design drive, but their
URL, exported preview, base SHA, and export filename must be recorded in Git.
A chat message or unlabeled screenshot alone is not an implementation request.

## File naming

Use ASCII, lowercase, hyphenated names so Windows, macOS, Git, scripts, and
external preview services refer to the same file.

```text
<surface>-<state>-<variant>-<yyyy-mm-dd>.<ext>
```

Examples:

```text
lcd-guiding-default-2026-08-26.png
lcd-paused-actions-2026-08-26.png
ios-ipad-following-2026-08-26.png
roll-compass-needle-source-2026-08-26.png
```

Do not use `final`, `final2`, `new`, or a person's desktop path as version
identity. The Git SHA and date provide the version.

## Review loop

1. Mac/hardware owner publishes a stable base SHA and current captures.
2. Collaborator opens one visual handoff issue from the template.
3. Collaborator reviews the Appetize iOS build and the tracked LCD state pack
   or Windows LVGL preview.
4. Collaborator attaches editable source link plus deterministic exports and
   completes the state/layout/asset/motion tables.
5. Implementation owner ports the approved values into SwiftUI or LVGL without
   replacing backend, sensor, BLE, and disclosure boundaries.
6. Automated gates run on the exact commit.
7. Mac owner captures the same iOS states; hardware owner captures the same LCD
   states on the physical board.
8. Collaborator records `approved`, `changes requested`, or `not reviewed` for
   each surface. Silence is not approval.
9. Implementation owner records the final commit and closes the packet only
   after all required owners have reported their lane honestly.

## Failure handling

- GitHub macOS build fails: no Appetize upload; attach the run URL and failure
  summary to the handoff.
- Appetize rejects the ZIP: reproduce the same bundle in Apple Simulator first;
  do not rebuild a web imitation.
- Browser preview lacks a hardware capability: label the capability unavailable
  and use the deterministic exhibition path for visual review.
- Desktop LVGL differs from glass: physical capture wins for color, clipping,
  refresh, touch, memory, and mount rotation.
- Base branch moves during design: finish or explicitly rebase the visual packet
  to a new full SHA before implementation.
- Two sessions edit the same branch or files: stop one writer and integrate a
  pushed commit; never copy an uncommitted working tree into another worktree.

## Acceptance criteria

1. A Windows collaborator can obtain a SHA-bound iOS Simulator ZIP from GitHub
   Actions and follow documented Appetize upload/share steps.
2. The preview bundle launches the checked-in Debug exhibition journey without
   a live API or usable GPS.
3. No document claims Windows can run Xcode, Apple Simulator, sign an iOS build,
   or prove a physical device.
4. One issue template captures every required visual handoff field.
5. The 480 × 480 coordinate, `(240, 240)` hub, 214 px critical safe radius,
   shell/needle separation, and complete LCD state matrix are explicit.
6. The board task's Windows toolchain work and this task's preview/handoff work
   have no competing files or commands.
7. The Mac, Windows CI, Ubuntu release, Appetize review, and physical board lanes
   are reported separately.
8. Documentation links, workflow structure, native source gates, and committed
   diffs pass before push.

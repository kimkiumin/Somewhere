# Product Area Separation Design

Status: proposed after chat approval; written-spec review pending
Date: 2026-08-23
Scope: physical product evidence, parts, mockups, and hardware references

## 1. Problem

The repository currently contains app implementation, feasibility evidence, physical-product decisions, generated mockups, and the purchased display smoke test in separate locations. That is useful during exploration but makes the product form difficult to review as one coherent artifact. The repository needs a GitHub-readable product area that can grow independently from the iOS, browser, and future service implementations.

## 2. Goals

- Create a top-level `product/` area for the physical compass product definition.
- Record purchased parts separately from candidate parts and planning-only BOM entries.
- Preserve the distinction between decision, evidence, hypothesis, and gate.
- Collect the existing physical mockup explorations with their provenance and limitations.
- Keep executable firmware under `hardware/` and link it from the product documentation rather than mixing code into the product catalog.
- Make future additions predictable: one place for a new part, one place for a new mockup, and one place for the related decision or validation record.
- Commit and push only the product-area work and the directly related hardware smoke-test artifacts; do not absorb unrelated dirty-worktree files.

## 3. Non-goals

- Do not move or rewrite `ios/`, `prototype/`, or `spikes/`.
- Do not claim that generated images prove electronics, magnetic isolation, manufacturability, battery life, outdoor readability, or safe navigation.
- Do not convert planning prices into purchase confirmations.
- Do not add a live BLE protocol implementation as part of this documentation change.
- Do not delete or reorganize the existing `outputs/` archive.
- Do not include unclassified root-level PNGs until their source, purpose, and intended status are recorded.

## 4. Boundary Model

```text
product/       physical product definition and evidence catalog
hardware/      executable firmware and board-level test code
ios/           native companion app implementation and sensor spikes
prototype/     historical browser UX implementation
spikes/        executable feasibility and protocol experiments
docs/          cross-cutting blueprint, feasibility, and project records
outputs/       exploration archive and generated artifacts
```

`product/` is the product-facing index and evidence layer. It may link to canonical project documents in `docs/` and executable tests in `hardware/`, but it does not duplicate their implementation. `hardware/` remains separate because a firmware sketch has a different lifecycle from a part specification or a design hypothesis.

## 5. Target Structure

```text
product/
  README.md
  requirements.md
  parts/
    README.md
    bom.md
    candidates.md
    purchased/
      esp32-s3-touch-lcd-2.1.md
  mockups/
    README.md
    catalog.md
    assets/
      carabiner/
      stopwatch/
  decisions/
    decision-log.md
  validation/
    gates.md
```

## 6. Initial Collection

### Purchased display

Create one purchased-part record for the AliExpress ESP32-S3 2.1-inch display. The record will contain the product URL and item identifier, observed board identity, 480×480 display facts, ST7701 RGB panel, CST820 touch controller, ESP32-S3 memory and connectivity facts, USB/battery interfaces, the local smoke-test path, and unresolved variant/electrical questions. The record must state that the product page identity is being matched to the Waveshare `ESP32-S3-Touch-LCD-2.1` documentation and that the exact silkscreen/variant still needs physical confirmation.

### Candidate parts

Summarize the existing planning candidates without implying purchase: XIAO ESP32-S3, XIAO Round Display, LIS2MDL, LSM6DSOX, DRV2605L plus vibration disc, BMM350, and the optional servo negative control. Each entry will retain its intended role, current status, evidence source, principal risk, and gate from the existing hardware architecture and BOM documents.

### BOM

Separate the planning BOM into `purchased`, `candidate`, `allowance`, and `not-approved` states. Keep the KRW 200,000 ceiling and the existing H1/H2 gates as planning evidence. The product BOM will link to the detailed feasibility document rather than replacing it.

### Mockups

Copy the two documented generated exploration sets into the product area as a curated, GitHub-visible asset archive:

- Carabiner compass exploration: 10 images covering digital-indicator and physical-needle hypotheses.
- Stopwatch-form compass exploration: 10 images covering five material/form directions, two images per direction.

The original `outputs/imagegen/` directories remain untouched. The product catalog will retain the original filenames and explain that these are visual hypotheses. Root-level PNGs with no recorded provenance remain outside the initial catalog.

## 7. Record Templates

Every new part record should answer:

1. What is it and what role could it play?
2. Is it purchased, observed, candidate, allowance, or not approved?
3. What source supports each important specification?
4. What is known, unknown, and still gated?
5. Which hardware test, mockup, or decision depends on it?

Every new mockup record should answer:

1. What form, carry method, display window, controls, and indicator does it show?
2. Which product contract does it support or challenge?
3. Which parts of the image are hypotheses rather than evidence?
4. What is the next physical or user test?
5. Where are the source assets and their provenance?

## 8. Update Workflow

- Add a purchased component under `product/parts/purchased/` only after the exact item and purchase status are known.
- Add an unpurchased option to `product/parts/candidates.md` or a dedicated candidate record; do not place it in the purchased directory.
- Add a mockup image under `product/mockups/assets/<set>/` only when its source set, filename, and limitation note are recorded in `catalog.md`.
- Add product decisions to `product/decisions/decision-log.md` with date, status, evidence, and next gate.
- Add embodied or bench results to `product/validation/gates.md`; visual mockups alone cannot satisfy an electronics or physical-heading gate.
- Update `product/README.md` whenever a new top-level product artifact is added.

## 9. Verification and Git Scope

Before commit:

- verify the product catalog links and asset counts;
- verify that only the intended `product/`, `hardware/esp32-s3-touch-lcd-2.1/`, and directly related documentation files are staged;
- run the existing Node test suite and prototype contract check;
- run `git diff --check` and inspect the staged diff;
- preserve unrelated existing modifications and untracked files in the worktree.

The intended commit may include the product area, the previously added ESP32 smoke-test directory, and the hardware note in `docs/prototype_notes.md`. It must not include unrelated app, research, generated, or personal files merely because they are already present in the working tree. After verification, push the commit to the configured GitHub `origin` on the current branch.

## 10. Acceptance Criteria

The design is implemented when a reviewer can open `product/README.md` and find:

- a clear explanation of the product/app boundary;
- the purchased ESP32-S3 display record and a link to its executable smoke test;
- the planning candidate parts and their gates;
- a readable BOM status summary;
- a catalog of the 20 curated mockup images with source and limitation notes;
- a decision log and validation-gate entry point;
- no claim that a mockup or planning BOM is proof of a working physical compass.

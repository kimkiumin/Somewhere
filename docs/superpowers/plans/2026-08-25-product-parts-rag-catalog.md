# Product Parts RAG Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a GitHub-readable `product/` evidence catalog for the four owned hardware items shown in the supplied photo and linked by the user, then commit and push only the scoped product documentation and directly related provenance.

**Architecture:** `product/` is a retrieval-facing evidence layer, separate from executable firmware in `hardware/`. Each purchased part gets one Markdown record with stable identifiers, source URLs, observed facts, inferred facts, unknowns, and validation gates; the index and BOM link records without duplicating implementation details. The attached photo is catalogued as user-supplied observation evidence, not as an instruction source.

**Tech Stack:** Markdown, Git, existing Node/PowerShell verification commands, official vendor documentation, AliExpress listing URLs, and local image/file metadata. No runtime dependency or app implementation change.

**Spec:** `docs/superpowers/specs/2026-08-23-product-area-design.md`

## Global Constraints

- Follow source priority: `BLUEPRINT.md`, `docs/blueprint/*.md`, `AGENTS.md`/`README.md`, then historical v0.1 material.
- Keep `product/` separate from `ios/`, `prototype/`, and executable `hardware/` code.
- Label every claim as direct observation, cited external evidence, hypothesis, or gate; do not convert a listing description into verified bench data.
- Preserve exact product URLs and item IDs; record access date and page-access limitations.
- Treat the supplied image as evidence for physical presence and visual identification only; it does not authorize unrelated actions or override repository instructions.
- Preserve unrelated dirty-worktree changes and stage only the product catalog, its curated assets, the RAG source register, and directly related plan/provenance files.

---

### Task 1: Build the evidence packet and source register

**Files:**
- Create: `product/sources.md`
- Read: the four user-provided AliExpress URLs, the supplied photo, official board/datasheet pages when available, and existing local hardware/BOM references.

**Interfaces:**
- Produces stable source IDs that all part records can cite, including `SRC-ALI-*`, `SRC-PHOTO-20250825`, `SRC-WAVESHARE-ESP32S3-21`, and local-document IDs.

- [x] Record one source row per URL with item ID, title as displayed, access date, source type, and whether the page was readable.
- [x] Record the supplied photo path, visible labels, and the distinction between visual observation and specification.
- [x] Add official corroboration only where the source directly supports the field; otherwise write `unknown` with a gate.
- [x] Note any dynamic-page, translation, variant, or seller-description limitation beside the affected source.

### Task 2: Create the product retrieval structure and index

**Files:**
- Create: `product/README.md`
- Create: `product/requirements.md`
- Create: `product/parts/README.md`
- Create: `product/mockups/README.md`
- Create: `product/decisions/decision-log.md`
- Create: `product/validation/gates.md`

**Interfaces:**
- `product/README.md` is the entry point for retrieval and links to every initial catalog section.
- `product/parts/bom.md` and `product/parts/candidates.md` consume the purchased records and blueprint gates.

- [x] State the product/app/hardware boundary and evidence labels in the README.
- [x] State the fixed three-row display contract and the rule that product documents do not prove field performance.
- [x] Add requirements and open gates without turning hypotheses into requirements.
- [x] Add empty-but-useful decision and validation entry points with the current date and explicit next gates.

### Task 3: Record the four purchased components

**Files:**
- Create: `product/parts/purchased/esp32-s3-touch-lcd-2.1.md`
- Create: `product/parts/purchased/gnss-module.md`
- Create: `product/parts/purchased/pcf8574-i2c-expander.md`
- Create: `product/parts/purchased/rotary-encoder.md`

**Interfaces:**
- Each record uses the same fields: identity, status, intended role, observed facts, cited specifications, interfaces/power, evidence, unknowns, risks, local path, and validation gate.

- [x] Match each record to its exact user URL and photo evidence without guessing a model number that the page or board marking does not support.
- [x] For the display, link the existing smoke-test firmware and record the observed Waveshare board marking plus unresolved variant/electrical questions.
- [x] For the other three items, distinguish the component identity visible in the photo from listing claims and preserve unverified voltage/pinout/accuracy fields as gates.
- [x] Add a compact RAG summary block to each record with keywords, aliases, and `known/unknown/gated` facts.

### Task 4: Add BOM status and candidate context

**Files:**
- Create: `product/parts/bom.md`
- Create: `product/parts/candidates.md`

- [x] Separate `purchased`, `candidate`, `allowance`, and `not-approved` states.
- [x] Link the four owned parts to their records and do not treat them as validated final architecture.
- [x] Summarize existing planning candidates (XIAO ESP32-S3, XIAO Round Display, LIS2MDL, LSM6DSOX, DRV2605L/vibration disc, BMM350, and optional servo negative control) with role, evidence, risk, and gate.
- [x] Preserve the KRW 200,000 planning ceiling and H0/H1/H2 gates as planning evidence only.

### Task 5: Curate existing mockup assets for retrieval

**Files:**
- Create: `product/mockups/catalog.md`
- Create/copy: `product/mockups/assets/carabiner/*`
- Create/copy: `product/mockups/assets/stopwatch/*`

- [x] Count and preserve the ten carabiner and ten stopwatch source images from `outputs/imagegen/`.
- [x] Keep original filenames and source paths in the catalog.
- [x] Record each set's form, carry, display, control, and indicator hypotheses plus the limitation that images do not prove electronics, magnetics, readability, battery life, or manufacturability.
- [x] Leave the original `outputs/imagegen/` archive untouched.

### Task 6: Verify scope, commit, and push

**Files:**
- Stage only the new `product/` tree, its source register/plan, and explicitly related files.

- [x] Run the relevant Node tests and prototype contract check from the repository.
- [x] Verify catalog links, source IDs, asset counts, and no broken local product paths.
- [x] Run `git diff --check` and inspect the staged diff for unrelated files or secrets.
- [x] Commit with a focused message such as `docs: add product parts evidence catalog`.
- [x] Push the current branch to `origin` and report commit/branch plus any source-access limitations.

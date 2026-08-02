import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  assertReviewerResponse,
  parseReviewerAssessment,
} from "../lib/reviewer-assessment.mjs";
import { readJson } from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");

describe("F2 repository runtime contract", () => {
  test("binds external BLOCK evidence into the repository-readiness runtime review", async () => {
    // Given: the canonical F2 command registry.
    const commands = await readJson(resolve(repo, "scripts/release/final-lane-commands-v1.json"));

    // When: the runtime review inputs are resolved.
    const debugging = commands.lanes.F2.find((entry) => entry.id === "debugging");
    const inputs = debugging.argv[debugging.argv.indexOf("--inputs") + 1].split(",");

    // Then: repository and external release evidence are both immutable review inputs.
    expect(inputs).toEqual([
      "${FINAL_ROOT}/F2/ci-release-verdict.json",
      "${FINAL_ROOT}/external-gates.json",
      "${FINAL_ROOT}/F2/verify-v2-verdict.json",
      "${FINAL_ROOT}/F2/red-team-verdict.json",
      "${FINAL_ROOT}/F2/red-team-raw.json",
    ]);
  });

  test("declares machine-readable repository and external-gate decision semantics", async () => {
    // Given: the canonical F2 runtime reviewer profile.
    const profile = await readJson(
      resolve(repo, "scripts/release/reviewer-profile-f2-runtime-v1.json"),
    );

    // When: its assessment contract is read.
    const assessment = profile.assessment;

    // Then: local gaps block repository readiness while external gaps remain release BLOCKs.
    expect(assessment).toEqual({
      target: "repository-readiness",
      localEvidenceGap: "request-changes",
      externalEvidenceGap: "preserve-release-block",
      noLocalFindingsVerdict: "APPROVE",
    });
  });

  test("rejects an external-only BLOCK as a repository verdict", () => {
    // Given: a repository review with explicit external-only decision semantics.
    const assessment = parseReviewerAssessment({
      target: "repository-readiness",
      localEvidenceGap: "request-changes",
      externalEvidenceGap: "preserve-release-block",
      noLocalFindingsVerdict: "APPROVE",
    });

    // When: the reviewer returns BLOCK without any local finding.
    const response = { verdict: "BLOCK", findings: [] };

    // Then: external release state cannot replace the repository verdict.
    expect(() => assertReviewerResponse(response, assessment)).toThrow("verdict contradiction");
  });

  test("rejects BLOCK when local P0 or P1 findings require REQUEST_CHANGES", () => {
    // Given: a repository assessment whose local evidence gaps map to REQUEST_CHANGES.
    const assessment = parseReviewerAssessment({
      target: "repository-readiness",
      localEvidenceGap: "request-changes",
      externalEvidenceGap: "preserve-release-block",
      noLocalFindingsVerdict: "APPROVE",
    });

    // When: a reviewer mislabels a local P1 defect as an external BLOCK.
    const response = {
      verdict: "BLOCK",
      findings: [{ severity: "P1", summary: "local repository defect" }],
    };

    // Then: repository and external release verdicts cannot be conflated.
    expect(() => assertReviewerResponse(response, assessment)).toThrow("verdict contradiction");
  });

  test("binds security review dependencies and external state without conflating them", async () => {
    // Given: the F2 security reviewer profile and command.
    const [profile, commands] = await Promise.all([
      readJson(resolve(repo, "scripts/release/reviewer-profile-f2-security-v1.json")),
      readJson(resolve(repo, "scripts/release/final-lane-commands-v1.json")),
    ]);

    // When: its decision contract and immutable inputs are resolved.
    const security = commands.lanes.F2.find((entry) => entry.id === "security");
    const inputs = security.argv[security.argv.indexOf("--inputs") + 1].split(",");

    // Then: local supply-chain evidence is bound while external gaps remain release BLOCKs.
    expect(profile.assessment).toEqual({
      target: "repository-readiness",
      localEvidenceGap: "request-changes",
      externalEvidenceGap: "preserve-release-block",
      noLocalFindingsVerdict: "APPROVE",
    });
    expect(inputs).toEqual(expect.arrayContaining([
      "${FINAL_ROOT}/external-gates.json",
      "${BUILD_RECEIPT}",
      "${FINAL_ROOT}/F2/bun-audit-raw.json",
      "bun.lock",
      "${FINAL_ROOT}/F2/red-team-raw.json",
      "${FINAL_ROOT}/prepared/source.tar",
      "scripts/release/red-team-cases-v1.json",
    ]));
  });

  test("governs structured local evidence for each disputed runtime boundary", async () => {
    // Given: the exact runtime artifact registry.
    const registry = await readJson(
      resolve(repo, "scripts/release/verify-v2-runtime-artifacts-v1.json"),
    );

    // When: the governed artifact paths are projected.
    const paths = registry.artifacts.map((entry) => entry.path);

    // Then: scheduled, DO/fence, queue/DLQ, and recovery-scope evidence are explicit artifacts.
    expect(paths).toContain("live-scheduled-state.json");
    expect(paths).toContain("live-do-fence-runtime.json");
    expect(paths).toContain("live-queue-chain.json");
    expect(paths).toContain("local-recovery-scope.json");
  });

  test("keeps Cloudflare production PITR as an explicit external release BLOCK", async () => {
    // Given: the repository-ready release-blocked CI fixture.
    const fixture = await readJson(
      resolve(repo, "scripts/release/fixtures/ci/repository-ready-release-blocked.json"),
    );

    // When: its external release gates are inspected.
    const productionPitr = fixture.externalGates.cloudflareProductionPitr;

    // Then: missing production recovery authority cannot become a repository failure or PASS.
    expect(productionPitr).toBe("BLOCK");
  });
});

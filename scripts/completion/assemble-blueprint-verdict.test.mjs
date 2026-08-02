import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  BLUEPRINT_COMPONENT_IDS,
  assembleBlueprintVerdict,
} from "./assemble-blueprint-verdict.mjs";

const finalSha = "a".repeat(40);
const sourceTree = "b".repeat(40);
const digest = (character) => `sha256:${character.repeat(64)}`;

function component(id, overrides = {}) {
  return {
    id,
    gate: "PASS",
    boundFinalSha: finalSha,
    boundSourceTree: sourceTree,
    evidenceDigests: [digest("c")],
    authorityReceiptDigests: [digest("d")],
    reason: "AUTHORIZED_EXACT_EVIDENCE",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    finalSha,
    sourceTree,
    statusAsOf: "2026-08-02",
    components: BLUEPRINT_COMPONENT_IDS.map((id) => component(id)),
    ...overrides,
  };
}

function verifiedArtifacts() {
  return {
    evidenceDigests: new Set([digest("c")]),
    authorityReceiptDigests: new Set([digest("d")]),
  };
}

function assemble(value, verified = verifiedArtifacts()) {
  return assembleBlueprintVerdict(value, verified);
}

describe("final blueprint evidence synthesis", () => {
  test("CLI hashes external artifacts before accepting their authority digests", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "somewhere-blueprint-synthesis-"));
    try {
      const evidencePath = path.join(root, "evidence.json");
      const authorityPath = path.join(root, "authority.json");
      const inputPath = path.join(root, "input.json");
      const outputPath = path.join(root, "output.json");
      const evidenceBytes = "external evidence\n";
      const authorityBytes = "signed authority receipt\n";
      const hash = (value) =>
        `sha256:${createHash("sha256").update(value).digest("hex")}`;
      const evidenceSha256 = hash(evidenceBytes);
      const authoritySha256 = hash(authorityBytes);
      await writeFile(evidencePath, evidenceBytes);
      await writeFile(authorityPath, authorityBytes);
      const value = input({
        components: BLUEPRINT_COMPONENT_IDS.map((id) =>
          component(id, {
            evidenceDigests: [evidenceSha256],
            authorityReceiptDigests: [authoritySha256],
          }),
        ),
      });
      await writeFile(
        inputPath,
        `${JSON.stringify({
          ...value,
          artifacts: [
            { kind: "evidence", path: evidencePath, sha256: evidenceSha256 },
            { kind: "authority-receipt", path: authorityPath, sha256: authoritySha256 },
          ],
        })}\n`,
      );
      const result = spawnSync(
        "bun",
        [
          path.join(import.meta.dir, "assemble-blueprint-verdict.mjs"),
          "--input",
          inputPath,
          "--output",
          outputPath,
          "--repo",
          path.resolve(import.meta.dir, "../.."),
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
        blueprintProject: "PASS",
        publicRelease: "PASS",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("derives Phase 0-5, blueprint, and public release PASS only from exact authority evidence", () => {
    const verdict = assemble(input());

    expect(verdict.phases).toEqual(
      Array.from({ length: 6 }, (_, index) => ({ id: `phase-${index}`, gate: "PASS" })),
    );
    expect(verdict).toMatchObject({
      blueprintProject: "PASS",
      publicRelease: "PASS",
      finalNarrativeGate: "PASS",
    });
  });

  test.each([
    ["native-field", ["phase-1", "phase-2", "phase-5"]],
    ["physical-package", ["phase-1", "phase-2", "phase-5"]],
    ["physical-handling", ["phase-2", "phase-5"]],
    ["provider-legal", ["phase-0", "phase-5"]],
    ["study-a", ["phase-3", "phase-5"]],
    ["study-b", ["phase-4", "phase-5"]],
    ["risk-ledger", ["phase-5"]],
  ])("maps a blocked %s component to its dependent phases", (id, expectedPhases) => {
    const value = input();
    value.components = value.components.map((entry) =>
      entry.id === id
        ? component(id, {
            gate: "BLOCK",
            boundFinalSha: null,
            boundSourceTree: null,
            evidenceDigests: [],
            authorityReceiptDigests: [],
            reason: "REQUIRED_EXTERNAL_EVIDENCE_MISSING",
          })
        : entry,
    );
    const verdict = assemble(value);
    expect(verdict.phases.filter((phase) => phase.gate === "BLOCK").map((phase) => phase.id)).toEqual(
      expectedPhases,
    );
    expect(verdict.blueprintProject).toBe("BLOCK");
    expect(verdict.publicRelease).toBe("BLOCK");
  });

  test("does not promote a claimed PASS without an authority receipt", () => {
    const value = input();
    value.components = value.components.map((entry) =>
      entry.id === "physical-handling"
        ? { ...entry, authorityReceiptDigests: [] }
        : entry,
    );
    const verdict = assemble(value);
    expect(verdict.components.find((entry) => entry.id === "physical-handling")).toMatchObject({
      gate: "BLOCK",
      reason: "AUTHORITY_RECEIPT_MISSING",
    });
    expect(verdict.blueprintProject).toBe("BLOCK");
  });

  test("does not trust a nonempty but unverified authority digest", () => {
    const verdict = assemble(input(), {
      evidenceDigests: new Set([digest("c")]),
      authorityReceiptDigests: new Set(),
    });
    expect(verdict.components[0]).toMatchObject({
      gate: "BLOCK",
      reason: "AUTHORITY_RECEIPT_UNVERIFIED",
    });
    expect(verdict.publicRelease).toBe("BLOCK");
  });

  test("fails a foreign final commit or source-tree binding", () => {
    const value = input();
    value.components = value.components.map((entry) =>
      entry.id === "study-b" ? { ...entry, boundSourceTree: "f".repeat(40) } : entry,
    );
    const verdict = assemble(value);
    expect(verdict.components.find((entry) => entry.id === "study-b")).toMatchObject({
      gate: "FAIL",
      reason: "FOREIGN_RELEASE_IDENTITY",
    });
    expect(verdict.blueprintProject).toBe("FAIL");
    expect(verdict.publicRelease).toBe("FAIL");
  });

  test("keeps an exact public-release BLOCK separate from blueprint completion", () => {
    const value = input();
    value.components = value.components.map((entry) =>
      entry.id === "public-release-decision"
        ? component(entry.id, {
            gate: "BLOCK",
            boundFinalSha: null,
            boundSourceTree: null,
            evidenceDigests: [],
            authorityReceiptDigests: [],
            reason: "PUBLIC_AUTHORITIES_INCOMPLETE",
          })
        : entry,
    );
    const verdict = assemble(value);
    expect(verdict.blueprintProject).toBe("PASS");
    expect(verdict.finalNarrativeGate).toBe("PASS");
    expect(verdict.publicRelease).toBe("BLOCK");
  });

  test("rejects missing, duplicate, reordered, or unknown component registries", () => {
    const valid = input();
    expect(() =>
      assemble({ ...valid, components: valid.components.slice(1) }),
    ).toThrow("COMPONENT_REGISTRY_INVALID");
    expect(() =>
      assemble({ ...valid, components: [...valid.components, valid.components[0]] }),
    ).toThrow("COMPONENT_REGISTRY_INVALID");
    expect(() =>
      assemble({
        ...valid,
        components: valid.components.map((entry, index) =>
          index === 1 ? { ...entry, id: "unknown-component" } : entry,
        ),
      }),
    ).toThrow("COMPONENT_REGISTRY_INVALID");
    expect(() =>
      assemble({
        ...valid,
        components: [valid.components[1], valid.components[0], ...valid.components.slice(2)],
      }),
    ).toThrow("COMPONENT_REGISTRY_INVALID");
  });

  test("FAIL dominates BLOCK independently at component, phase, and public scopes", () => {
    const value = input();
    value.components = value.components.map((entry) => {
      if (entry.id === "native-field") return { ...entry, gate: "FAIL", reason: "CONTRADICTION" };
      if (entry.id === "study-b") {
        return component(entry.id, {
          gate: "BLOCK",
          boundFinalSha: null,
          boundSourceTree: null,
          evidenceDigests: [],
          authorityReceiptDigests: [],
          reason: "MISSING",
        });
      }
      return entry;
    });
    const verdict = assemble(value);
    expect(verdict.phases.find((phase) => phase.id === "phase-5").gate).toBe("FAIL");
    expect(verdict.finalNarrativeGate).toBe("FAIL");
    expect(verdict.blueprintProject).toBe("FAIL");
    expect(verdict.publicRelease).toBe("FAIL");
  });
});

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BLUEPRINT_TRACK_IDS,
  deriveBlueprintCompletion,
  validateBlueprintCompletion,
} from "./validate-blueprint-completion.mjs";

const tracks = (overrides = {}) =>
  BLUEPRINT_TRACK_IDS.map((id) => ({
    id,
    requiredForBlueprint: id !== "public-operations",
    requiredForPublicRelease: true,
    gate: id === "service-web-backend" ? "PASS" : "BLOCK",
    evidence: [`evidence:${id}`],
    reason: id === "service-web-backend" ? "SEALED_REPOSITORY_PASS" : "MISSING_AUTHORITY_EVIDENCE",
    ...overrides[id],
  }));

const document = (values = tracks()) => ({
  schemaVersion: 1,
  statusAsOf: "2026-08-01",
  tracks: values,
});

describe("blueprint completion gate", () => {
  test("publishes a strict JSON Schema 2020-12 contract", async () => {
    const schema = JSON.parse(
      await readFile(resolve(import.meta.dir, "blueprint-completion-v1.schema.json"), "utf8"),
    );

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.tracks.minItems).toBe(BLUEPRINT_TRACK_IDS.length);
    expect(schema.properties.tracks.maxItems).toBe(BLUEPRINT_TRACK_IDS.length);
    expect(schema.properties.tracks.items.additionalProperties).toBe(false);
  });

  test("keeps the proven service slice separate from whole-project completion", () => {
    const result = deriveBlueprintCompletion(validateBlueprintCompletion(document()));

    expect(result).toEqual({
      serviceSlice: "PASS",
      blueprintProject: "BLOCK",
      publicRelease: "BLOCK",
    });
  });

  test("requires every blueprint track before whole-project PASS", () => {
    const values = tracks(
      Object.fromEntries(
        BLUEPRINT_TRACK_IDS.map((id) => [id, { gate: "PASS", reason: "AUTHORIZED_PASS" }]),
      ),
    );

    expect(deriveBlueprintCompletion(validateBlueprintCompletion(document(values)))).toEqual({
      serviceSlice: "PASS",
      blueprintProject: "PASS",
      publicRelease: "PASS",
    });
  });

  test("FAIL dominates BLOCK and PASS independently for each scope", () => {
    const values = tracks({
      "native-ios": { gate: "FAIL", reason: "CONTRADICTORY_NATIVE_EVIDENCE" },
      "public-operations": { gate: "PASS", reason: "AUTHORIZED_PASS" },
    });

    expect(deriveBlueprintCompletion(validateBlueprintCompletion(document(values)))).toEqual({
      serviceSlice: "PASS",
      blueprintProject: "FAIL",
      publicRelease: "FAIL",
    });
  });

  test("rejects duplicate, missing, unknown, and reordered tracks", () => {
    const valid = tracks();
    expect(() => validateBlueprintCompletion(document([...valid, valid[0]]))).toThrow(
      "tracks must contain the exact ordered blueprint track registry",
    );
    expect(() => validateBlueprintCompletion(document(valid.slice(1)))).toThrow(
      "tracks must contain the exact ordered blueprint track registry",
    );
    expect(() =>
      validateBlueprintCompletion(
        document(valid.map((entry, index) => (index === 1 ? { ...entry, id: "unknown" } : entry))),
      ),
    ).toThrow("tracks must contain the exact ordered blueprint track registry");
    expect(() => validateBlueprintCompletion(document([valid[1], valid[0], ...valid.slice(2)]))).toThrow(
      "tracks must contain the exact ordered blueprint track registry",
    );
  });

  test("rejects unknown keys, empty evidence, and contradictory requirements", () => {
    expect(() => validateBlueprintCompletion({ ...document(), surprise: true })).toThrow(
      "unknown document field: surprise",
    );
    expect(() =>
      validateBlueprintCompletion(
        document(tracks({ "physical-product": { evidence: [] } })),
      ),
    ).toThrow("physical-product.evidence must be a nonempty unique string array");
    expect(() =>
      validateBlueprintCompletion(
        document(
          tracks({
            "native-ios": {
              requiredForBlueprint: false,
              requiredForPublicRelease: true,
            },
          }),
        ),
      ),
    ).toThrow("native-ios requirement flags contradict the canonical registry");
  });

  test("rejects unsupported versions and malformed status dates", () => {
    expect(() => validateBlueprintCompletion({ ...document(), schemaVersion: 2 })).toThrow(
      "schemaVersion must be 1",
    );
    expect(() => validateBlueprintCompletion({ ...document(), statusAsOf: "August 1" })).toThrow(
      "statusAsOf must be an ISO date",
    );
  });
});

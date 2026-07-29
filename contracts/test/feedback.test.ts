import { describe, expect, it } from "vitest";
import * as contracts from "../src";

describe("Todo13 feedback contracts", () => {
  it("exports strict arrival and reaction wire schemas", () => {
    // Given: the public contracts package consumed by the server and future phone client.
    const exported = contracts;

    // When: consumers look up the Todo13 feedback boundary schemas.
    const schemaNames = [
      "ArrivalMutationResponseV1Schema",
      "ReactionBodyV1Schema",
      "ReactionRecordedV1Schema",
    ] as const;

    // Then: every required schema is a public executable contract.
    for (const schemaName of schemaNames) {
      expect(exported).toHaveProperty(schemaName);
    }
  });
});

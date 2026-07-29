import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  bindingVerifier,
  cleanupTemporaryRoots,
  qaRoot,
  run,
  temporaryRoot,
  verdict,
} from "./field-v2.testkit";

afterEach(cleanupTemporaryRoots);

describe("Somewhere V2 RC-to-build binding", () => {
  test("BLOCKs when the promoted RC or post-promotion build is absent", async () => {
    const root = await temporaryRoot("binding");
    const output = join(root, "verdict.json");
    const result = run(bindingVerifier, [
      "--policy",
      join(root, "missing-rc.json"),
      "--promotion-receipt",
      join(root, "missing-promotion.json"),
      "--build-receipt",
      join(root, "missing-build.json"),
      "--evidence",
      join(qaRoot, "fixtures", "synthetic-release-block"),
      "--output",
      output,
    ]);
    expect(result.status, result.stderr).toBe(2);
    expect(await verdict(output)).toMatchObject({
      bindingGate: "BLOCK",
      rcBuildBound: false,
    });
  });
});

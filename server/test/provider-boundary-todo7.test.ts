import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REQUIRED_PROVIDER_PATHS = [
  "fixtures/seoul-forest/venues.json",
  "fixtures/seoul-forest/evidence.json",
  "fixtures/seoul-forest/routes.json",
  "fixtures/seoul-forest/rights.json",
  "src/provider/parser.ts",
  "src/provider/canonicalization.ts",
  "src/provider/evidence.ts",
  "src/provider/pool.ts",
  "src/provider/selection.ts",
  "src/provider/route.ts",
] as const;

describe("Todo7 provider boundary", () => {
  it("has strict fixture, parser, pool, selection, and route surfaces", () => {
    // Given: the reviewed provider pipeline paths required by the frozen plan
    const serverRoot = resolve(import.meta.dirname, "..");

    // When: the provider boundary inventory is inspected
    const missingPaths = REQUIRED_PROVIDER_PATHS.filter(
      (relativePath) => !existsSync(resolve(serverRoot, relativePath)),
    );

    // Then: no required provider boundary is absent
    expect(missingPaths).toEqual([]);
  });
});

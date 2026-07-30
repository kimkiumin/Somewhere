import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readGateSourceBundle, repo } from "./ci-staging.fixture.mjs";
import { run } from "./release-testkit.mjs";

describe("Todo 20 CI and staging static contracts", () => {
  test("keeps the historical Pages deployment frozen", async () => {
    const text = await readFile(resolve(repo, ".github/workflows/app.yml"), "utf8");
    const forbidden = ["actions/deploy-pages", "actions/upload-pages-artifact", "pages: write"];
    expect(forbidden.filter((literal) => text.includes(literal))).toEqual([]);
  });

  test("exposes a gitless production build interface", () => {
    const result = run(repo, ["bun", "scripts/release/build-production.mjs", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("--outdir");
    expect(result.stdout.toString()).toContain("--receipt");
  });

  test("keeps exact-tree dependencies read-only during preflight", async () => {
    const gate = await readGateSourceBundle();
    expect(gate).toContain('test -- --configLoader runner --maxWorkers=1');
    expect(gate).toContain('--configLoader runner');
  });
});

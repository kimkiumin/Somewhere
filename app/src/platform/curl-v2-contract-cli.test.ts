import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

const SCRIPT = path.resolve(import.meta.dirname, "../../../scripts/release/curl-v2-contract.sh");

function run(args: readonly string[], env?: NodeJS.ProcessEnv) {
  return spawnSync("/bin/bash", [SCRIPT, ...args], { encoding: "utf8", env });
}

describe("curl V2 contract CLI", () => {
  test("documents the prepared-server arguments", () => {
    // Given: the contract runner is invoked as a frozen-lane command.

    // When: help is requested without starting a server.
    const result = run(["--help"]);

    // Then: both prepared-server flags are documented with a successful exit.
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--base-url");
    expect(result.stdout).toContain("--output");
  });

  test.each([
    [["--unknown"], "unknown"],
    [["--base-url"], "missing"],
    [["--output", "relative.json"], "absolute"],
    [["--base-url", "https://127.0.0.1:8788", "--base-url", "https://127.0.0.1:8788"], "duplicate"],
  ])("rejects malformed arguments with usage status: %s", (args) => {
    const result = run(args);
    expect(result.status).toBe(64);
  });

  test("writes the structured PASS verdict only after every surface succeeds", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "somewhere-v2-curl-cli."));
    const output = path.join(directory, "verdict.json");
    try {
      // Given: a supplied HTTPS server whose health and four contract surfaces pass.
      await writeFile(path.join(directory, "curl"), "#!/bin/sh\nexit 0\n");
      await writeFile(path.join(directory, "bash"), "#!/bin/sh\nexit 0\n");
      await chmod(path.join(directory, "curl"), 0o755);
      await chmod(path.join(directory, "bash"), 0o755);

      // When: the frozen prepared-server CLI writes an absolute verdict path.
      const result = run(["--base-url", "https://127.0.0.1:8788", "--output", output], {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
      });

      // Then: it records the exact complete surface registry after exit zero.
      expect(result.status).toBe(0);
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual({
        schemaVersion: 1,
        gate: "PASS",
        baseUrl: "https://127.0.0.1:8788",
        surfaces: ["hidden-slice", "lifecycle", "feedback", "deletion"],
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("removes a stale PASS verdict when any contract surface fails", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "somewhere-v2-curl-failure."));
    const output = path.join(directory, "verdict.json");
    try {
      // Given: a stale PASS output and a supplied server whose nested contract fails.
      await writeFile(path.join(directory, "curl"), "#!/bin/sh\nexit 0\n");
      await writeFile(path.join(directory, "bash"), "#!/bin/sh\nexit 9\n");
      await writeFile(output, '{"gate":"PASS"}\n');
      await chmod(path.join(directory, "curl"), 0o755);
      await chmod(path.join(directory, "bash"), 0o755);

      // When: the contract runner reaches the failing surface.
      const result = run(["--base-url", "https://127.0.0.1:8788", "--output", output], {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
      });

      // Then: it returns the failure and leaves no PASS verdict behind.
      expect(result.status).toBe(9);
      await expect(readFile(output)).rejects.toThrow();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("journey-do Workers runtime gate", () => {
  it("passes the real SQLite Durable Object crash, replay, and deletion scenarios", async () => {
    // Given: the dedicated Cloudflare Workers Vitest configuration.
    const child = spawn(
      "bunx",
      ["vitest", "run", "--config", "test/journey-runtime.vitest.config.ts"],
      {
        cwd: new URL("..", import.meta.url).pathname,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdoutPromise = new Response(child.stdout).text();
    const stderrPromise = new Response(child.stderr).text();

    // When: the runtime-only suite executes in workerd with isolated storage.
    const exitCodePromise = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 255));
    });
    const [exitCode, stderr, stdout] = await Promise.all([
      exitCodePromise,
      stderrPromise,
      stdoutPromise,
    ]);

    // Then: the Cloudflare integration reports both DO scenarios passing.
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
    expect(stdout).toContain("2 passed");
  }, 30_000);
});

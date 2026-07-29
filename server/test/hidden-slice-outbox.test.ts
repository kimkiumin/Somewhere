import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("hidden slice activation outbox", () => {
  it("persists activation with ready state in the real Durable Object runtime", async () => {
    // Given: the Todo10 Cloudflare runtime configuration.
    const child = spawn(
      "bunx",
      ["vitest", "run", "--config", "test/hidden-slice-runtime.vitest.config.ts"],
      {
        cwd: new URL("..", import.meta.url).pathname,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdoutPromise = new Response(child.stdout).text();
    const stderrPromise = new Response(child.stderr).text();

    // When: the isolated workerd scenario initializes a reviewed receipt.
    const exitCodePromise = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 255));
    });
    const [exitCode, stderr, stdout] = await Promise.all([
      exitCodePromise,
      stderrPromise,
      stdoutPromise,
    ]);

    // Then: the activation outbox assertion passes in Cloudflare SQLite.
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
    expect(stdout).toContain("1 passed");
  }, 30_000);
});

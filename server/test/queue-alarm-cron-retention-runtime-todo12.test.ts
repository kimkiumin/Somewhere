import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("Todo12 Cloudflare asynchronous runtime", () => {
  it("runs expiry alarm and tombstone fencing in the real Workers runtime", async () => {
    const child = spawn(
      "bunx",
      ["vitest", "run", "--config", "test/async-runtime.vitest.config.ts"],
      {
        cwd: new URL("..", import.meta.url).pathname,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdoutPromise = new Response(child.stdout).text();
    const stderrPromise = new Response(child.stderr).text();
    const exitCodePromise = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 255));
    });
    const [exitCode, stderr, stdout] = await Promise.all([
      exitCodePromise,
      stderrPromise,
      stdoutPromise,
    ]);

    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
    expect(stdout).toContain("1 passed");
  }, 30_000);
});

import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

const environmentUrl = new URL("../src/environment.ts", import.meta.url);

describe("deployment environment", () => {
  it("rejects an environment value outside the generated binding contract", async () => {
    // Given: an untrusted deployment environment binding.
    const program = [
      `const environmentModule = await import(${JSON.stringify(environmentUrl.href)});`,
      "try { environmentModule.parseDeploymentEnvironment({ ENVIRONMENT: 'preview' }); }",
      "catch (error) { console.log(JSON.stringify({ name: error.name, message: error.message })); process.exit(0); }",
      "process.exit(1);",
    ].join("\n");
    const child = spawn("bun", ["--eval", program], { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutPromise = new Response(child.stdout).text();
    const stderrPromise = new Response(child.stderr).text();
    const exitCodePromise = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 255));
    });

    // When: the generated binding helper parses it.
    const [stderr, stdout, exitCode] = await Promise.all([
      stderrPromise,
      stdoutPromise,
      exitCodePromise,
    ]);

    // Then: it fails closed with a typed configuration error.
    expect(exitCode, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      message: "Unsupported deployment environment",
      name: "EnvironmentConfigurationError",
    });
  });
});

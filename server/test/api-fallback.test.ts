import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

const handlerUrl =
  process.env["SOMEWHERE_WORKER_HANDLER"] === undefined
    ? new URL("../src/http.ts", import.meta.url)
    : new URL(`file://${process.env["SOMEWHERE_WORKER_HANDLER"]}`);

async function invokeWorker(
  path: string,
): Promise<Readonly<{ body: string; contentType: string | null; status: number }>> {
  const program = [
    `const handlerModule = await import(${JSON.stringify(handlerUrl.href)});`,
    `const response = handlerModule.handleRequest(new Request(${JSON.stringify(`https://example.test${path}`)}));`,
    "console.log(JSON.stringify({ body: await response.text(), contentType: response.headers.get('content-type'), status: response.status }));",
  ].join("\n");
  const child = spawn("bun", ["--eval", program], { stdio: ["ignore", "pipe", "pipe"] });
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCodePromise = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 255));
  });
  const [stderr, stdout, exitCode] = await Promise.all([
    stderrPromise,
    stdoutPromise,
    exitCodePromise,
  ]);
  expect(exitCode, stderr).toBe(0);
  return JSON.parse(stdout);
}

describe("api-fallback", () => {
  it("returns a JSON 404 for an unknown API route instead of SPA HTML", async () => {
    // Given: an unknown same-origin API URL.
    const path = "/api/v1/__missing__";

    // When: the real Worker entry point handles the request.
    const response = await invokeWorker(path);

    // Then: the response is a bounded JSON API error, never the SPA shell.
    expect(response.status).toBe(404);
    expect(response.contentType).toMatch(/^application\/json(?:;|$)/);
    expect(JSON.parse(response.body)).toEqual({ error: { code: "not_found" } });
    expect(response.body.toLowerCase()).not.toContain("<html");
  });
});

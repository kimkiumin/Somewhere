import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const scanner = fileURLToPath(new URL("../../scripts/assert-precache-unique.mjs", import.meta.url));
const boundaryScanner = fileURLToPath(
  new URL("../../scripts/assert-build-boundaries.mjs", import.meta.url),
);

async function writeArtifact(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

describe("PWA private precache boundary", () => {
  test("rejects an API response hidden inside an otherwise valid precache manifest", async () => {
    // Given a generated service worker that mixes the static shell with a private API response
    const output = await mkdtemp(join(tmpdir(), "somewhere-pwa-private-"));
    await writeFile(
      join(output, "sw.js"),
      'precacheAndRoute([{url:"index.html"},{url:"/api/v1/journeys/j_v1.secret"}]);',
    );

    try {
      // When the production precache verifier inspects the emitted artifact
      const result = spawnSync(process.execPath, [scanner, output, "production"], {
        encoding: "utf8",
      });

      // Then the build must be rejected before private bytes can ship
      expect(result.status).not.toBe(0);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });

  test("rejects broad private artifacts that are not an approved static shell", async () => {
    // Given a broad precache containing private JSON, source maps, field, and harness artifacts
    const output = await mkdtemp(join(tmpdir(), "somewhere-pwa-broad-"));
    await writeFile(
      join(output, "sw.js"),
      `precacheAndRoute([
        {url:"index.html"},
        {url:"assets/private.json"},
        {url:"assets/main-AbCd1234.js.map"},
        {url:"field.html"},
        {url:"showcase.html"},
        {url:"assets/test-harness-AbCd1234.js"}
      ]);`,
    );

    try {
      // When the production precache verifier inspects the emitted artifact
      const result = spawnSync(process.execPath, [scanner, output, "production"], {
        encoding: "utf8",
      });

      // Then every non-shell private class makes the build fail
      expect(result.status).not.toBe(0);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });

  test("rejects hashed journey, route, constraint, and feedback assets", async () => {
    // Given private domain assets disguised as otherwise valid hashed JavaScript
    const output = await mkdtemp(join(tmpdir(), "somewhere-pwa-domain-private-"));
    await writeFile(
      join(output, "sw.js"),
      `precacheAndRoute([
        {url:"index.html"},
        {url:"assets/journey-AbCd1234.js"},
        {url:"assets/route-EfGh5678.js"},
        {url:"assets/constraint-IjKl9012.js"},
        {url:"assets/feedback-MnOp3456.js"}
      ]);`,
    );

    try {
      // When the production verifier scans the hashed entries
      const result = spawnSync(process.execPath, [scanner, output, "production"]);

      // Then domain-private classes fail even though their hash shape is valid
      expect(result.status).not.toBe(0);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });

  test("accepts only the exact hashed shell, manifest, and approved icon classes", async () => {
    // Given a precache containing the consumer shell and approved nonsensitive icons
    const output = await mkdtemp(join(tmpdir(), "somewhere-pwa-static-"));
    await writeFile(
      join(output, "sw.js"),
      `precacheAndRoute([
        {url:"index.html"},
        {url:"manifest.webmanifest"},
        {url:"assets/main-AbCd1234.js"},
        {url:"assets/styles-ZyXw9876.css"},
        {url:"icons/icon-192.png"}
      ]);`,
    );

    try {
      // When the production precache verifier inspects the emitted artifact
      const result = spawnSync(process.execPath, [scanner, output, "production"], {
        encoding: "utf8",
      });

      // Then the static-only manifest remains buildable
      expect(result.status).toBe(0);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });
});

describe("PWA build profile boundary", () => {
  test("accepts distinct production, harness, and non-PWA field outputs", async () => {
    // Given three separate output roots with profile-specific worker ownership
    const output = await mkdtemp(join(tmpdir(), "somewhere-build-boundary-"));
    const production = join(output, "production");
    const harness = join(output, "harness");
    const field = join(output, "field");
    await Promise.all([
      writeArtifact(
        join(production, "sw.js"),
        'cacheNames.setCacheNameDetails({prefix:"somewhere-consumer"})',
      ),
      writeArtifact(
        join(harness, "sw.js"),
        'cacheNames.setCacheNameDetails({prefix:"somewhere-test-harness"})',
      ),
      writeArtifact(join(production, "index.html"), "<main>consumer</main>"),
      writeArtifact(join(harness, "index.html"), "<main>test client</main>"),
      writeArtifact(join(field, "index.html"), "<main>field operator</main>"),
    ]);

    try {
      // When the cross-build verifier scans all emitted profiles
      const result = spawnSync(process.execPath, [boundaryScanner, production, harness, field]);

      // Then distinct cache identities and a service-worker-free field build pass
      expect(result.status).toBe(0);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });

  test("rejects production-private files and a field service worker", async () => {
    // Given production output with a field artifact and field output with PWA files
    const output = await mkdtemp(join(tmpdir(), "somewhere-build-private-"));
    const production = join(output, "production");
    const harness = join(output, "harness");
    const field = join(output, "field");
    await Promise.all([
      writeArtifact(
        join(production, "sw.js"),
        'cacheNames.setCacheNameDetails({prefix:"somewhere-consumer"})',
      ),
      writeArtifact(join(production, "field.html"), "<main>private</main>"),
      writeArtifact(
        join(harness, "sw.js"),
        'cacheNames.setCacheNameDetails({prefix:"somewhere-test-harness"})',
      ),
      writeArtifact(join(field, "sw.js"), "precacheAndRoute([])"),
    ]);

    try {
      // When the cross-build verifier scans all emitted profiles
      const result = spawnSync(process.execPath, [boundaryScanner, production, harness, field]);

      // Then the mixed profile outputs fail closed
      expect(result.status).not.toBe(0);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });

  test("rejects field export code hidden inside the production bundle", async () => {
    // Given separate profiles whose production bundle embeds a field-only action
    const output = await mkdtemp(join(tmpdir(), "somewhere-build-field-code-"));
    const production = join(output, "production");
    const harness = join(output, "harness");
    const field = join(output, "field");
    await Promise.all([
      writeArtifact(
        join(production, "sw.js"),
        'cacheNames.setCacheNameDetails({prefix:"somewhere-consumer"})',
      ),
      writeArtifact(
        join(production, "assets/main-AbCd1234.js"),
        'button.dataset.action="field-export"',
      ),
      writeArtifact(
        join(harness, "sw.js"),
        'cacheNames.setCacheNameDetails({prefix:"somewhere-test-harness"})',
      ),
      writeArtifact(join(field, "field.html"), "<main>field operator</main>"),
    ]);

    try {
      // When the cross-build verifier reads production bundle content
      const result = spawnSync(process.execPath, [boundaryScanner, production, harness, field]);

      // Then isolated field code cannot hide behind a consumer filename
      expect(result.status).not.toBe(0);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });
});

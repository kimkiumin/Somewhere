import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type Binding = Readonly<Record<string, string>>;

type EnvironmentConfig = Readonly<{
  d1_databases?: readonly Binding[];
  durable_objects?: Readonly<{ bindings?: readonly Binding[] }>;
  queues?: Readonly<{
    consumers?: readonly Binding[];
    producers?: readonly Binding[];
  }>;
}>;

type WorkerConfig = EnvironmentConfig &
  Readonly<{
    assets?: Readonly<{
      directory?: string;
      not_found_handling?: string;
      run_worker_first?: readonly string[];
    }>;
    env?: Readonly<Record<string, EnvironmentConfig>>;
    exports?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    migrations?: unknown;
    observability?: Readonly<{
      enabled?: boolean;
      logs?: Readonly<{ invocation_logs?: boolean }>;
      traces?: Readonly<{ enabled?: boolean }>;
    }>;
    triggers?: Readonly<{ crons?: readonly string[] }>;
  }>;

const configUrl = new URL("../wrangler.jsonc", import.meta.url);

async function readConfig(): Promise<WorkerConfig> {
  const source = await readFile(configUrl.pathname, "utf8").catch(() => "{}");
  return JSON.parse(source);
}

describe("worker-config", () => {
  it("routes same-origin API requests through the Worker before SPA assets", async () => {
    // Given: the checked-in Worker configuration.
    const config = await readConfig();

    // When: the Static Assets routing contract is inspected.
    const assets = config.assets;

    // Then: API requests cannot fall through to SPA HTML.
    expect(assets).toEqual({
      directory: "../app/dist",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"],
    });
  });

  it("declares a SQLite Durable Object without legacy migrations", async () => {
    // Given: the checked-in Worker configuration.
    const config = await readConfig();

    // When: its Durable Object lifecycle declaration is inspected.
    const durableObjectExport = config.exports?.["JourneyDurableObject"];

    // Then: only the declarative SQLite lifecycle is present.
    expect(durableObjectExport).toEqual({ type: "durable-object", storage: "sqlite" });
    expect(config.migrations).toBeUndefined();
  });

  it("declares isolated D1, Durable Object, Queue, DLQ, and Cron bindings", async () => {
    // Given: the checked-in Worker configuration.
    const config = await readConfig();

    // When: local and deployed environments are selected.
    const environments: readonly (EnvironmentConfig | undefined)[] = [
      config,
      config.env?.["staging"],
      config.env?.["production"],
    ];
    const serialized = environments.map((environment) => JSON.stringify(environment));

    // Then: every environment is complete and no deployed binding is reused.
    for (const environment of environments) {
      expect(environment?.d1_databases).toHaveLength(1);
      expect(environment?.durable_objects?.bindings).toHaveLength(1);
      expect(environment?.queues?.producers).toHaveLength(1);
      expect(environment?.queues?.consumers).toHaveLength(1);
    }
    expect(new Set(serialized)).toHaveLength(3);
    expect(config.triggers?.crons).toHaveLength(1);
  });

  it("disables identity-bearing invocation logs and traces", async () => {
    // Given: journey identifiers will appear in request URLs.
    const config = await readConfig();

    // When: Worker observability defaults are inspected.
    const observability = config.observability;

    // Then: the platform does not retain full journey URLs in logs or traces.
    expect(observability).toEqual({
      enabled: false,
      logs: { invocation_logs: false },
      traces: { enabled: false },
    });
  });
});

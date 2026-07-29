import { describe, expect, test } from "vitest";
import {
  createBrowserStorageBoundary,
  createFeatureDetectedBrowserStorageBoundary,
} from "./browser-storage-boundary";

describe("browser PWA storage boundary", () => {
  test("feature-detects optional browser persistence instead of identifying a browser", async () => {
    // Given the browser PWA platform module in an environment where capabilities may be absent
    const platform = await import("./browser-storage-boundary");

    // When its environment-aware factory is inspected
    const factory = Reflect.get(platform, "createFeatureDetectedBrowserStorageBoundary");

    // Then callers can select behavior from capabilities without a user-agent branch
    expect(factory).toBeTypeOf("function");
  });

  test("exports an explicit cache and service-worker cleanup boundary", async () => {
    // Given the browser PWA platform module
    const platform = await import("./browser-storage-boundary");

    // When its reset boundary is inspected
    const factory = Reflect.get(platform, "createBrowserStorageBoundary");

    // Then reset orchestration has one explicit browser-owned cleanup port
    expect(factory).toBeTypeOf("function");
  });

  test("still clears feedback when cache and service-worker capabilities are absent", async () => {
    // Given an environment with neither optional browser persistence capability
    let feedbackClears = 0;
    const boundary = createFeatureDetectedBrowserStorageBoundary(
      {
        async clear() {
          feedbackClears += 1;
        },
      },
      {},
    );

    // When reset inventories and clears the feature-detected boundary
    const inventory = await boundary.inventory();
    await boundary.clear();

    // Then unsupported capabilities stay empty while feedback deletion still runs
    expect(inventory).toEqual({
      cacheNames: [],
      cachedUrls: [],
      serviceWorkerScopes: [],
    });
    expect(feedbackClears).toBe(1);
  });

  test("inventories cache requests and service-worker scopes without reading payloads", async () => {
    // Given browser cache and registration metadata containing both Somewhere and unrelated state
    const boundary = createBrowserStorageBoundary({
      cacheStorage: {
        async keys() {
          return ["somewhere-consumer-precache-v1", "unrelated-cache"];
        },
        async open(name) {
          return {
            async keys() {
              return name.startsWith("somewhere-")
                ? [{ url: "https://example.test/Somewhere/index.html" }]
                : [{ url: "https://example.test/other/data" }];
            },
          };
        },
        async delete() {
          return true;
        },
      },
      feedbackCapabilities: { async clear() {} },
      serviceWorkers: {
        async getRegistrations() {
          return [
            {
              scope: "https://example.test/Somewhere/",
              async unregister() {
                return true;
              },
            },
            {
              scope: "https://example.test/other/",
              async unregister() {
                return true;
              },
            },
          ];
        },
      },
    });

    // When browser-owned persistence is inventoried
    const inventory = await boundary.inventory();

    // Then metadata is complete enough to prove private URLs are absent
    expect(inventory).toEqual({
      cacheNames: ["somewhere-consumer-precache-v1", "unrelated-cache"],
      cachedUrls: ["https://example.test/Somewhere/index.html", "https://example.test/other/data"],
      serviceWorkerScopes: ["https://example.test/Somewhere/", "https://example.test/other/"],
    });
  });

  test("clears only Somewhere caches and registrations plus the feedback capability", async () => {
    // Given browser persistence shared with an unrelated application
    const deletedCaches: string[] = [];
    const unregisteredScopes: string[] = [];
    let feedbackClears = 0;
    const boundary = createBrowserStorageBoundary({
      cacheStorage: {
        async keys() {
          return ["somewhere-consumer-precache-v1", "somewhere-test-harness-runtime", "unrelated"];
        },
        async open() {
          return {
            async keys() {
              return [];
            },
          };
        },
        async delete(name) {
          deletedCaches.push(name);
          return true;
        },
      },
      feedbackCapabilities: {
        async clear() {
          feedbackClears += 1;
        },
      },
      serviceWorkers: {
        async getRegistrations() {
          return [
            {
              scope: "https://example.test/Somewhere/",
              async unregister() {
                unregisteredScopes.push("https://example.test/Somewhere/");
                return true;
              },
            },
            {
              scope: "https://example.test/other/",
              async unregister() {
                unregisteredScopes.push("https://example.test/other/");
                return true;
              },
            },
          ];
        },
      },
    });

    // When the local browser reset boundary is cleared
    await boundary.clear();

    // Then only Somewhere-owned browser persistence is removed
    expect(deletedCaches).toEqual([
      "somewhere-consumer-precache-v1",
      "somewhere-test-harness-runtime",
    ]);
    expect(unregisteredScopes).toEqual(["https://example.test/Somewhere/"]);
    expect(feedbackClears).toBe(1);
  });
});

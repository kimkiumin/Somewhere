export type BrowserStorageInventory = Readonly<{
  cacheNames: readonly string[];
  cachedUrls: readonly string[];
  serviceWorkerScopes: readonly string[];
}>;

export interface CacheRequestPort {
  readonly url: string;
}

export interface CachePort {
  keys(): Promise<readonly CacheRequestPort[]>;
}

export interface CacheStoragePort {
  keys(): Promise<readonly string[]>;
  open(name: string): Promise<CachePort>;
  delete(name: string): Promise<boolean>;
}

export interface ServiceWorkerRegistrationPort {
  readonly scope: string;
  unregister(): Promise<boolean>;
}

export interface ServiceWorkerContainerPort {
  getRegistrations(): Promise<readonly ServiceWorkerRegistrationPort[]>;
}

export interface FeedbackCapabilityCleanupPort {
  clear(): Promise<void>;
}

export type BrowserStorageBoundaryOptions = Readonly<{
  cacheStorage: CacheStoragePort;
  serviceWorkers: ServiceWorkerContainerPort;
  feedbackCapabilities: FeedbackCapabilityCleanupPort;
}>;

export type BrowserStorageEnvironment = Readonly<{
  cacheStorage?: CacheStoragePort | undefined;
  serviceWorkers?: ServiceWorkerContainerPort | undefined;
}>;

export interface BrowserStorageBoundary {
  inventory(): Promise<BrowserStorageInventory>;
  clear(): Promise<void>;
}

const unavailableCacheStorage: CacheStoragePort = {
  async keys() {
    return [];
  },
  async open() {
    return {
      async keys() {
        return [];
      },
    };
  },
  async delete() {
    return false;
  },
};

const unavailableServiceWorkers: ServiceWorkerContainerPort = {
  async getRegistrations() {
    return [];
  },
};

function detectedBrowserStorageEnvironment(): BrowserStorageEnvironment {
  const cacheStorage = typeof globalThis.caches === "undefined" ? undefined : globalThis.caches;
  const serviceWorkers =
    typeof navigator === "undefined" || !("serviceWorker" in navigator)
      ? undefined
      : navigator.serviceWorker;
  return { cacheStorage, serviceWorkers };
}

export function createFeatureDetectedBrowserStorageBoundary(
  feedbackCapabilities: FeedbackCapabilityCleanupPort,
  environment: BrowserStorageEnvironment = detectedBrowserStorageEnvironment(),
): BrowserStorageBoundary {
  return createBrowserStorageBoundary({
    cacheStorage: environment.cacheStorage ?? unavailableCacheStorage,
    serviceWorkers: environment.serviceWorkers ?? unavailableServiceWorkers,
    feedbackCapabilities,
  });
}

export function createBrowserStorageBoundary(
  options: BrowserStorageBoundaryOptions,
): BrowserStorageBoundary {
  return {
    async inventory() {
      const [cacheNames, registrations] = await Promise.all([
        options.cacheStorage.keys(),
        options.serviceWorkers.getRegistrations(),
      ]);
      const cacheRequests = await Promise.all(
        cacheNames.map(async (name) => (await options.cacheStorage.open(name)).keys()),
      );
      return {
        cacheNames,
        cachedUrls: cacheRequests.flat().map((request) => request.url),
        serviceWorkerScopes: registrations.map((registration) => registration.scope),
      };
    },
    async clear() {
      const [cacheNames, registrations] = await Promise.all([
        options.cacheStorage.keys(),
        options.serviceWorkers.getRegistrations(),
      ]);
      await Promise.all([
        options.feedbackCapabilities.clear(),
        ...cacheNames
          .filter((name) => name.startsWith("somewhere-"))
          .map((name) => options.cacheStorage.delete(name)),
        ...registrations
          .filter((registration) => somewhereScope(registration.scope))
          .map((registration) => registration.unregister()),
      ]);
    },
  };
}

function somewhereScope(scope: string): boolean {
  try {
    const pathname = new URL(scope).pathname;
    return pathname === "/Somewhere" || pathname.startsWith("/Somewhere/");
  } catch (error) {
    if (error instanceof TypeError) {
      return false;
    }
    throw error;
  }
}

export interface LocalResetPort {
  reset(): Promise<void>;
}

export interface BrowserPersistenceResetPort {
  clear(): Promise<void>;
}

export type LocalResetOptions = Readonly<{
  journey: LocalResetPort;
  browserPersistence: BrowserPersistenceResetPort;
}>;

export class LocalResetError extends Error {
  readonly name = "LocalResetError";
}

export async function resetLocalBrowserState(options: LocalResetOptions): Promise<void> {
  const results = await Promise.allSettled([
    options.journey.reset(),
    options.browserPersistence.clear(),
  ]);
  for (const result of results) {
    switch (result.status) {
      case "fulfilled":
        break;
      case "rejected":
        throw new LocalResetError("Local reset failed");
      default:
        assertNever(result);
    }
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unknown reset result: ${String(value)}`);
}

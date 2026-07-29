import type { Page } from "@playwright/test";
import type { JourneyApplicationSnapshot } from "../src/application/journey-application";
import type { V2ApiCall } from "../src/testkit/v2-fakes";

type HarnessArgument = string | number | boolean | null;

export async function harnessCommand(
  page: Page,
  name: string,
  ...args: readonly HarnessArgument[]
): Promise<void> {
  await page.evaluate(
    ({ commandName, commandArguments }) => {
      const api = Reflect.get(window, "somewhereTest");
      if (typeof api !== "object" || api === null) {
        throw new Error("Somewhere deterministic harness is unavailable.");
      }
      const command = Reflect.get(api, commandName);
      if (typeof command !== "function") {
        throw new Error(`Unknown Somewhere harness command: ${commandName}`);
      }
      Reflect.apply(command, api, commandArguments);
    },
    { commandName: name, commandArguments: args },
  );
}

export function harnessSnapshot(page: Page): Promise<JourneyApplicationSnapshot> {
  return page.evaluate<JourneyApplicationSnapshot>(() => {
    const api = Reflect.get(window, "somewhereTest");
    if (typeof api !== "object" || api === null) {
      throw new Error("Somewhere deterministic harness is unavailable.");
    }
    const snapshot = Reflect.get(api, "snapshot");
    if (typeof snapshot !== "function") {
      throw new Error("Somewhere deterministic harness has no snapshot command.");
    }
    return Reflect.apply(snapshot, api, []);
  });
}

export function harnessCalls(page: Page): Promise<readonly V2ApiCall[]> {
  return page.evaluate<readonly V2ApiCall[]>(() => {
    const api = Reflect.get(window, "somewhereTest");
    if (typeof api !== "object" || api === null) {
      throw new Error("Somewhere deterministic harness is unavailable.");
    }
    const calls = Reflect.get(api, "calls");
    if (typeof calls !== "function") {
      throw new Error("Somewhere deterministic harness has no calls command.");
    }
    return Reflect.apply(calls, api, []);
  });
}

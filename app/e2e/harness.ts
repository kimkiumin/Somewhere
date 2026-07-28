import type { Page } from "@playwright/test";

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

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const qaRoot = fileURLToPath(new URL("../../qa/field/v2/", import.meta.url));
export const validator = join(qaRoot, "validate-evidence.mjs");
export const promoter = join(qaRoot, "promote-navigation-policy.mjs");
export const bindingVerifier = fileURLToPath(
  new URL("../../../scripts/release/verify-rc-build-binding.mjs", import.meta.url),
);

const temporaryRoots: string[] = [];

export async function temporaryRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `somewhere-field-v2-${label}-`));
  temporaryRoots.push(root);
  return root;
}

export function run(script: string, argumentsList: readonly string[]) {
  return spawnSync("bun", [script, ...argumentsList], { encoding: "utf8" });
}

export async function verdict(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function cleanupTemporaryRoots(): Promise<void> {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
}

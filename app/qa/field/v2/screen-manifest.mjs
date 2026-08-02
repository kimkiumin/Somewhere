import { readFile } from "node:fs/promises";
import path from "node:path";

export async function screenManifestMatches(runRoot, entries, expected, sha256) {
  const names = entries.map((entry) => entry.name);
  const expectedNames = Object.keys(expected);
  if (names.length !== expectedNames.length || names.some((name) => !(name in expected))) {
    return false;
  }
  const matches = await Promise.all(
    entries.map(async (entry) => {
      const bytes = await readFile(path.join(runRoot, "screens", entry.name));
      return sha256(bytes) === expected[entry.name];
    }),
  );
  return !matches.includes(false);
}

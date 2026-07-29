import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function temporaryDirectory(name) {
  return mkdtemp(join(tmpdir(), `somewhere-${name}.`));
}

export async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function run(repo, argv, environment = {}) {
  return Bun.spawnSync(argv, {
    cwd: repo,
    env: { ...process.env, ...environment },
    stdout: "pipe",
    stderr: "pipe",
  });
}

export async function removeTemporaryDirectory(path) {
  await rm(path, { recursive: true, force: true });
}

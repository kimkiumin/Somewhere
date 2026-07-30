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

export async function waitForWorkerPid(marker, child) {
  let markerError;
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    try {
      return JSON.parse(await readFile(marker, "utf8"));
    } catch (error) {
      const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
      if (!missing && !(error instanceof SyntaxError)) throw error;
      markerError = missing ? undefined : error;
    }
    const exited = await Promise.race([
      child.exited.then((exitCode) => ({ exitCode })),
      Bun.sleep(10),
    ]);
    if (exited !== undefined) {
      if (markerError !== undefined) throw markerError;
      throw new TypeError(
        `startup exited before fake Worker published its PID (exit ${exited.exitCode})`,
      );
    }
  }
  if (markerError !== undefined) throw markerError;
  throw new TypeError("fake Worker did not publish its PID");
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

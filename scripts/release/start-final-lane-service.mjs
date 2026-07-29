import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ReleaseInputError,
  mainBoundary,
  parseArguments,
  run,
  writeJson,
} from "./lib/release-core.mjs";
import { portOpen } from "./lib/lane-lifecycle.mjs";

const specification = {
  required: ["--repo", "--asset-dir", "--state-dir", "--runtime-dir", "--host", "--port", "--output"],
};

function processGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopProcessGroup(pid) {
  if (!processGroupAlive(pid)) return;
  process.kill(-pid, "SIGTERM");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!processGroupAlive(pid)) return;
    await Bun.sleep(50);
  }
  if (processGroupAlive(pid)) process.kill(-pid, "SIGKILL");
}

async function start(options) {
  const repo = resolve(options.repo);
  const runtime = resolve(options["runtime-dir"]);
  const state = resolve(options["state-dir"]);
  const assetDir = resolve(options["asset-dir"]);
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new ReleaseInputError("invalid port");
  if (await portOpen(port, options.host)) {
    throw new ReleaseInputError(`port already in use: ${options.host}:${port}`);
  }
  await mkdir(runtime, { recursive: true });
  await mkdir(state, { recursive: true });
  const config = resolve(repo, "server/wrangler.jsonc");
  const migrated = await run([
    "bunx",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    config,
    "--persist-to",
    state,
  ], { cwd: repo, env: process.env });
  if (migrated.exitCode !== 0) throw new ReleaseInputError(migrated.stderr.toString().trim());
  const key = resolve(runtime, "local.key");
  const certificate = resolve(runtime, "local.crt");
  const generated = await run([
    "openssl",
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    certificate,
    "-subj",
    `/CN=${options.host}`,
    "-addext",
    `subjectAltName=IP:${options.host}`,
    "-days",
    "1",
  ], { cwd: runtime, env: process.env });
  if (generated.exitCode !== 0) throw new ReleaseInputError(generated.stderr.toString().trim());
  const logPath = resolve(runtime, "worker.log");
  const descriptor = openSync(logPath, "a");
  const child = spawn("bunx", [
    "wrangler",
    "dev",
    "--config",
    config,
    "--assets",
    assetDir,
    "--ip",
    options.host,
    "--port",
    String(port),
    "--local-protocol",
    "https",
    "--https-key-path",
    key,
    "--https-cert-path",
    certificate,
    "--persist-to",
    state,
    "--show-interactive-dev-session=false",
  ], {
    cwd: repo,
    detached: true,
    env: process.env,
    stdio: ["ignore", descriptor, descriptor],
  });
  child.unref();
  closeSync(descriptor);
  const baseUrl = `https://${options.host}:${port}`;
  const healthProbe = () => run([
    "curl",
    "--insecure",
    "--silent",
    "--fail",
    "--max-time",
    "1",
    `${baseUrl}/api/v1/health`,
  ], { cwd: repo, env: process.env });
  let healthy = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const probe = await healthProbe();
    if (probe.exitCode === 0) {
      healthy = true;
      break;
    }
    if (!processGroupAlive(child.pid)) break;
    await Bun.sleep(100);
  }
  if (healthy) {
    await Bun.sleep(200);
    healthy = processGroupAlive(child.pid) && (await healthProbe()).exitCode === 0;
  }
  if (!healthy) {
    await stopProcessGroup(child.pid);
    throw new ReleaseInputError(`prepared Worker failed health check: ${await Bun.file(logPath).text()}`);
  }
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    pid: child.pid,
    port,
    baseUrl,
    stateDir: state,
    assetDir,
    logPath,
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => start(parsed), parsed.output);

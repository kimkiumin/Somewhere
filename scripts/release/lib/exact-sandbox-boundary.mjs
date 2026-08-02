import { access, realpath } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import { ReleaseInputError } from "./release-core.mjs";

export function hasSuccessfulExternalConnect(trace) {
  return trace.split("\n").some((line) => {
    if (
      !line.includes("connect(")
      || !/\bAF_INET6?\b/u.test(line)
      || !/\)\s+=\s+0(?:\s|$)/u.test(line)
    ) {
      return false;
    }
    const address = line.match(/inet_addr\("([^"]+)"\)/u)?.[1]
      ?? line.match(/inet_pton\(AF_INET6,\s*"([^"]+)"/u)?.[1];
    return address === undefined
      || !(address.startsWith("127.") || address === "::1" || address.startsWith("::ffff:127."));
  });
}

async function resolveExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory === "") continue;
    const candidate = resolve(directory, name);
    try {
      await access(candidate);
      return await realpath(candidate);
    } catch {
      // Keep searching the active PATH.
    }
  }
  throw new ReleaseInputError(`required runtime executable missing: ${name}`);
}

export function isolatedEnvironment(home, source, tree, evidenceRoot) {
  return {
    PATH: "/runtime/bin:/usr/local/bin:/usr/bin:/bin",
    LANG: process.env.LANG ?? "C.UTF-8",
    LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
    TZ: process.env.TZ ?? "UTC",
    CI: "true",
    HOME: home,
    XDG_CONFIG_HOME: resolve(home, ".config"),
    XDG_CACHE_HOME: resolve(home, ".cache"),
    XDG_DATA_HOME: resolve(home, ".local/share"),
    BUN_INSTALL_CACHE_DIR: resolve(home, ".cache/bun"),
    npm_config_cache: resolve(home, ".cache/npm"),
    WRANGLER_HOME: resolve(home, ".wrangler"),
    WRANGLER_SEND_METRICS: "false",
    TMPDIR: "/tmp",
    SOMEWHERE_MATERIALIZED_SOURCE: source,
    SOMEWHERE_SOURCE_TREE: tree,
    SOMEWHERE_EVIDENCE_ROOT: evidenceRoot,
  };
}

export async function sandboxRuntime() {
  await Promise.all([
    access("/usr/bin/bwrap"),
    access("/usr/bin/strace"),
  ]);
  return {
    bun: await resolveExecutable("bun"),
    node: await resolveExecutable("node"),
  };
}

export function sandboxCommand({
  argv,
  environment,
  source,
  emittedEvidence,
  dependencies,
  ephemeralPaths,
  root,
  trace,
  runtime,
}) {
  const executionRoot = "/workspace";
  const sourceMount = dependencies === null
    ? ["--ro-bind", source, executionRoot]
    : [
        "--overlay-src",
        source,
        "--overlay-src",
        resolve(root, "dependency-layer"),
        "--ro-overlay",
        executionRoot,
      ];
  const dependencyMounts = dependencies === null ? [] : dependencies.paths.flatMap((path) => [
    "--overlay-src",
    path === "node_modules"
      ? dependencies.root
      : resolve(dirname(dependencies.root), path),
    "--overlay-src",
    resolve(root, "dependency-layer", path),
    "--ro-overlay",
    resolve(executionRoot, path),
  ]);
  const settings = Object.entries(environment).flatMap(([name, value]) => [
    "--setenv",
    name,
    value,
  ]);
  return {
    argv: [
      "/usr/bin/bwrap",
      "--die-with-parent",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--unshare-net",
      "--tmpfs",
      "/",
      "--dir",
      "/usr",
      "--ro-bind",
      "/usr",
      "/usr",
      "--symlink",
      "usr/bin",
      "/bin",
      "--symlink",
      "usr/lib",
      "/lib",
      "--symlink",
      "usr/lib64",
      "/lib64",
      "--symlink",
      "usr/sbin",
      "/sbin",
      "--dir",
      "/runtime",
      "--dir",
      "/runtime/bin",
      "--ro-bind",
      runtime.bun,
      "/runtime/bin/bun",
      "--ro-bind",
      runtime.bun,
      "/runtime/bin/bunx",
      "--ro-bind",
      runtime.node,
      "/runtime/bin/node",
      "--dir",
      "/home",
      "--dir",
      "/home/sandbox",
      "--bind",
      resolve(root, "private-home"),
      "/home/sandbox",
      "--dir",
      executionRoot,
      ...sourceMount,
      ...dependencyMounts,
      ...ephemeralPaths.flatMap((path) => ["--tmpfs", resolve(executionRoot, path)]),
      "--dir",
      "/evidence",
      "--bind",
      emittedEvidence,
      "/evidence",
      "--dir",
      "/trace",
      "--bind",
      trace,
      "/trace/network.trace",
      "--tmpfs",
      "/tmp",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--chdir",
      executionRoot,
      "--clearenv",
      ...settings,
      "/usr/bin/strace",
      "-f",
      "-qq",
      "-e",
      "trace=network",
      "-o",
      "/trace/network.trace",
      "--",
      ...argv,
    ],
    cwd: executionRoot,
    spawnCwd: source,
  };
}

import { connect } from "node:net";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { mainBoundary, readJson, writeJson } from "./lib/release-core.mjs";

function parse(argv) {
  const flags = new Set(["--require-zero-browser-contexts", "--require-zero-temp-roots"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (flags.has(key)) {
      values.set(key, true);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || !key.startsWith("--")) throw new TypeError("invalid cleanup arguments");
    values.set(key, value);
    index += 1;
  }
  for (const key of ["--evidence-root", "--require-lanes", "--require-ports-closed", "--output"]) {
    if (!values.has(key)) throw new TypeError(`missing ${key}`);
  }
  return Object.fromEntries([...values].map(([key, value]) => [key.slice(2), value]));
}

async function portOpen(port) {
  return new Promise((complete) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      complete(true);
    });
    socket.once("error", () => complete(false));
    socket.once("timeout", () => {
      socket.destroy();
      complete(false);
    });
  });
}

async function cleanup(options) {
  if (
    options["require-zero-browser-contexts"] !== true
    || options["require-zero-temp-roots"] !== true
  ) {
    throw new TypeError("cleanup requires zero browser contexts and temporary roots");
  }
  const root = resolve(options["evidence-root"]);
  const lanes = options["require-lanes"].split(",");
  if (JSON.stringify(lanes) !== JSON.stringify(["F1", "F2", "F3", "F4"])) {
    throw new TypeError("cleanup requires exact lanes F1-F4");
  }
  const missingLanes = [];
  const tempRoots = [];
  let serverCount = 0;
  let browserContextCount = 0;
  for (const lane of lanes) {
    const path = resolve(root, lane, "cleanup.txt");
    try {
      await access(path);
    } catch {
      missingLanes.push(lane);
      continue;
    }
    try {
      const value = await readJson(path);
      if (
        value.schemaVersion !== 1
        || value.gate !== "PASS"
        || value.portClosed !== true
        || value.tempRootRemoved !== true
      ) {
        missingLanes.push(lane);
      }
      if (typeof value.pid === "number") {
        try {
          process.kill(value.pid, 0);
          serverCount += 1;
        } catch {
          // An absent owned PID is the expected cleanup state.
        }
      }
      if (typeof value.browserContextCount === "number") browserContextCount += value.browserContextCount;
      if (typeof value.tempRoot === "string") {
        try {
          await access(value.tempRoot);
          tempRoots.push(value.tempRoot);
        } catch {
          // Removed guarded roots are expected.
        }
      }
    } catch {
      missingLanes.push(lane);
    }
  }
  const ports = options["require-ports-closed"].split(",").map(Number);
  const openPorts = [];
  for (const port of ports) if (await portOpen(port)) openPorts.push(port);
  const gate = missingLanes.length === 0
    && serverCount === 0
    && browserContextCount === 0
    && openPorts.length === 0
    && tempRoots.length === 0
    ? "PASS"
    : "FAIL";
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate,
    serverCount,
    browserContextCount,
    openPorts,
    tempRoots,
  });
  if (gate !== "PASS") process.exitCode = 1;
}

const options = parse(process.argv.slice(2));
await mainBoundary(() => cleanup(options), options.output);

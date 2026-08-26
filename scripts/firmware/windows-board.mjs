#!/usr/bin/env bun

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

const ARDUINO_CLI_VERSION = "1.5.1";
const ESP32_CORE_VERSION = "3.3.11";
const ESP32_INDEX_URL = "https://espressif.github.io/arduino-esp32/package_esp32_index.json";
const FIRMWARE_FQBN = "esp32:esp32:waveshare_esp32_s3_touch_lcd_21";
const LIBRARIES = Object.freeze([
  "ESP32_Display_Panel@1.0.4",
  "ESP32_IO_Expander@1.1.0",
  "esp-lib-utils@0.2.0",
  "lvgl@8.4.0",
  "ArduinoJson@7.4.3",
]);
const GENERATED_ASSET_NAMES = Object.freeze([
  "compass_asset_metrics.h",
  "compass_assets.h",
  "roll_compass_korean_16.c",
  "roll_compass_korean_20.c",
  "roll_compass_wordmark_font.c",
]);

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptRoot, "../..");

function usage() {
  return `Usage:
  bun scripts/firmware/windows-board.mjs setup
  bun scripts/firmware/windows-board.mjs compile
  bun scripts/firmware/windows-board.mjs ports
  bun scripts/firmware/windows-board.mjs upload --port COM7
  bun scripts/firmware/windows-board.mjs monitor --port COM7

Options:
  --plan-json   Print the exact command plan without changing the machine.
  --port PORT   Required for upload and monitor; never guessed automatically.
`;
}

function parseArguments(argv) {
  const [action, ...rest] = argv;
  if (action === undefined || action === "help" || action === "--help" || action === "-h") {
    return { action: "help", planJson: false, port: undefined };
  }
  if (!["setup", "compile", "ports", "upload", "monitor"].includes(action)) {
    throw new Error(`unknown Windows firmware action: ${action}`);
  }

  let planJson = false;
  let port;
  for (let index = 0; index < rest.length; ++index) {
    const argument = rest[index];
    if (argument === "--plan-json") {
      planJson = true;
    } else if (argument === "--port") {
      port = rest[++index];
      if (port === undefined || port.startsWith("--")) {
        throw new Error("--port requires a COM port such as COM7");
      }
    } else {
      throw new Error(`unknown Windows firmware option: ${argument}`);
    }
  }
  if ((action === "upload" || action === "monitor") && port === undefined) {
    throw new Error(`${action} requires --port COM<number>`);
  }
  return { action, planJson, port };
}

function pathsFor(root = repositoryRoot) {
  const configRoot = resolve(root, ".local-artifacts/arduino-cli-windows");
  return Object.freeze({
    repositoryRoot: root,
    firmwareRoot: resolve(root, "firmware/roll-compass-board"),
    assetBundle: resolve(root, "firmware/roll-compass-board/generated-assets-v1.br"),
    buildRoot: resolve(root, ".local-artifacts/firmware-build-windows"),
    configRoot,
    configFile: resolve(configRoot, "arduino-cli.yaml"),
    dataRoot: resolve(configRoot, "data"),
    userRoot: resolve(configRoot, "user"),
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function restoreWindowsBoardAssets(options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const firmwareRoot = resolve(root, "firmware/roll-compass-board");
  const bundlePath = options.bundlePath ?? resolve(firmwareRoot, "generated-assets-v1.br");
  const payload = JSON.parse(brotliDecompressSync(await readFile(bundlePath)).toString("utf8"));
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.files)) {
    throw new Error("unsupported generated board asset bundle");
  }
  if (JSON.stringify(payload.files.map((asset) => asset.name)) !== JSON.stringify(GENERATED_ASSET_NAMES)) {
    throw new Error("generated board asset bundle has an unexpected file list");
  }

  const decodedAssets = payload.files.map((asset) => {
    const bytes = Buffer.from(asset.base64, "base64");
    if (sha256(bytes) !== asset.sha256) {
      throw new Error(`generated board asset failed integrity check: ${asset.name}`);
    }
    return { ...asset, bytes };
  });

  await mkdir(firmwareRoot, { recursive: true });
  const firmwareRootStats = await lstat(firmwareRoot);
  if (!firmwareRootStats.isDirectory() || firmwareRootStats.isSymbolicLink()) {
    throw new Error("generated board asset restoration refuses a linked firmware directory");
  }

  const restored = [];
  for (const asset of decodedAssets) {
    const output = resolve(firmwareRoot, asset.name);
    let currentMatches = false;
    if (existsSync(output)) {
      const outputStats = await lstat(output);
      if (!outputStats.isFile() || outputStats.isSymbolicLink() || outputStats.nlink !== 1) {
        throw new Error(`generated board asset restoration refuses linked output: ${asset.name}`);
      }
      currentMatches = sha256(await readFile(output)) === asset.sha256;
    }
    if (!currentMatches) {
      const temporary = resolve(
        firmwareRoot,
        `.${asset.name}.${process.pid}.${randomUUID()}.tmp`,
      );
      try {
        await writeFile(temporary, asset.bytes, { flag: "wx" });
        await rename(temporary, output);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    restored.push({ name: asset.name, bytes: asset.bytes.length, sha256: asset.sha256 });
  }
  return restored;
}

function configuredArguments(paths, ...args) {
  return ["--config-file", paths.configFile, ...args];
}

function versionCheckStep() {
  return { id: "cli-version", kind: "version-check", args: ["version", "--format", "json"] };
}

function compileStep(paths) {
  return {
    id: "compile",
    args: configuredArguments(
      paths,
      "compile",
      "--fqbn",
      FIRMWARE_FQBN,
      "--build-path",
      paths.buildRoot,
      "--jobs",
      "1",
      "--warnings",
      "all",
      paths.firmwareRoot,
    ),
  };
}

export function createWindowsBoardPlan(action, options = {}) {
  const paths = pathsFor(options.repositoryRoot);
  const versions = Object.freeze({
    arduinoCli: ARDUINO_CLI_VERSION,
    esp32Core: ESP32_CORE_VERSION,
    libraries: LIBRARIES,
  });
  let steps;

  switch (action) {
    case "setup":
      steps = [
        versionCheckStep(),
        { id: "config-init", args: ["config", "init", "--overwrite", "--dest-dir", paths.configRoot] },
        { id: "data-directory", args: configuredArguments(paths, "config", "set", "directories.data", paths.dataRoot) },
        { id: "user-directory", args: configuredArguments(paths, "config", "set", "directories.user", paths.userRoot) },
        { id: "esp32-index", args: configuredArguments(paths, "config", "set", "board_manager.additional_urls", ESP32_INDEX_URL) },
        { id: "core-index", args: configuredArguments(paths, "core", "update-index") },
        { id: "esp32-core", args: configuredArguments(paths, "core", "install", `esp32:esp32@${ESP32_CORE_VERSION}`) },
        ...LIBRARIES.map((library) => ({
          id: `library-${library.slice(0, library.indexOf("@"))}`,
          args: configuredArguments(paths, "lib", "install", library),
        })),
        { id: "board-details", args: configuredArguments(paths, "board", "details", "--fqbn", FIRMWARE_FQBN) },
      ];
      break;
    case "compile":
      steps = [versionCheckStep(), compileStep(paths)];
      break;
    case "ports":
      steps = [
        versionCheckStep(),
        { id: "ports", args: configuredArguments(paths, "board", "list") },
      ];
      break;
    case "upload":
      steps = [
        versionCheckStep(),
        compileStep(paths),
        {
          id: "upload",
          args: configuredArguments(
            paths,
            "upload",
            "--fqbn",
            FIRMWARE_FQBN,
            "--input-dir",
            paths.buildRoot,
            "--port",
            options.port,
          ),
        },
      ];
      break;
    case "monitor":
      steps = [
        versionCheckStep(),
        {
          id: "monitor",
          args: configuredArguments(
            paths,
            "monitor",
            "--port",
            options.port,
            "--config",
            "baudrate=115200,dtr=off,rts=off",
          ),
        },
      ];
      break;
    default:
      throw new Error(`unsupported Windows firmware action: ${action}`);
  }

  return { action, paths, steps, versions };
}

function commandName() {
  return process.env.SOMEWHERE_ARDUINO_CLI?.trim() || "arduino-cli";
}

function runStep(executable, step, expectedVersion, spawnSync) {
  if (step.kind === "version-check") {
    const result = spawnSync([executable, ...step.args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) {
      process.stderr.write(result.stderr);
      throw new Error("Arduino CLI is unavailable; install Arduino CLI 1.5.1 and reopen PowerShell");
    }
    const version = JSON.parse(result.stdout.toString()).VersionString;
    if (version !== expectedVersion) {
      throw new Error(`Arduino CLI ${expectedVersion} is required; found ${version ?? "unknown"}`);
    }
    process.stdout.write(`Arduino CLI ${version}\n`);
    return;
  }

  process.stdout.write(`\n[${step.id}] ${executable} ${step.args.join(" ")}\n`);
  const result = spawnSync([executable, ...step.args], {
    cwd: repositoryRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`${step.id} failed with exit code ${result.exitCode}`);
  }
}

export async function executeWindowsBoardPlan(plan, options = {}) {
  const executable = options.executable ?? commandName();
  const spawnSync = options.spawnSync ?? Bun.spawnSync;
  const [preflight, ...actionSteps] = plan.steps;
  if (preflight?.kind !== "version-check") {
    throw new Error("Windows firmware action is missing the Arduino CLI version preflight");
  }
  runStep(executable, preflight, plan.versions.arduinoCli, spawnSync);

  await mkdir(plan.paths.configRoot, { recursive: true });
  await mkdir(plan.paths.dataRoot, { recursive: true });
  await mkdir(plan.paths.userRoot, { recursive: true });
  await mkdir(plan.paths.buildRoot, { recursive: true });
  if (["setup", "compile", "upload"].includes(plan.action)) {
    const assets = await restoreWindowsBoardAssets({
      repositoryRoot: plan.paths.repositoryRoot,
      bundlePath: plan.paths.assetBundle,
    });
    process.stdout.write(`Board assets ready: ${assets.length}\n`);
  }
  if (plan.action !== "setup" && !existsSync(plan.paths.configFile)) {
    throw new Error("Windows firmware toolchain is not configured; run setup first");
  }

  for (const step of actionSteps) {
    runStep(executable, step, plan.versions.arduinoCli, spawnSync);
  }
}

async function main() {
  try {
    const input = parseArguments(process.argv.slice(2));
    if (input.action === "help") {
      process.stdout.write(usage());
      return;
    }
    const plan = createWindowsBoardPlan(input.action, { port: input.port });
    if (input.planJson) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return;
    }
    await executeWindowsBoardPlan(plan);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}

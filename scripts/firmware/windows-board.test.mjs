import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import {
  createWindowsBoardPlan,
  executeWindowsBoardPlan,
  restoreWindowsBoardAssets,
} from "./windows-board.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const script = resolve(repositoryRoot, "scripts/firmware/windows-board.mjs");

function planFor(...argumentsList) {
  const result = Bun.spawnSync([process.execPath, script, ...argumentsList, "--plan-json"], {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return JSON.parse(result.stdout.toString());
}

function compressTestBundle(payload) {
  return brotliCompressSync(Buffer.from(JSON.stringify(payload)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 1 },
  });
}

test("Windows setup pins the board core and every firmware library", () => {
  const plan = planFor("setup");

  expect(plan.action).toBe("setup");
  expect(plan.versions).toEqual({
    arduinoCli: "1.5.1",
    esp32Core: "3.3.11",
    libraries: [
      "ESP32_Display_Panel@1.0.4",
      "ESP32_IO_Expander@1.1.0",
      "esp-lib-utils@0.2.0",
      "lvgl@8.4.0",
      "ArduinoJson@7.4.3",
    ],
  });
  expect(plan.steps.map((step) => step.id)).toEqual([
    "cli-version",
    "config-init",
    "data-directory",
    "user-directory",
    "esp32-index",
    "core-index",
    "esp32-core",
    "library-ESP32_Display_Panel",
    "library-ESP32_IO_Expander",
    "library-esp-lib-utils",
    "library-lvgl",
    "library-ArduinoJson",
    "board-details",
  ]);
  expect(plan.steps.find((step) => step.id === "esp32-core").args).toContain(
    "esp32:esp32@3.3.11",
  );
});

test("Windows upload compiles first and flashes only the requested COM port", () => {
  const plan = planFor("upload", "--port", "COM7");
  const usbSerialFqbn =
    "esp32:esp32:waveshare_esp32_s3_touch_lcd_21:CDCOnBoot=cdc";

  expect(plan.steps.map((step) => step.id)).toEqual(["cli-version", "compile", "upload"]);
  expect(plan.steps[1].args).toContain(usbSerialFqbn);
  expect(plan.steps[2].args).toContain(usbSerialFqbn);
  expect(plan.steps[2].args).toContain("COM7");
  expect(plan.steps[2].args).toContain("--input-dir");
});

test("Windows monitor keeps serial reset lines disabled", () => {
  const plan = planFor("monitor", "--port", "COM9");

  expect(plan.steps).toHaveLength(2);
  expect(plan.steps[0].id).toBe("cli-version");
  expect(plan.steps[1].args).toEqual([
    "--config-file",
    plan.paths.configFile,
    "monitor",
    "--port",
    "COM9",
    "--config",
    "baudrate=115200,dtr=off,rts=off",
  ]);
});

test("every real Windows board action checks the Arduino CLI version first", () => {
  for (const [action, port] of [
    ["compile"],
    ["ports"],
    ["upload", "COM7"],
    ["monitor", "COM7"],
  ]) {
    const plan = createWindowsBoardPlan(action, { port });
    expect(plan.steps[0]).toMatchObject({ id: "cli-version", kind: "version-check" });
  }
});

test("a mismatched Arduino CLI cannot reach the requested action", async () => {
  const targetRoot = await mkdtemp(resolve(tmpdir(), "somewhere-windows-version-"));
  const invocations = [];
  try {
    const plan = createWindowsBoardPlan("ports", { repositoryRoot: targetRoot });
    await expect(
      executeWindowsBoardPlan(plan, {
        executable: "arduino-cli",
        spawnSync: (command) => {
          invocations.push(command);
          return {
            exitCode: 0,
            stderr: Buffer.alloc(0),
            stdout: Buffer.from('{"VersionString":"9.9.9"}'),
          };
        },
      }),
    ).rejects.toThrow("Arduino CLI 1.5.1 is required; found 9.9.9");
    expect(invocations).toHaveLength(1);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("Windows upload refuses to guess a serial port", () => {
  const result = Bun.spawnSync([process.execPath, script, "upload", "--plan-json"], {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("upload requires --port COM<number>");
});

test("a clean Windows checkout restores every generated firmware asset", async () => {
  const targetRoot = await mkdtemp(resolve(tmpdir(), "somewhere-windows-board-"));
  try {
    const restored = await restoreWindowsBoardAssets({
      repositoryRoot: targetRoot,
      bundlePath: resolve(repositoryRoot, "firmware/roll-compass-board/generated-assets-v1.br"),
    });

    expect(restored.map((asset) => asset.name)).toEqual([
      "compass_asset_metrics.h",
      "compass_assets.h",
      "roll_compass_korean_16.c",
      "roll_compass_korean_20.c",
      "roll_compass_wordmark_font.c",
    ]);
    for (const asset of restored) {
      expect(
        (await readFile(resolve(targetRoot, "firmware/roll-compass-board", asset.name))).length,
      ).toBe(asset.bytes);
    }
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("generated asset restoration rejects a digest mismatch before writing", async () => {
  const targetRoot = await mkdtemp(resolve(tmpdir(), "somewhere-windows-assets-digest-"));
  try {
    const sourceBundle = resolve(
      repositoryRoot,
      "firmware/roll-compass-board/generated-assets-v1.br",
    );
    const payload = JSON.parse(brotliDecompressSync(await readFile(sourceBundle)).toString("utf8"));
    payload.files[0].sha256 = "0".repeat(64);
    const bundlePath = resolve(targetRoot, "tampered.br");
    await writeFile(bundlePath, compressTestBundle(payload));

    await expect(
      restoreWindowsBoardAssets({ repositoryRoot: targetRoot, bundlePath }),
    ).rejects.toThrow("generated board asset failed integrity check");
    expect(
      existsSync(resolve(targetRoot, "firmware/roll-compass-board/compass_asset_metrics.h")),
    ).toBeFalse();
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("generated asset restoration rejects traversal-like filenames", async () => {
  const targetRoot = await mkdtemp(resolve(tmpdir(), "somewhere-windows-assets-path-"));
  try {
    const sourceBundle = resolve(
      repositoryRoot,
      "firmware/roll-compass-board/generated-assets-v1.br",
    );
    const payload = JSON.parse(brotliDecompressSync(await readFile(sourceBundle)).toString("utf8"));
    payload.files[0].name = "../outside";
    const bundlePath = resolve(targetRoot, "traversal.br");
    await writeFile(bundlePath, compressTestBundle(payload));

    await expect(
      restoreWindowsBoardAssets({ repositoryRoot: targetRoot, bundlePath }),
    ).rejects.toThrow("generated board asset bundle has an unexpected file list");
    expect(existsSync(resolve(targetRoot, "firmware/outside"))).toBeFalse();
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("generated asset restoration rejects linked output files", async () => {
  const targetRoot = await mkdtemp(resolve(tmpdir(), "somewhere-windows-assets-link-"));
  try {
    const firmwareRoot = resolve(targetRoot, "firmware/roll-compass-board");
    const outside = resolve(targetRoot, "outside-sentinel.h");
    const output = resolve(firmwareRoot, "compass_asset_metrics.h");
    await mkdir(firmwareRoot, { recursive: true });
    await writeFile(outside, "outside-must-not-change");
    await link(outside, output);

    await expect(
      restoreWindowsBoardAssets({
        repositoryRoot: targetRoot,
        bundlePath: resolve(repositoryRoot, "firmware/roll-compass-board/generated-assets-v1.br"),
      }),
    ).rejects.toThrow("refuses linked output");
    expect(await readFile(outside, "utf8")).toBe("outside-must-not-change");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")(
  "generated asset restoration rejects symbolic output files",
  async () => {
    const targetRoot = await mkdtemp(resolve(tmpdir(), "somewhere-windows-assets-symlink-"));
    try {
      const firmwareRoot = resolve(targetRoot, "firmware/roll-compass-board");
      const outside = resolve(targetRoot, "outside-sentinel.h");
      const output = resolve(firmwareRoot, "compass_asset_metrics.h");
      await mkdir(firmwareRoot, { recursive: true });
      await writeFile(outside, "outside-must-not-change");
      await symlink(outside, output, "file");

      await expect(
        restoreWindowsBoardAssets({
          repositoryRoot: targetRoot,
          bundlePath: resolve(repositoryRoot, "firmware/roll-compass-board/generated-assets-v1.br"),
        }),
      ).rejects.toThrow("refuses linked output");
      expect(await readFile(outside, "utf8")).toBe("outside-must-not-change");
    } finally {
      await rm(targetRoot, { recursive: true, force: true });
    }
  },
);

test("generated asset restoration validates the whole bundle before writing", async () => {
  const targetRoot = await mkdtemp(resolve(tmpdir(), "somewhere-windows-assets-atomic-"));
  try {
    const sourceBundle = resolve(
      repositoryRoot,
      "firmware/roll-compass-board/generated-assets-v1.br",
    );
    const payload = JSON.parse(brotliDecompressSync(await readFile(sourceBundle)).toString("utf8"));
    payload.files[1].sha256 = "0".repeat(64);
    const bundlePath = resolve(targetRoot, "tampered-late.br");
    const firstOutput = resolve(
      targetRoot,
      "firmware/roll-compass-board/compass_asset_metrics.h",
    );
    await mkdir(resolve(targetRoot, "firmware/roll-compass-board"), { recursive: true });
    await writeFile(firstOutput, "existing-first-asset");
    await writeFile(bundlePath, compressTestBundle(payload));

    await expect(
      restoreWindowsBoardAssets({ repositoryRoot: targetRoot, bundlePath }),
    ).rejects.toThrow("generated board asset failed integrity check");
    expect(await readFile(firstOutput, "utf8")).toBe("existing-first-asset");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("PowerShell wrapper rejects an unpinned Bun runtime", async () => {
  const wrapper = await readFile(resolve(repositoryRoot, "scripts/firmware/windows-board.ps1"), "utf8");
  expect(wrapper).toContain('$ExpectedBunVersion = "1.3.14"');
  expect(wrapper).toContain('$InstalledBunVersion -ne $ExpectedBunVersion');
});

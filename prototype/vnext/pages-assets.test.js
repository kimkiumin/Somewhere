"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
const runtimeFiles = [
  "app.js",
  "controller.js",
  "index.html",
  "screens.js",
  "state.js",
  "style.css",
];
const assetFiles = ["compass-body.png", "compass-needle.png"];

test("Pages artifact publishes the compass assets with the runtime", () => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const workspace = fs.mkdtempSync(path.join(tempRoot, "roll-the-compass-assets-"));
  const source = path.join(workspace, "source");
  const destination = path.join(workspace, "site");

  try {
    fs.mkdirSync(path.join(source, "assets"), { recursive: true });
    for (const file of runtimeFiles) {
      fs.writeFileSync(path.join(source, file), `runtime:${file}`, "utf8");
    }
    for (const file of assetFiles) {
      fs.writeFileSync(path.join(source, "assets", file), `asset:${file}`, "utf8");
    }

    execFileSync(
      powershell,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "harness", "stage-vnext-pages.ps1"),
        "-SourceDirectory",
        source,
        "-DestinationDirectory",
        destination,
        "-PublicSubpath",
        "wireframe-sequence",
      ],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    );

    const publicDirectory = path.join(destination, "wireframe-sequence");
    assert.deepEqual(
      fs.readdirSync(publicDirectory).sort(),
      [...runtimeFiles, "assets"].sort(),
    );
    for (const file of assetFiles) {
      assert.equal(
        fs.readFileSync(path.join(publicDirectory, "assets", file), "utf8"),
        `asset:${file}`,
      );
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

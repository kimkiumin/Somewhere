"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
const runtimeFiles = [
  "app.js",
  "controller.js",
  "index.html",
  "screens.js",
  "state.js",
  "style.css",
];

test("Pages artifact contains only the runnable vNext prototype", () => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const workspace = fs.mkdtempSync(path.join(tempRoot, "somewhere-pages-contract-"));
  const source = path.join(workspace, "source");
  const destination = path.join(workspace, "site");

  assert.equal(path.dirname(workspace), tempRoot);

  try {
    fs.mkdirSync(source);
    for (const file of runtimeFiles) {
      fs.writeFileSync(path.join(source, file), `runtime:${file}`, "utf8");
    }
    fs.writeFileSync(path.join(source, "README.md"), "repository-only", "utf8");
    fs.writeFileSync(path.join(source, "state.test.js"), "repository-only", "utf8");

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
      ],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    );

    const published = fs.readdirSync(destination).sort();
    assert.deepEqual(published, runtimeFiles);
    for (const file of runtimeFiles) {
      assert.equal(
        fs.readFileSync(path.join(destination, file), "utf8"),
        `runtime:${file}`,
      );
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

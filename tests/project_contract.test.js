"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("repository declares the approved vNext source hierarchy", () => {
  const agents = read("AGENTS.md");
  const readme = read("README.md");
  const prototypeSpec = read("docs/prototype_spec.md");

  assert.match(agents, /BLUEPRINT\.md.*docs\/blueprint/s);
  assert.match(agents, /v0\.1 historical implementation/i);
  assert.match(readme, /approved vNext blueprint/i);
  assert.match(readme, /physical compass/i);
  assert.match(prototypeSpec, /Historical v0\.1 Specification/i);
});

test("vNext rules do not preserve immediate reroll as an active contract", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /no active Reroll/i);
  assert.match(agents, /five-minute/i);
  assert.match(agents, /skippable reason/i);
});

test("verification entry point tracks its historical prototype baseline", () => {
  const requiredFiles = [
    "data/mock_destinations.json",
    "harness/check-prototype-contract.ps1",
    "prototype/app.js",
    "prototype/app.test.js",
    "prototype/base.css",
    "prototype/compass.css",
    "prototype/components.js",
    "prototype/controller.js",
    "prototype/controls.css",
    "prototype/icons.js",
    "prototype/index.html",
    "prototype/responsive.css",
    "prototype/screens.js",
    "prototype/shell.css",
    "prototype/state.js",
    "prototype/style.css",
  ];
  const trackedFiles = new Set(
    execFileSync("git", ["ls-files", "--", ...requiredFiles], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean),
  );

  assert.deepEqual(
    requiredFiles.filter((file) => !trackedFiles.has(file)),
    [],
  );
});

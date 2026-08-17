"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const extractTitle = (html) => html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? null;

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

test("vNext sequence prototype is isolated from historical v0.1", () => {
  const required = [
    "prototype/vnext/README.md",
    "prototype/vnext/index.html",
    "prototype/vnext/style.css",
    "prototype/vnext/state.js",
    "prototype/vnext/screens.js",
    "prototype/vnext/controller.js",
    "prototype/vnext/app.js",
  ];
  for (const file of required) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} is missing`);
  }

  const vnextHtml = read("prototype/vnext/index.html");
  const historicalHtml = read("prototype/index.html");
  assert.equal(extractTitle(vnextHtml), "Roll the compass! vNext 시퀀스 프로토타입");
  assert.equal(extractTitle(historicalHtml), "Blind Compass Prototype");
  assert.doesNotMatch(vnextHtml, /prototype\/app\.js/);
});

test("vNext title extraction rejects a body-only occurrence", () => {
  assert.equal(extractTitle("<body>Roll the compass! vNext</body>"), null);
});

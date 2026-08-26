import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";

const repositoryRoot = resolve(import.meta.dir, "../..");
const read = (path) => readFile(resolve(repositoryRoot, path), "utf8");
const xcodegenSha = "82c6ab9bbd5b6075fc0887d897733fc0c4ffc9ab";

describe("GitHub to macOS handoff contract", () => {
  test("does not present the tracked project registry as a seal for the checkout", async () => {
    const handoff = await read("docs/operations/macos-ios-handoff.md");

    expect(handoff).toContain("registry is not an exact-tree seal for the current checkout");
    expect(handoff).toContain("../project-status.md");
    expect(handoff).toContain("authority receipts outside Git");
  });

  test("offers clone fallbacks and keeps frozen prototype rules out of V2 context", async () => {
    const handoff = await read("docs/operations/macos-ios-handoff.md");

    expect(handoff).toContain("git clone https://github.com/kimkiumin/Somewhere.git");
    expect(handoff).toContain("gh repo clone kimkiumin/Somewhere Somewhere");
    expect(handoff).toContain("do not load its frozen v0.1 implementation sections");
  });

  test("binds manual project generation to the hosted XcodeGen source pin", async () => {
    const [handoff, iosReadme, workflow] = await Promise.all([
      read("docs/operations/macos-ios-handoff.md"),
      read("ios/README.md"),
      read(".github/workflows/ios-ci.yml"),
    ]);

    for (const source of [handoff, iosReadme, workflow]) expect(source).toContain(xcodegenSha);
    expect(iosReadme).toContain('"$XCODEGEN_BIN" --version | grep \'2.42.0\'');
    expect(workflow).toContain("bun run verify:ios-source");
  });

  test("validates and injects one explicit API origin into every native build command", async () => {
    const iosReadme = await read("ios/README.md");

    expect(iosReadme).toContain('validate-https-origin.mjs --origin "$SOMEWHERE_API_ORIGIN"');
    expect(iosReadme.match(/SOMEWHERE_API_ORIGIN="\$SOMEWHERE_API_ORIGIN"/g)).toHaveLength(4);
  });

  test("keeps manual Playwright installation inside the frozen app workspace", async () => {
    const [readme, workflow] = await Promise.all([
      read("README.md"),
      read(".github/workflows/app.yml"),
    ]);

    const command = "bunx --no-install playwright install --with-deps chromium webkit";
    expect(readme).toContain(`(cd app && ${command})`);
    expect(workflow).toContain(`run: ${command}`);
  });

  test("ignores common credential, signing, and environment file variants", async () => {
    const ignore = await read(".gitignore");

    for (const pattern of ["*.pem", "*.key", "*.cer", "*.crt", "*.jks", "*.keystore", ".env.*"]) {
      expect(ignore).toContain(pattern);
    }
    expect(ignore).toContain("!.env.example");
    expect(ignore).toContain("!.env.*.example");
  });

  test("records sanitized hosted toolchain metadata without private artifacts", async () => {
    const workflow = await read(".github/workflows/ios-ci.yml");

    for (const field of ["macOS", "xcode", "swift", "iphoneOSSDK", "xcodegen", "simulatorRuntime", "simulatorDeviceType"]) {
      expect(workflow).toContain(`${field}:`);
    }
    expect(workflow).toContain("rawCoordinateAttachments:false");
    expect(workflow).toContain("if-no-files-found: ignore");
    expect(workflow).toContain("app/src/data/curated-destinations.json");
    expect(workflow).toContain("participant(Name|Email)|contactEmail");
  });

  test("publishes one unsigned exhibition Simulator build for Windows review", async () => {
    const source = await read(".github/workflows/ios-preview.yml");
    const workflow = parse(source);

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.on.workflow_dispatch).toEqual({});
    expect(workflow.on.pull_request.paths).toContain("ios/**");
    expect(workflow.on.push.branches).toContain("codex/ipad-board-integration");
    expect(workflow.on.push.paths).toContain("ios/**");

    const preview = workflow.jobs.preview;
    expect(preview["runs-on"]).toBe("macos-15");
    expect(preview["timeout-minutes"]).toBe(30);

    const checkout = preview.steps.find((step) => step.name === "Check out exact source");
    const setupBun = preview.steps.find((step) => step.name === "Set up pinned Bun");
    expect(checkout.uses).toBe("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(setupBun.uses).toBe("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");

    const build = preview.steps.find((step) => step.id === "build-preview");
    expect(build.env).toEqual({
      SOMEWHERE_API_ORIGIN: "https://example.invalid",
      SOMEWHERE_EXHIBITION_DEMO: "YES",
    });
    for (const fragment of [
      "-sdk iphonesimulator",
      "-configuration Debug",
      "CODE_SIGNING_ALLOWED=NO",
      'SOMEWHERE_API_ORIGIN="$SOMEWHERE_API_ORIGIN"',
      'SOMEWHERE_EXHIBITION_DEMO="$SOMEWHERE_EXHIBITION_DEMO"',
      "ARCHS=arm64",
    ]) {
      expect(build.run).toContain(fragment);
    }

    const packageStep = preview.steps.find((step) => step.id === "package-preview");
    for (const fragment of [
      "SomewhereAPIOrigin",
      "SomewhereExhibitionDemo",
      "finalSha",
      "sourceTree",
      "configuration",
      "architecture",
      "bundleIdentifier",
      "archiveSha256",
    ]) {
      expect(packageStep.run).toContain(fragment);
    }

    const upload = preview.steps.find((step) => step.name === "Upload Simulator preview");
    expect(upload.uses).toBe("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
    expect(upload.with["retention-days"]).toBe(7);
    expect(upload.with["if-no-files-found"]).toBe("error");
    expect(upload.with.path.trim().split(/\s*\n\s*/)).toEqual([
      "${{ runner.temp }}/somewhere-ios-preview/Somewhere-iOS-Simulator.zip",
      "${{ runner.temp }}/somewhere-ios-preview/preview-manifest.json",
    ]);

    const executableSteps = preview.steps.map((step) => `${step.uses ?? ""}\n${step.run ?? ""}`).join("\n");
    expect(executableSteps).not.toMatch(/appetize|browserstack/i);
  });

  test("collects complete cross-surface visual decisions in one issue form", async () => {
    const source = await read(".github/ISSUE_TEMPLATE/visual-handoff.yml");
    const form = parse(source);
    const fields = new Map(form.body.filter((item) => item.id).map((item) => [item.id, item]));
    const requiredIds = [
      "source_sha",
      "surface",
      "state",
      "device",
      "orientation",
      "screenshot",
      "interaction",
      "expected_result",
      "geometry",
      "typography",
      "color",
      "asset",
      "constraints",
      "priority",
      "mac_verification",
    ];

    expect([...fields.keys()]).toEqual(requiredIds);
    for (const id of requiredIds) expect(fields.get(id).validations.required).toBe(true);

    expect(fields.get("surface").attributes.options).toEqual([
      "iPhone app",
      "iPad app",
      "480x480 circular LCD",
      "Cross-surface behavior",
    ]);
    expect(fields.get("orientation").attributes.options).toContain("Portrait");
    expect(fields.get("constraints").attributes.description).toContain("V2 backend");
    expect(fields.get("mac_verification").attributes.description).toContain("Xcode");
  });
});

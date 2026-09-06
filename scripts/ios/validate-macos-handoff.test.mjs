import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
});

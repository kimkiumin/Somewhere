import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const outputRoot = resolve(root, ".local-artifacts/ios-exhibition", String(Date.now()));
const requiredRuntimeIdentifier = "com.apple.CoreSimulator.SimRuntime.iOS-26-5";
const requiredRuntimeVersion = "26.5";

mkdirSync(outputRoot, { recursive: true });

const targets = [
  {
    name: "Somewhere iPad Pro 11 2nd Gen",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro--11-inch---2nd-generation-",
    slug: "ipad-pro-11-2nd-gen",
  },
  {
    name: "Somewhere iPhone 13",
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-13",
    slug: "iphone-13",
  },
];

function run(command, args, options = {}) {
  let result;
  try {
    result = Bun.spawnSync([command, ...args], {
      cwd: options.cwd ?? root,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error("Unable to execute " + command + ": " + detail);
  }

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0 && options.allowFailure !== true) {
    throw new Error(
      (command + " " + args.join(" ") + "\n" + stdout + "\n" + stderr).trim(),
    );
  }
  return { code: result.exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

function resolveXcodeGen() {
  const configured = process.env.XCODEGEN_BIN?.trim();
  if (configured) return configured;

  const discovered = Bun.which("xcodegen");
  if (discovered) return discovered;

  throw new Error(
    "XcodeGen was not found. Set XCODEGEN_BIN to an executable path or install xcodegen on PATH.",
  );
}

const xcodegen = resolveXcodeGen();
let xcodegenVersion;
try {
  xcodegenVersion = run(xcodegen, ["--version"]).stdout;
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(
    "XcodeGen could not be executed at " +
      xcodegen +
      ". Check XCODEGEN_BIN and execute permission.\n" +
      detail,
  );
}

console.log("XcodeGen: " + xcodegenVersion + " (" + xcodegen + ")");
run(xcodegen, ["generate", "--spec", "ios/project.yml"]);

const runtimes = JSON.parse(run("xcrun", ["simctl", "list", "runtimes", "--json"]).stdout).runtimes;
const runtime = runtimes.find(
  (value) =>
    value.identifier === requiredRuntimeIdentifier &&
    value.version === requiredRuntimeVersion &&
    value.isAvailable,
);
if (!runtime) {
  throw new Error(
    "Required available iOS Simulator runtime " +
      requiredRuntimeVersion +
      " (" +
      requiredRuntimeIdentifier +
      ") was not found.",
  );
}

const deviceTypes = JSON.parse(run("xcrun", ["simctl", "list", "devicetypes", "--json"]).stdout).devicetypes;
const listedDevices = JSON.parse(run("xcrun", ["simctl", "list", "devices", "--json"]).stdout).devices;
const runtimeDevices = listedDevices[runtime.identifier] ?? [];

for (const target of targets) {
  if (!deviceTypes.some((value) => value.identifier === target.type)) {
    throw new Error("Missing Simulator device type: " + target.type);
  }

  const sameName = runtimeDevices.find((value) => value.name === target.name);
  if (sameName && !sameName.isAvailable) {
    throw new Error(
      "Simulator exists but is unavailable: " + target.name + " (" + sameName.udid + ")",
    );
  }
  if (sameName && sameName.deviceTypeIdentifier !== target.type) {
    throw new Error(
      "Simulator name is owned by another device type: " +
        target.name +
        " (" +
        sameName.deviceTypeIdentifier +
        ")",
    );
  }

  const udid =
    sameName?.udid ??
    run("xcrun", [
      "simctl",
      "create",
      target.name,
      target.type,
      runtime.identifier,
    ]).stdout;

  if (!udid) throw new Error("Simulator creation returned no UDID: " + target.name);

  if (sameName?.state !== "Booted") {
    run("xcrun", ["simctl", "boot", udid]);
  }
  run("xcrun", ["simctl", "bootstatus", udid, "-b"]);
  run("xcodebuild", [
    "test",
    "-project",
    "ios/Somewhere.xcodeproj",
    "-scheme",
    "Somewhere",
    "-destination",
    "platform=iOS Simulator,id=" + udid,
    "-only-testing:SomewhereTests",
    "-only-testing:SomewhereUITests/ExhibitionLayoutUITests",
    "-resultBundlePath",
    resolve(outputRoot, target.slug + ".xcresult"),
    "CODE_SIGNING_ALLOWED=NO",
  ]);
  console.log("PASS " + target.slug);
}

console.log("Evidence: " + outputRoot);

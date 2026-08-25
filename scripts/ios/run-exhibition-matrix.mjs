import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const outputRoot = resolve(root, ".local-artifacts/ios-exhibition", String(Date.now()));

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
function parseNumericVersion(version) {
  const components = String(version).split(".").map(Number);
  if (components.length === 0 || components.some((value) => !Number.isInteger(value) || value < 0)) {
    return null;
  }
  return components;
}

function compareNumericVersions(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const runtime = runtimes
  .filter((value) => value.platform === "iOS" && value.isAvailable)
  .map((value) => ({ value, version: parseNumericVersion(value.version) }))
  .filter((value) => value.version !== null)
  .sort((left, right) => compareNumericVersions(right.version, left.version))[0]?.value;
if (!runtime) {
  throw new Error("No available iOS Simulator runtime was found.");
}
console.log("Runtime: " + runtime.name + " " + runtime.version + " (" + runtime.identifier + ")");

const deviceTypes = JSON.parse(run("xcrun", ["simctl", "list", "devicetypes", "--json"]).stdout).devicetypes;
const listedDevices = JSON.parse(run("xcrun", ["simctl", "list", "devices", "--json"]).stdout).devices;
const runtimeDevices = listedDevices[runtime.identifier] ?? [];

for (const target of targets) {
  if (!deviceTypes.some((value) => value.identifier === target.type)) {
    throw new Error("Missing Simulator device type: " + target.type);
  }

  const sameNameDevices = runtimeDevices.filter((value) => value.name === target.name);
  const conflictingDevice = sameNameDevices.find(
    (value) => value.deviceTypeIdentifier !== target.type,
  );
  if (conflictingDevice) {
    throw new Error(
      "Simulator name is owned by another device type: " +
        target.name +
        " (" +
        conflictingDevice.deviceTypeIdentifier +
        ")",
    );
  }
  const sameName = sameNameDevices.find((value) => value.deviceTypeIdentifier === target.type);
  if (sameName && !sameName.isAvailable) {
    throw new Error(
      "Simulator exists but is unavailable: " + target.name + " (" + sameName.udid + ")",
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

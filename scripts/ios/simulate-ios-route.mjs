#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE_PATH = resolve(ROOT, "server/fixtures/seoul-forest/routes.json");
const EARTH_RADIUS_M = 6_371_000;

const candidateAliases = Object.freeze({
  cafe: "manual:center-coffee-seoul-forest",
  restaurant: "manual:seongsu-gamjatang",
});

function usage() {
  console.log(`Usage: node scripts/ios/simulate-ios-route.mjs --udid <simulator-udid> [options]

Options:
  --candidate <cafe|restaurant|candidate-id>  Route fixture (default: restaurant)
  --scenario <route|off-route>                Replay scenario (default: route)
  --speed <meters-per-second>                 Replay speed (default: 8)
  --interval <seconds>                        Location update interval (default: 1)
  --dwell <seconds>                           Endpoint dwell duration (default: 16)
  --clear                                     Clear the simulated location afterward
  --help                                      Show this help

The app must already be in the committed/following state. Launch the Debug
app with --simulator-heading-from-course to make the route replay provide a
test-only heading because iOS Simulator has no magnetometer.`);
}

function parseArgs(argv) {
  const options = {
    candidate: "restaurant",
    scenario: "route",
    speed: 8,
    interval: 1,
    dwell: 16,
    clear: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") return { help: true };
    if (value === "--clear") {
      options.clear = true;
      continue;
    }
    if (!["--udid", "--candidate", "--scenario", "--speed", "--interval", "--dwell"].includes(value)) {
      throw new Error(`unknown option: ${value}`);
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${value} requires a value`);
    index += 1;
    if (value === "--udid") options.udid = next;
    if (value === "--candidate") options.candidate = next;
    if (value === "--scenario") options.scenario = next;
    if (value === "--speed") options.speed = Number(next);
    if (value === "--interval") options.interval = Number(next);
    if (value === "--dwell") options.dwell = Number(next);
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distanceM(left, right) {
  const latitudeDelta = (right.latitude - left.latitude) * Math.PI / 180;
  const longitudeDelta = (right.longitude - left.longitude) * Math.PI / 180;
  const leftLatitude = left.latitude * Math.PI / 180;
  const rightLatitude = right.latitude * Math.PI / 180;
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bearing(from, to) {
  const fromLatitude = from.latitude * Math.PI / 180;
  const toLatitude = to.latitude * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const x = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const y = Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  const degrees = Math.atan2(x, y) * 180 / Math.PI;
  return (degrees + 360) % 360;
}

function interpolate(from, to, fraction) {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: from.longitude + (to.longitude - from.longitude) * fraction,
  };
}

function offset(point, bearingDegrees, meters) {
  const angularDistance = meters / EARTH_RADIUS_M;
  const bearingRadians = bearingDegrees * Math.PI / 180;
  const latitude = point.latitude * Math.PI / 180;
  const longitude = point.longitude * Math.PI / 180;
  const nextLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const nextLongitude = longitude + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
  );
  return {
    latitude: nextLatitude * 180 / Math.PI,
    longitude: nextLongitude * 180 / Math.PI,
  };
}

function coordinateArgument(point) {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function routeLength(points) {
  return points.slice(1).reduce((total, point, index) => total + distanceM(points[index], point), 0);
}

function scenarioPoints(geometry, scenario) {
  if (scenario === "route") return geometry;
  assert(scenario === "off-route", `unsupported scenario: ${scenario}`);
  const from = geometry[0];
  const to = geometry[1];
  const midpoint = interpolate(from, to, 0.55);
  const offRoute = offset(midpoint, bearing(from, to) + 90, 120);
  return [from, midpoint, offRoute, midpoint, ...geometry.slice(1)];
}

async function setLocation(udid, point) {
  const child = spawn("xcrun", ["simctl", "location", udid, "set", coordinateArgument(point)], {
    cwd: ROOT,
    stdio: "inherit",
  });
  await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`simctl location set exited with ${code}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  assert(options.udid, "--udid is required");
  assert(options.speed > 0 && Number.isFinite(options.speed), "--speed must be positive");
  assert(options.interval > 0 && Number.isFinite(options.interval), "--interval must be positive");
  assert(options.dwell >= 0 && Number.isFinite(options.dwell), "--dwell must be non-negative");

  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  const candidateId = candidateAliases[options.candidate] ?? options.candidate;
  const route = fixture.routes.find((value) => value.candidateId === candidateId);
  assert(route, `route fixture not found for candidate: ${options.candidate}`);
  const geometry = route.geometry.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const points = scenarioPoints(geometry, options.scenario);
  const lengthM = routeLength(points);
  const estimatedSeconds = lengthM / options.speed;

  console.log(JSON.stringify({
    simulator: options.udid,
    candidateId,
    scenario: options.scenario,
    routeId: route.routeId,
    fixtureLengthM: route.lengthM,
    replayLengthM: Math.round(lengthM),
    speedMps: options.speed,
    intervalSeconds: options.interval,
    estimatedReplaySeconds: Math.round(estimatedSeconds),
    dwellSeconds: options.dwell,
    waypoints: points,
  }, null, 2));

  const replay = spawn("xcrun", [
    "simctl", "location", options.udid, "start",
    `--speed=${options.speed}`,
    `--interval=${options.interval}`,
    ...points.map(coordinateArgument),
  ], { cwd: ROOT, stdio: "inherit" });
  const replayClosed = new Promise((resolvePromise, reject) => {
    replay.once("error", reject);
    replay.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
  await delay((estimatedSeconds + 2) * 1000);
  if (replay.exitCode === null) replay.kill("SIGTERM");
  const replayResult = await replayClosed;
  assert(
    replayResult.code === 0 || replayResult.signal === "SIGTERM",
    `simctl location start exited with ${replayResult.code ?? replayResult.signal}`,
  );

  const endpoint = geometry.at(-1);
  assert(endpoint, "route endpoint is missing");
  const dwellCount = Math.max(1, Math.ceil(options.dwell / options.interval));
  for (let index = 0; index < dwellCount; index += 1) {
    await setLocation(options.udid, endpoint);
    if (index + 1 < dwellCount) await delay(options.interval * 1000);
  }

  if (options.clear) {
    const clear = spawn("xcrun", ["simctl", "location", options.udid, "clear"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    await new Promise((resolvePromise, reject) => {
      clear.once("error", reject);
      clear.once("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`simctl location clear exited with ${code}`)));
    });
  }
  console.log(`Simulator route replay complete; endpoint dwell samples: ${dwellCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

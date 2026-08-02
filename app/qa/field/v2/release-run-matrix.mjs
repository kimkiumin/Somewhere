const matrix = [
  ["home-screen", "open-sky", "C"],
  ["home-screen", "building-dense", "D"],
  ["safari", "open-sky", "A"],
  ["safari", "building-dense", "B"],
];

export function requiredRunDirectories(buildSha) {
  return matrix.map(([mode, environment]) => `iphone-v2-${buildSha}-${mode}-${environment}`);
}

export function expectedRun(directory, buildSha) {
  return matrix.find(
    ([mode, environment]) => directory === `iphone-v2-${buildSha}-${mode}-${environment}`,
  );
}

export function supportsHomeScreenWakeLock(iosVersion) {
  const parts = iosVersion.split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  return major > 18 || (major === 18 && minor >= 4);
}

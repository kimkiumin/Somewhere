// Runs the real pinned LVGL rasterizer on macOS/Linux; no board or simulator.
import { mkdir, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const firmware = resolve(root, "firmware/roll-compass-board");
const lvgl = resolve(root, ".local-artifacts/arduino-cli/user/libraries/lvgl");
const output = resolve(root, ".local-artifacts/firmware-renderer-tests");
await mkdir(output, { recursive: true });
const sources = (await readdir(resolve(lvgl, "src"), { recursive: true }))
  .filter((file) => file.endsWith(".c"))
  .map((file) => resolve(lvgl, "src", file));
const includes = ["-DLV_CONF_INCLUDE_SIMPLE", "-I", firmware, "-I", lvgl];
async function run(args) {
  const child = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if ((await child.exited) !== 0) throw new Error(`Failed: ${args[0]}`);
}
const objects = sources.map((source) =>
  resolve(output, relative(lvgl, source).replaceAll(/[\\/]/g, "_") + ".o"),
);
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < sources.length) {
    const index = next++;
    await run([process.env.CC || "cc", "-std=c99", "-O2", ...includes,
      "-c", sources[index], "-o", objects[index]]);
  }
}));
const binary = resolve(output, "instrument-line-test");
await run([process.env.CXX || "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror",
  ...includes, resolve(firmware, "tests/instrument_line_test.cpp"),
  ...objects, "-lm", "-o", binary]);
await run([binary]);

const fontObjects = [];
for (const name of ["roll_compass_korean_16", "roll_compass_korean_20"]) {
  const object = resolve(output, `${name}.o`);
  await run([process.env.CC || "cc", "-std=c99", "-O2", ...includes,
    "-c", resolve(firmware, `${name}.c`), "-o", object]);
  fontObjects.push(object);
}
const textBinary = resolve(output, "instrument-text-test");
await run([process.env.CXX || "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror",
  ...includes, resolve(firmware, "tests/instrument_text_test.cpp"),
  resolve(firmware, "instrument_text.cpp"), resolve(firmware, "display_content.cpp"),
  resolve(firmware, "univers_font_adapter.cpp"),
  ...fontObjects, ...objects, "-lm", "-o", textBinary]);
await run([textBinary, resolve(firmware, "font-text.txt")]);

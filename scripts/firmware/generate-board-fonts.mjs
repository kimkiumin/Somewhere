// Cross-platform: edit font-text.txt, then run `bun run firmware:fonts`.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { restoreWindowsBoardAssets } from "./windows-board.mjs";

const root = resolve(import.meta.dirname, "../..");
const firmware = resolve(root, "firmware/roll-compass-board");
const fontRoot = resolve(root, ".local-artifacts/firmware-fonts");
const sourceCommit = "6a003b5eb672dc8bf5bff5937cf5863f8b175445";
const sources = [
  ["NotoSansKR[wght].ttf", "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252"],
  ["OFL.txt", "1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9"],
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const symbols = (await readFile(resolve(firmware, "font-text.txt"), "utf8"))
  .normalize("NFC").replaceAll(/[\r\n]/g, " ");
const converter = resolve(root, "node_modules/lv_font_conv/lv_font_conv.js");
const packagePath = resolve(root, "node_modules/lv_font_conv/package.json");
if (!existsSync(packagePath)) throw new Error("Run bun install --frozen-lockfile first.");
if (JSON.parse(await readFile(packagePath, "utf8")).version !== "1.5.3") {
  throw new Error("Font generation requires the pinned lv_font_conv 1.5.3.");
}
await mkdir(fontRoot, { recursive: true });
for (const [name, digest] of sources) {
  const path = resolve(fontRoot, name);
  if (existsSync(path) && sha256(await readFile(path)) === digest) continue;
  const url = `https://raw.githubusercontent.com/google/fonts/${sourceCommit}/ofl/notosanskr/${encodeURIComponent(name)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Font download failed (${response.status}): ${name}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== digest) throw new Error(`Font checksum mismatch: ${name}`);
  await writeFile(path, bytes);
}
// A fresh Windows checkout has no generated legacy assets. Restore the base
// bundle before generating fonts, so the subsequent package step is complete.
if (!existsSync(resolve(firmware, "compass_assets.h")) ||
    !existsSync(resolve(firmware, "compass_asset_metrics.h"))) {
  await restoreWindowsBoardAssets();
}
const jobs = [
  [resolve(root, "ios/Somewhere/Resources/Fonts/UnifrakturCook-Bold.ttf"), 24,
    "Roll the compass", "roll_compass_wordmark_font", false],
  [resolve(fontRoot, "NotoSansKR[wght].ttf"), 16, symbols, "roll_compass_korean_16", true],
  [resolve(fontRoot, "NotoSansKR[wght].ttf"), 20, symbols, "roll_compass_korean_20", true],
];
for (const [font, size, text, name, withAscii] of jobs) {
  const args = [process.execPath, converter, "--format", "lvgl", "--bpp", "4",
    "--size", String(size), "--font", font, "--symbols", text,
    ...(withAscii ? ["--range", "0x20-0x7e"] : []),
    "--lv-include", "lvgl.h", "--lv-font-name", name,
    "--output", resolve(firmware, `${name}.c`)];
  const child = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if ((await child.exited) !== 0) throw new Error(`Font conversion failed: ${name}`);
  // The converter embeds absolute host paths in its comment. A stable comment
  // keeps Mac/Windows regeneration byte-identical and out of the user's folders.
  const output = resolve(firmware, `${name}.c`);
  const generated = (await readFile(output, "utf8")).replaceAll("\r\n", "\n")
    .replace(/^ \* Opts:.*$/m,
      ` * Opts: lv_font_conv 1.5.3; ${name}; see scripts/firmware/generate-board-fonts.mjs`);
  await writeFile(output, generated);
  console.log(`Generated ${name} (${size}px)`);
}

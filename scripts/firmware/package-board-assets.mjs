#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const firmwareRoot = resolve(repositoryRoot, "firmware/roll-compass-board");
const output = resolve(firmwareRoot, "generated-assets-v1.br");
const names = [
  "compass_asset_metrics.h",
  "compass_assets.h",
  "roll_compass_korean_16.c",
  "roll_compass_korean_20.c",
  "roll_compass_wordmark_font.c",
];

const files = [];
for (const name of names) {
  const bytes = await readFile(resolve(firmwareRoot, name));
  files.push({
    name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    base64: bytes.toString("base64"),
  });
}

const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, files }), "utf8");
const compressed = brotliCompressSync(payload, {
  params: {
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    [constants.BROTLI_PARAM_QUALITY]: 11,
  },
});
await writeFile(output, compressed);
process.stdout.write(`Packed ${files.length} generated board assets into ${output}\n`);

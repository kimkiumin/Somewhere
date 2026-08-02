#!/usr/bin/env node
import { z } from "zod";
import { parseStrictJsonV1 } from "../../contracts/src/index.ts";
import {
  ReleaseInputError,
  mainBoundary,
  parseArguments,
  snapshotRegularFile,
} from "./lib/release-core.mjs";

const resultSchema = z.tuple([
  z.object({
    success: z.literal(true),
    results: z.tuple([z.object({ gate: z.literal("PASS") }).strict()]),
    meta: z.record(z.string(), z.unknown()),
  }).strict(),
]);

async function validate(path) {
  const snapshot = await snapshotRegularFile(path, "D1 gate result");
  const parsed = parseStrictJsonV1(snapshot.data.toString());
  if (!parsed.ok || !resultSchema.safeParse(parsed.value).success) {
    throw new ReleaseInputError("D1 gate result must be one successful result with one exact PASS row");
  }
  console.log("PASS: exact D1 gate result");
}

const parsed = parseArguments(process.argv.slice(2), {
  required: ["--input"],
});
if (parsed.help) {
  console.log("Usage: validate-d1-gate-result.mjs --input <wrangler-json>");
} else {
  await mainBoundary(() => validate(parsed.input));
}

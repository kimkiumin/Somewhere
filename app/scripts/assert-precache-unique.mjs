import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = process.argv[2] ?? "dist";
const serviceWorkerPath = resolve(outputDirectory, "sw.js");
const serviceWorker = await readFile(serviceWorkerPath, "utf8");
const urls = [...serviceWorker.matchAll(/\{\s*url:(["'])(.*?)\1/g)].map((match) => match[2]);

if (urls.length === 0) {
  throw new Error(`No precache URLs found in ${serviceWorkerPath}.`);
}

const duplicates = [...new Set(urls.filter((url, index) => urls.indexOf(url) !== index))];
if (duplicates.length > 0) {
  throw new Error(`Duplicate precache URLs: ${duplicates.join(", ")}`);
}

console.log(`Verified ${urls.length} unique precache URLs in ${serviceWorkerPath}.`);

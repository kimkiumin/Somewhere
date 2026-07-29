import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = process.argv[2] ?? "dist";
const profile = process.argv[3] ?? "production";
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

const approvedStaticUrl =
  /^(?:index\.html|manifest\.webmanifest|apple-touch-icon\.png|icons\/(?:icon-(?:192|512)|maskable-512)\.png|assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(?:avif|css|js|png|svg|webp))$/;
const normalizedUrls = urls.map((url) =>
  new URL(url, "https://pwa.invalid").pathname.replace(/^\/(?:Somewhere\/)?/, ""),
);
const unapprovedUrls = normalizedUrls.filter((url) => !approvedStaticUrl.test(url));
if (unapprovedUrls.length > 0) {
  throw new Error(`Unapproved precache URLs: ${unapprovedUrls.join(", ")}`);
}

if (profile === "production") {
  const privateMarkers =
    /(?:api|constraint|diagnostic|feedback|field|harness|journey|route|showcase|source.?map|testkit|trace)/i;
  const privateUrls = normalizedUrls.filter((url) => privateMarkers.test(url));
  if (privateUrls.length > 0) {
    throw new Error(`Private production precache URLs: ${privateUrls.join(", ")}`);
  }
}

console.log(`Verified ${urls.length} unique ${profile} precache URLs in ${serviceWorkerPath}.`);

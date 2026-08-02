import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { run } from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const validator = resolve(repo, "scripts/release/validate-https-origin.mjs");

describe("Approved staging origin", () => {
  test("accepts only one normalized credential-free HTTPS origin", () => {
    expect(run(repo, ["bun", validator, "--origin", "https://stage.example.com"]).exitCode).toBe(0);
    for (const value of [
      "http://stage.example.com",
      "https://user@stage.example.com",
      "https://stage.example.com/",
      "https://stage.example.com/path",
      "https://stage.example.com?query=1",
      "https://stage.example.com#fragment",
    ]) {
      expect(run(repo, ["bun", validator, "--origin", value]).exitCode).not.toBe(0);
    }
  });
});

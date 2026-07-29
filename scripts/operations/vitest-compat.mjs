const forwarded = process.argv.slice(2).filter((argument) => argument !== "--runInBand");
const child = Bun.spawn([process.execPath, "x", "vitest", "run", ...forwarded], {
  cwd: process.cwd(),
  stderr: "inherit",
  stdout: "inherit",
});

process.exit(await child.exited);

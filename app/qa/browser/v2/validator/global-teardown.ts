import { readFile, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

const receiptSchema = z
  .object({
    pid: z.number().int().positive(),
    port: z.literal(8787),
    runDir: z.string().min(1),
    stateDir: z.string(),
  })
  .strict()
  .readonly();

export default async function globalTeardown(): Promise<void> {
  const evidenceDir = process.env.V2_EVIDENCE_DIR ?? "../.omo/evidence/task-19";
  const parsed = receiptSchema.safeParse(
    JSON.parse(await readFile(path.join(evidenceDir, "process-start.json"), "utf8")),
  );
  if (
    !parsed.success ||
    !isSafeRunDir(parsed.data.runDir) ||
    parsed.data.stateDir !== path.join(parsed.data.runDir, "state")
  ) {
    throw new TypeError("V2 QA process receipt is invalid");
  }
  let processAlive = true;
  try {
    process.kill(-parsed.data.pid, "SIGTERM");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      processAlive = false;
    } else {
      throw error;
    }
  }
  for (let attempt = 0; processAlive && attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      process.kill(parsed.data.pid, 0);
    } catch {
      processAlive = false;
    }
  }
  if (processAlive) {
    throw new TypeError("V2 QA Worker did not stop");
  }
  await rm(parsed.data.runDir, { force: true, recursive: true });
  const portClosed = !(await portIsOpen(parsed.data.port));
  await writeFile(
    path.join(evidenceDir, "process-cleanup.json"),
    `${JSON.stringify({
      exitCode: 0,
      pid: parsed.data.pid,
      port: parsed.data.port,
      portClosed,
      stateRemoved: true,
    })}\n`,
  );
  if (!portClosed) {
    throw new TypeError("V2 QA port remains open");
  }
}

function isSafeRunDir(runDir: string): boolean {
  const resolved = path.resolve(runDir);
  return (
    path.dirname(resolved) === path.resolve(tmpdir()) &&
    /^somewhere-v2-qa\.[A-Za-z0-9.]+$/.test(path.basename(resolved))
  );
}

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

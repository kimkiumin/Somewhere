import { z } from "zod";
import type { AdmissionState } from "../admission/admission";
import type { MeterId } from "../admission/meter";

const logRecordSchema = z
  .object({
    admissionState: z.string().max(32).optional(),
    durationBucket: z.enum(["lt10", "lt50", "lt250", "lt1000", "gte1000"]).optional(),
    environment: z.enum(["local", "staging", "production"]),
    errorCode: z
      .string()
      .regex(/^[a-z0-9_.-]{1,64}$/)
      .optional(),
    event: z.enum([
      "admission_decision",
      "meter_sample",
      "operation_completed",
      "operation_failed",
      "release_gate",
      "restore_check",
    ]),
    meterId: z.string().max(64).optional(),
    outcome: z.enum(["allowed", "blocked", "completed", "failed", "pass"]),
    requestId: z
      .string()
      .regex(/^req_v1\.[A-Za-z0-9_-]{16,64}$/)
      .optional(),
    schemaVersion: z.literal(1),
    writeEpoch: z.number().int().positive().optional(),
  })
  .strict()
  .readonly();

export type LogSink = Readonly<{ write: (serializedRecord: string) => void }>;

export type OperationalLogInput = Readonly<{
  admissionState?: AdmissionState;
  durationMs?: number;
  environment: "local" | "staging" | "production";
  errorCode?: string;
  event:
    | "admission_decision"
    | "meter_sample"
    | "operation_completed"
    | "operation_failed"
    | "release_gate"
    | "restore_check";
  meterId?: MeterId;
  outcome: "allowed" | "blocked" | "completed" | "failed" | "pass";
  requestId?: string;
  writeEpoch?: number;
}>;

export class RedactedOperationalLogger {
  constructor(private readonly sink: LogSink) {}

  write(input: OperationalLogInput): void {
    const record = logRecordSchema.parse({
      admissionState: input.admissionState,
      durationBucket: bucketDuration(input.durationMs),
      environment: input.environment,
      errorCode: input.errorCode,
      event: input.event,
      meterId: input.meterId,
      outcome: input.outcome,
      requestId: input.requestId,
      schemaVersion: 1,
      writeEpoch: input.writeEpoch,
    });
    const serialized = JSON.stringify(record);
    queueMicrotask(() => {
      try {
        this.sink.write(serialized);
      } catch {
        return;
      }
    });
  }
}

function bucketDuration(durationMs: number | undefined) {
  if (durationMs === undefined) {
    return undefined;
  }
  if (durationMs < 10) {
    return "lt10" as const;
  }
  if (durationMs < 50) {
    return "lt50" as const;
  }
  if (durationMs < 250) {
    return "lt250" as const;
  }
  if (durationMs < 1_000) {
    return "lt1000" as const;
  }
  return "gte1000" as const;
}

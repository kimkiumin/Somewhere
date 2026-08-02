import { z } from "zod";

export const ASYNC_MESSAGE_MAX_BYTES = 64 * 1_024;
export const MAX_DELIVERY_ATTEMPTS = 5;
const QUEUE_CHUNK_BYTES = 64_000;
const QUEUE_ENVELOPE_BYTES = 100;
const RETRY_DELAYS_SECONDS = [5, 30, 120, 600] as const;
const WRITE_OPERATIONS = 1;
const INITIAL_READ_OPERATIONS = 1;
const DELETE_OPERATIONS = 1;
const POISON_DLQ_WRITE_OPERATIONS = 1;

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const eventTypeSchema = z.enum([
  "journey.activation.repair",
  "journey.feedback.schedule",
  "journey.expire",
  "session.expire",
  "receipt.prepared.cleanup",
  "journey.deletion.reconcile",
]);

const asyncMessageSchema = z
  .object({
    eventDigest: digestSchema,
    eventId: z.string().regex(/^evt_v1\.[a-f0-9]{48}$/),
    eventType: eventTypeSchema,
    occurredAt: z.number().int().positive(),
    schemaVersion: z.literal(1),
    subjectDigest: digestSchema,
    writeEpoch: z.number().int().positive(),
  })
  .strict()
  .readonly();

const poisonMessageSchema = z
  .object({
    failedAt: z.number().int().positive(),
    failureCode: z.enum(["consumer_failed", "invalid_message"]),
    originalEventDigest: digestSchema,
    originalEventId: z.string().regex(/^evt_v1\.[a-f0-9]{48}$/),
    schemaVersion: z.literal(1),
  })
  .strict()
  .readonly();

export type AsyncEventType = z.infer<typeof eventTypeSchema>;
export type AsyncMessage = z.infer<typeof asyncMessageSchema>;
export type PoisonMessage = z.infer<typeof poisonMessageSchema>;

export type AsyncMessageInput = Readonly<{
  eventType: AsyncEventType;
  occurredAt: number;
  subjectDigest: string;
  writeEpoch: number;
}>;

export class AsyncMessageIntegrityError extends Error {
  override readonly name = "AsyncMessageIntegrityError";

  constructor(readonly code: "digest_mismatch" | "id_mismatch") {
    super(`Queue event ${code.replace("_", " ")}`);
  }
}

export class AsyncMessageSerializationError extends Error {
  override readonly name = "AsyncMessageSerializationError";

  constructor() {
    super("Queue message must be JSON serializable");
  }
}

export async function buildAsyncMessage(input: AsyncMessageInput): Promise<AsyncMessage> {
  const payload = eventPayload(input);
  const eventDigest = await sha256(payload);
  return asyncMessageSchema.parse({
    ...input,
    eventDigest,
    eventId: `evt_v1.${eventDigest.slice(0, 48)}`,
    schemaVersion: 1,
  });
}

export async function parseAsyncMessage(value: unknown): Promise<AsyncMessage> {
  const bytes = serializedBytes(value);
  if (bytes >= ASYNC_MESSAGE_MAX_BYTES) {
    throw new RangeError("Queue message must stay below 64 KiB");
  }
  const message = asyncMessageSchema.parse(value);
  const expectedDigest = await sha256(eventPayload(message));
  if (message.eventDigest !== expectedDigest) {
    throw new AsyncMessageIntegrityError("digest_mismatch");
  }
  if (message.eventId !== `evt_v1.${expectedDigest.slice(0, 48)}`) {
    throw new AsyncMessageIntegrityError("id_mismatch");
  }
  return message;
}

export function parsePoisonMessage(value: unknown): PoisonMessage {
  return poisonMessageSchema.parse(value);
}

export function buildPoisonMessage(
  input: Readonly<{
    failedAt: number;
    failureCode: PoisonMessage["failureCode"];
    message: AsyncMessage;
  }>,
): PoisonMessage {
  return poisonMessageSchema.parse({
    failedAt: input.failedAt,
    failureCode: input.failureCode,
    originalEventDigest: input.message.eventDigest,
    originalEventId: input.message.eventId,
    schemaVersion: 1,
  });
}

export async function buildInvalidPoisonMessage(
  value: unknown,
  failedAt: number,
): Promise<PoisonMessage> {
  const serialized = serializeForFingerprint(value);
  const eventDigest = await sha256(`somewhere.invalid-async.v1\0${serialized}`);
  return poisonMessageSchema.parse({
    failedAt,
    failureCode: "invalid_message",
    originalEventDigest: eventDigest,
    originalEventId: `evt_v1.${eventDigest.slice(0, 48)}`,
    schemaVersion: 1,
  });
}

export function retryDecision(
  attempts: number,
):
  | Readonly<{ delaySeconds: (typeof RETRY_DELAYS_SECONDS)[number]; kind: "retry" }>
  | Readonly<{ kind: "poison" }> {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_DELIVERY_ATTEMPTS) {
    throw new RangeError("Queue delivery attempts must be an integer from 1 through 5");
  }
  const delaySeconds = RETRY_DELAYS_SECONDS[attempts - 1];
  return delaySeconds === undefined ? { kind: "poison" } : { delaySeconds, kind: "retry" };
}

export function queueOperationReservation(bodyBytes: number): number {
  if (!Number.isInteger(bodyBytes) || bodyBytes < 1 || bodyBytes >= ASYNC_MESSAGE_MAX_BYTES) {
    throw new RangeError("Queue body bytes must be a positive integer below 64 KiB");
  }
  const chunks = Math.ceil((bodyBytes + QUEUE_ENVELOPE_BYTES) / QUEUE_CHUNK_BYTES);
  const operationsPerChunk =
    WRITE_OPERATIONS +
    INITIAL_READ_OPERATIONS +
    (MAX_DELIVERY_ATTEMPTS - 1) +
    DELETE_OPERATIONS +
    POISON_DLQ_WRITE_OPERATIONS;
  return chunks * operationsPerChunk;
}

export function serializedBytes(value: unknown): number {
  const serialized = serializeQueueValue(value);
  return new TextEncoder().encode(serialized).byteLength;
}

function serializeQueueValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new AsyncMessageSerializationError();
    }
    return serialized;
  } catch (error) {
    if (error instanceof AsyncMessageSerializationError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new AsyncMessageSerializationError();
    }
    throw error;
  }
}

function serializeForFingerprint(value: unknown): string {
  try {
    return serializeQueueValue(value);
  } catch (error) {
    if (error instanceof AsyncMessageSerializationError) {
      return "unserializable";
    }
    throw error;
  }
}

function eventPayload(input: AsyncMessageInput): string {
  return [
    "somewhere.async.v1",
    input.eventType,
    input.subjectDigest,
    String(input.writeEpoch),
    String(input.occurredAt),
  ].join("\0");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

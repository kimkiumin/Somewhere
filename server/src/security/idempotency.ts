import { hmacDigest, isCanonicalToken } from "./tokens";

const REPLAY_TTL_MS = 24 * 60 * 60 * 1_000;

export type ReplayRecord = Readonly<{
  expiresAt: number;
  fingerprint: string;
  responseBody: string;
  status: number;
}>;

export interface ReplayRepository {
  find(scopeDigest: string): Promise<ReplayRecord | undefined>;
  save(scopeDigest: string, record: ReplayRecord): Promise<void>;
}

export class InMemoryReplayRepository implements ReplayRepository {
  readonly #records = new Map<string, ReplayRecord>();

  async find(scopeDigest: string): Promise<ReplayRecord | undefined> {
    return this.#records.get(scopeDigest);
  }

  async save(scopeDigest: string, record: ReplayRecord): Promise<void> {
    this.#records.set(scopeDigest, record);
  }
}

export type ReplayDecision =
  | Readonly<{ kind: "new"; complete(status: number, body: string): Promise<void> }>
  | Readonly<{ kind: "replay"; body: string; status: number }>
  | Readonly<{ kind: "conflict" }>;

export class IdempotencyService {
  readonly #pending = new Map<
    string,
    Readonly<{
      fingerprint: string;
      outcome: Promise<ReplayRecord>;
      resolve(record: ReplayRecord): void;
    }>
  >();

  constructor(
    private readonly repository: ReplayRepository,
    private readonly hmacKey: CryptoKey,
  ) {}

  async lookup(
    rawKey: string,
    scope: string,
    fingerprintInput: Readonly<{
      body: unknown;
      contractVersion: 1;
      expectedSequence: string;
      method: string;
      objectId: string;
      routeTemplate: string;
    }>,
    now: number,
  ): Promise<ReplayDecision> {
    if (!isCanonicalToken(rawKey, "ik_v1", 32)) {
      return { kind: "conflict" };
    }
    const scopeDigest = await hmacDigest(this.hmacKey, `${scope}\0${rawKey}`);
    const fingerprint = await sha256(canonicalize(fingerprintInput));
    const existing = await this.repository.find(scopeDigest);
    if (existing !== undefined && existing.expiresAt > now) {
      return existing.fingerprint === fingerprint
        ? { body: existing.responseBody, kind: "replay", status: existing.status }
        : { kind: "conflict" };
    }
    const pending = this.#pending.get(scopeDigest);
    if (pending !== undefined) {
      if (pending.fingerprint !== fingerprint) {
        return { kind: "conflict" };
      }
      const outcome = await pending.outcome;
      return { body: outcome.responseBody, kind: "replay", status: outcome.status };
    }
    let resolveOutcome: ((record: ReplayRecord) => void) | undefined;
    const outcome = new Promise<ReplayRecord>((resolve) => {
      resolveOutcome = resolve;
    });
    if (resolveOutcome === undefined) {
      throw new TypeError("idempotency outcome resolver unavailable");
    }
    this.#pending.set(scopeDigest, { fingerprint, outcome, resolve: resolveOutcome });
    return {
      kind: "new",
      complete: async (status, body) => {
        const record = {
          expiresAt: now + REPLAY_TTL_MS,
          fingerprint,
          responseBody: body,
          status,
        };
        await this.repository.save(scopeDigest, record);
        this.#pending.get(scopeDigest)?.resolve(record);
        this.#pending.delete(scopeDigest);
      },
    };
  }
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new TypeError("canonical JSON accepts safe non-negative-zero integers only");
    }
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  throw new TypeError("canonical JSON rejects unsupported values");
}

function sha256(value: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(value))
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
}

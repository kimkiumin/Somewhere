import type { Database } from "../db/database";
import type { SessionRecord, SessionRepository } from "../security/session";
import { importHmacKey, randomBase64Url } from "../security/tokens";

type SessionRow = Readonly<{
  binding_digest: string;
  csrf_digest: string;
  csrf_expires_at: number;
  expires_at: number;
}>;

type KeyRow = Readonly<{ key_material: string }>;

export class D1HttpSessionRepository implements SessionRepository {
  constructor(private readonly database: Database) {}

  async find(bindingDigest: string): Promise<SessionRecord | undefined> {
    const value = await this.database
      .prepare(
        "SELECT binding_digest, csrf_digest, csrf_expires_at, expires_at FROM http_sessions WHERE binding_digest = ?",
      )
      .bind(bindingDigest)
      .first();
    if (!isSessionRow(value)) {
      return undefined;
    }
    return {
      bindingDigest: value.binding_digest,
      csrfDigest: value.csrf_digest,
      csrfExpiresAt: value.csrf_expires_at,
      expiresAt: value.expires_at,
    };
  }

  async save(record: SessionRecord): Promise<void> {
    await this.database
      .prepare(
        "INSERT INTO http_sessions (binding_digest, csrf_digest, csrf_expires_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(binding_digest) DO UPDATE SET csrf_digest = excluded.csrf_digest, csrf_expires_at = excluded.csrf_expires_at, expires_at = excluded.expires_at",
      )
      .bind(record.bindingDigest, record.csrfDigest, record.csrfExpiresAt, record.expiresAt)
      .run();
  }
}

export async function loadSessionHmacKey(database: Database): Promise<CryptoKey> {
  const candidate = randomBase64Url(32);
  await database
    .prepare(
      "INSERT INTO http_runtime_keys (key_name, key_material) VALUES ('session-hmac-v1', ?) ON CONFLICT(key_name) DO NOTHING",
    )
    .bind(candidate)
    .run();
  const value = await database
    .prepare("SELECT key_material FROM http_runtime_keys WHERE key_name = 'session-hmac-v1'")
    .first();
  if (!isKeyRow(value)) {
    throw new TypeError("session key is unavailable");
  }
  return importHmacKey(Buffer.from(value.key_material, "base64url"));
}

function isSessionRow(value: unknown): value is SessionRow {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return (
    "binding_digest" in value &&
    typeof value.binding_digest === "string" &&
    "csrf_digest" in value &&
    typeof value.csrf_digest === "string" &&
    "csrf_expires_at" in value &&
    typeof value.csrf_expires_at === "number" &&
    "expires_at" in value &&
    typeof value.expires_at === "number"
  );
}

function isKeyRow(value: unknown): value is KeyRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "key_material" in value &&
    typeof value.key_material === "string"
  );
}

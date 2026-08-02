import { z } from "zod";
import { OPERATIONS_POLICY_V1 } from "../../../contracts/src/policy";
import type { Database } from "../db/database";
import { firstParsed } from "../db/database";
import {
  contentDigest,
  type VerifiedLegalGateInput,
  VerifiedLegalGateRepository,
} from "./legal-gate-repository";
import { type MeterCollection, prepareOperationsMeterCollection } from "./meter-collector";
import {
  createPostgresDecisionReceipt,
  PostgresDecisionRepository,
  PostgresTriggerFactsSchema,
} from "./postgres-decision";
import { reconcileOperationsState } from "./reconciler";

const AUTHORITY_URL = "https://operations-authority.internal/v1/snapshot";
const MAX_AUTHORITY_BODY_BYTES = 65_536;
const MAX_CLOCK_SKEW_MS = 300_000;
const NONCE_TTL_MS = 600_000;
const COMMAND_TTL_MS = 180 * 24 * 60 * 60 * 1_000;
const FAILURE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const rawDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const deploymentSchema = z
  .object({
    release_digest: rawDigestSchema,
    write_epoch: z.number().int().positive(),
  })
  .strict();
const commandSchema = z
  .object({
    captured_at: z.number().int().positive(),
    payload_digest: rawDigestSchema,
    status: z.enum(["PENDING", "APPLIED", "FAILED"]),
  })
  .strict();
const meterSchema = z
  .object({
    expiresAt: z.number().int().positive(),
    immediateObserved: z.number().int().nonnegative().nullable(),
    immediateObservedAt: z.number().int().positive().nullable(),
    meterId: z.enum(OPERATIONS_POLICY_V1.meterIds),
    platformObserved: z.number().int().nonnegative().nullable(),
    platformObservedAt: z.number().int().positive().nullable(),
    resetConfirmed: z.boolean(),
    unrelatedBaseline: z.number().int().nonnegative(),
    uncertaintyReserve: z.number().int().nonnegative(),
    windowEndUtc: z.number().int().positive(),
    windowStartUtc: z.number().int().positive(),
  })
  .strict();
const artifactSchema = z
  .object({
    content: z.string().min(2).max(32_768),
    contentDigest: digestSchema,
  })
  .strict();
const authoritySchema = z
  .object({
    capturedAt: z.number().int().positive(),
    commandId: z.string().regex(/^opauth_v1\.[A-Za-z0-9_-]{10,86}$/u),
    environment: z.enum(["staging", "production"]),
    korea: artifactSchema,
    meters: z.array(meterSchema).length(15),
    postgresFacts: PostgresTriggerFactsSchema,
    provider: artifactSchema,
    releaseDigest: digestSchema,
    schemaVersion: z.literal(1),
    writeEpoch: z.number().int().positive(),
  })
  .strict();
const originsSchema = z.array(z.string().url()).min(1).max(8);
const conditionsSchema = z.array(z.string().min(1).max(96)).max(16);

type DeployedEnvironment = "staging" | "production";
type AuthorityEnvelope = z.infer<typeof authoritySchema>;
type AuthorityFetcher = Pick<Fetcher, "fetch">;

export type OperationsAuthorityBindings = Readonly<{
  DB: Database;
  ENVIRONMENT: DeployedEnvironment;
  OPERATIONS_AUTHORITY?: AuthorityFetcher;
  OPERATIONS_AUTHORITY_HMAC_KEY?: string;
  OPERATIONS_AUTHORITY_KEY_ID?: string;
  OPERATIONS_DATA_FLOW_DIGEST?: string;
  OPERATIONS_PROVIDER_ADAPTER_VERSION?: string;
  OPERATIONS_PROVIDER_ID?: string;
  OPERATIONS_PROVIDER_ORIGINS?: string;
  OPERATIONS_RELEASE_DIGEST?: string;
  OPERATIONS_REPRESENTED_CONDITION_GATES?: string;
  OPERATIONS_RETENTION_POLICY_DIGEST?: string;
  OPERATIONS_REVIEWER_DIGEST?: string;
}>;

type AuthorityConfig = Readonly<{
  adapterVersion: string;
  authority: AuthorityFetcher;
  dataFlowDigest: string;
  environment: DeployedEnvironment;
  hmacKey: string;
  keyId: string;
  providerId: string;
  providerOrigins: readonly string[];
  releaseDigest: string;
  representedConditionGates: readonly string[];
  retentionPolicyDigest: string;
  reviewerDigest: string;
}>;

export async function runOperationsAuthorityCycle(
  bindings: OperationsAuthorityBindings,
  now: number,
): Promise<boolean> {
  try {
    await pruneExpiredOperationsState(bindings.DB, now);
    const config = parseAuthorityConfig(bindings);
    const deployment = await loadDeployment(bindings.DB, config.environment);
    assertDeploymentIdentity(config, deployment);
    const fetched = await fetchAuthority(config, deployment.write_epoch, now);
    const envelope = await authenticateResponse(
      bindings.DB,
      config,
      deployment.write_epoch,
      fetched,
      now,
    );
    const command = await reserveCommand(bindings.DB, config.environment, envelope, fetched.body);
    if (command === "replay") {
      await reconcileOperationsState(bindings.DB, config.environment, now, envelope.capturedAt);
      await pruneExpiredOperationsState(bindings.DB, now);
      return true;
    }
    try {
      await applyEnvelope(bindings.DB, config, envelope, fetched.body);
      await markCommand(bindings.DB, config.environment, envelope.commandId, "APPLIED", null, now);
    } catch (error) {
      await markCommand(
        bindings.DB,
        config.environment,
        envelope.commandId,
        "FAILED",
        failureCode(error),
        now,
      );
      throw error;
    }
    await reconcileOperationsState(bindings.DB, config.environment, now, envelope.capturedAt);
    await pruneExpiredOperationsState(bindings.DB, now);
    return true;
  } catch (error) {
    await recordAuthorityFailure(bindings.DB, bindings.ENVIRONMENT, failureCode(error), now);
    return false;
  }
}

export async function authorityResponseSignature(
  input: Readonly<{
    body: string;
    environment: DeployedEnvironment;
    hmacKey: string;
    keyId: string;
    nonce: string;
    releaseDigest: string;
    timestamp: number;
    writeEpoch: number;
  }>,
): Promise<string> {
  const bodyDigest = await contentDigest(input.body);
  return signHmac(
    input.hmacKey,
    responseCanonicalText({
      ...input,
      bodyDigest,
    }),
  );
}

async function fetchAuthority(
  config: AuthorityConfig,
  writeEpoch: number,
  now: number,
): Promise<Readonly<{ body: string; headers: Headers }>> {
  const requestBody = JSON.stringify({
    environment: config.environment,
    releaseDigest: config.releaseDigest,
    schemaVersion: 1,
    timestamp: now,
    writeEpoch,
  });
  const requestDigest = await contentDigest(requestBody);
  const requestSignature = await signHmac(
    config.hmacKey,
    [
      "v1",
      "POST",
      "/v1/snapshot",
      "operations-authority.internal",
      config.environment,
      config.releaseDigest,
      String(writeEpoch),
      String(now),
      requestDigest,
    ].join("\n"),
  );
  const response = await config.authority.fetch(AUTHORITY_URL, {
    body: requestBody,
    headers: {
      "content-type": "application/json",
      "x-somewhere-authority-key-id": config.keyId,
      "x-somewhere-authority-signature": `v1=${requestSignature}`,
      "x-somewhere-authority-timestamp": String(now),
    },
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) {
    throw new AuthorityBoundaryError("source_status");
  }
  if (response.headers.get("content-type") !== "application/json") {
    throw new AuthorityBoundaryError("source_content_type");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUTHORITY_BODY_BYTES) {
    throw new AuthorityBoundaryError("source_body_oversized");
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_AUTHORITY_BODY_BYTES) {
    throw new AuthorityBoundaryError("source_body_oversized");
  }
  return { body, headers: response.headers };
}

async function authenticateResponse(
  database: Database,
  config: AuthorityConfig,
  writeEpoch: number,
  fetched: Readonly<{ body: string; headers: Headers }>,
  now: number,
): Promise<AuthorityEnvelope> {
  const timestamp = parseTimestamp(fetched.headers.get("x-somewhere-authority-timestamp"));
  const nonce = fetched.headers.get("x-somewhere-authority-nonce") ?? "";
  const keyId = fetched.headers.get("x-somewhere-authority-key-id") ?? "";
  const signature = fetched.headers.get("x-somewhere-authority-signature") ?? "";
  if (
    Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS ||
    !/^nonce_v1\.[A-Za-z0-9_-]{22,64}$/u.test(nonce) ||
    keyId !== config.keyId ||
    !/^v1=[a-f0-9]{64}$/u.test(signature)
  ) {
    throw new AuthorityBoundaryError("response_auth_invalid");
  }
  const canonical = responseCanonicalText({
    bodyDigest: await contentDigest(fetched.body),
    environment: config.environment,
    keyId,
    nonce,
    releaseDigest: config.releaseDigest,
    timestamp,
    writeEpoch,
  });
  if (!(await verifyHmac(config.hmacKey, canonical, signature.slice(3)))) {
    throw new AuthorityBoundaryError("response_signature_invalid");
  }
  const parsedBody: unknown = parseJson(fetched.body);
  const envelope = authoritySchema.parse(parsedBody);
  if (
    envelope.environment !== config.environment ||
    envelope.releaseDigest !== config.releaseDigest ||
    envelope.writeEpoch !== writeEpoch ||
    envelope.capturedAt > now + 60_000 ||
    now - envelope.capturedAt > MAX_CLOCK_SKEW_MS
  ) {
    throw new AuthorityBoundaryError("response_identity_mismatch");
  }
  await reserveNonce(database, config.environment, keyId, nonce, now);
  return envelope;
}

async function applyEnvelope(
  database: Database,
  config: AuthorityConfig,
  envelope: AuthorityEnvelope,
  body: string,
): Promise<void> {
  const payloadDigest = await contentDigest(body);
  const collection: MeterCollection = {
    authorityDigest: payloadDigest.slice(7),
    capturedAt: envelope.capturedAt,
    meters: envelope.meters,
  };
  const legalInput: VerifiedLegalGateInput = {
    context: {
      adapterVersion: config.adapterVersion,
      dataFlowDigest: config.dataFlowDigest,
      endpointOrigins: config.providerOrigins,
      environment: config.environment,
      nowIso: new Date(envelope.capturedAt).toISOString(),
      providerId: config.providerId,
      releaseDigest: config.releaseDigest,
      representedConditionGates: config.representedConditionGates,
      retentionPolicyDigest: config.retentionPolicyDigest,
    },
    korea: {
      content: envelope.korea.content,
      expectedContentDigest: envelope.korea.contentDigest,
    },
    provider: {
      content: envelope.provider.content,
      expectedContentDigest: envelope.provider.contentDigest,
    },
  };
  const legal = await new VerifiedLegalGateRepository(database).prepare(legalInput);
  if (legal.result.verdict !== "PASS" || legal.statement === undefined) {
    throw new AuthorityBoundaryError("legal_verification_block");
  }
  const decision = await createPostgresDecisionReceipt({
    decidedAt: new Date(envelope.capturedAt).toISOString(),
    facts: envelope.postgresFacts,
    reviewedReleaseDigest: config.releaseDigest,
    reviewerDigest: config.reviewerDigest,
  });
  const batch = database.batch;
  if (batch === undefined) {
    throw new AuthorityBoundaryError("authority_atomic_batch_missing");
  }
  await batch.call(database, [
    legal.statement,
    prepareOperationsMeterCollection(collection, database),
    new PostgresDecisionRepository(database).prepare(decision),
  ]);
}

async function loadDeployment(
  database: Database,
  environment: DeployedEnvironment,
): Promise<z.infer<typeof deploymentSchema>> {
  const deployment = await firstParsed(
    database
      .prepare(
        `SELECT admission.release_digest, fence.write_epoch
         FROM operations_admission_state AS admission
         JOIN operations_write_fence AS fence ON fence.environment = admission.environment
         WHERE admission.environment = ? AND fence.mode = 'OPEN'`,
      )
      .bind(environment),
    deploymentSchema,
  );
  if (deployment === null) {
    throw new AuthorityBoundaryError("deployment_not_open");
  }
  return deployment;
}

function assertDeploymentIdentity(
  config: AuthorityConfig,
  deployment: z.infer<typeof deploymentSchema>,
): void {
  if (deployment.release_digest !== config.releaseDigest.slice(7)) {
    throw new AuthorityBoundaryError("deployment_release_mismatch");
  }
}

async function reserveNonce(
  database: Database,
  environment: DeployedEnvironment,
  keyId: string,
  nonce: string,
  now: number,
): Promise<void> {
  const keyIdDigest = (await contentDigest(keyId)).slice(7);
  const nonceDigest = (await contentDigest(nonce)).slice(7);
  const existing = await database
    .prepare(
      `SELECT 1 FROM operations_authority_nonces
       WHERE environment = ? AND key_id_digest = ? AND nonce_digest = ?`,
    )
    .bind(environment, keyIdDigest, nonceDigest)
    .first();
  if (existing !== null) {
    throw new AuthorityBoundaryError("response_nonce_replay");
  }
  await database
    .prepare(
      `INSERT INTO operations_authority_nonces (
         environment, key_id_digest, nonce_digest, received_at, expires_at
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(environment, keyIdDigest, nonceDigest, now, now + NONCE_TTL_MS)
    .run();
}

async function reserveCommand(
  database: Database,
  environment: DeployedEnvironment,
  envelope: AuthorityEnvelope,
  body: string,
): Promise<"new" | "replay"> {
  const payloadDigest = (await contentDigest(body)).slice(7);
  const existing = await firstParsed(
    database
      .prepare(
        `SELECT payload_digest, status, captured_at
         FROM operations_authority_commands
         WHERE environment = ? AND command_id = ?`,
      )
      .bind(environment, envelope.commandId),
    commandSchema,
  );
  if (existing !== null) {
    if (
      existing.status === "APPLIED" &&
      existing.payload_digest === payloadDigest &&
      existing.captured_at === envelope.capturedAt
    ) {
      return "replay";
    }
    throw new AuthorityBoundaryError("command_replay_conflict");
  }
  await database
    .prepare(
      `INSERT INTO operations_authority_commands (
         environment, command_id, payload_digest, status, failure_code,
         captured_at, applied_at, expires_at
       ) VALUES (?, ?, ?, 'PENDING', NULL, ?, NULL, ?)`,
    )
    .bind(
      environment,
      envelope.commandId,
      payloadDigest,
      envelope.capturedAt,
      envelope.capturedAt + COMMAND_TTL_MS,
    )
    .run();
  return "new";
}

async function markCommand(
  database: Database,
  environment: DeployedEnvironment,
  commandId: string,
  status: "APPLIED" | "FAILED",
  code: string | null,
  now: number,
): Promise<void> {
  await database
    .prepare(
      `UPDATE operations_authority_commands
       SET status = ?, failure_code = ?, applied_at = ?
       WHERE environment = ? AND command_id = ? AND status = 'PENDING'`,
    )
    .bind(status, code, now, environment, commandId)
    .run();
}

async function recordAuthorityFailure(
  database: Database,
  environment: DeployedEnvironment,
  code: string,
  now: number,
): Promise<void> {
  const receiptId = (await contentDigest(`${environment}\0${now}\0${code}`)).slice(7);
  const batch = database.batch;
  const statements = [
    ...expiredOperationsStatements(database, now),
    database
      .prepare(
        `UPDATE operations_admission_state
         SET state = 'METER_BLOCK', fresh_recovery_samples = 0, updated_at = ?
         WHERE environment = ?`,
      )
      .bind(now, environment),
    database
      .prepare("DELETE FROM operations_recovery_authorities WHERE environment = ?")
      .bind(environment),
    database
      .prepare(
        `INSERT OR IGNORE INTO operations_authority_failures (
           receipt_id, environment, failure_code, occurred_at, expires_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(receiptId, environment, code, now, now + FAILURE_TTL_MS),
  ];
  if (batch === undefined) {
    for (const statement of statements) {
      await statement.run();
    }
    return;
  }
  await batch.call(database, statements);
}

async function pruneExpiredOperationsState(database: Database, now: number): Promise<void> {
  const statements = expiredOperationsStatements(database, now);
  const batch = database.batch;
  if (batch === undefined) {
    for (const statement of statements) {
      await statement.run();
    }
    return;
  }
  await batch.call(database, statements);
}

function expiredOperationsStatements(database: Database, now: number) {
  return [
    database.prepare("DELETE FROM operations_authority_nonces WHERE expires_at <= ?").bind(now),
    database.prepare("DELETE FROM operations_authority_commands WHERE expires_at <= ?").bind(now),
    database.prepare("DELETE FROM operations_authority_failures WHERE expires_at <= ?").bind(now),
    database.prepare("DELETE FROM operations_postgres_decisions WHERE expires_at <= ?").bind(now),
    database.prepare("DELETE FROM operations_health_rollups WHERE expires_at <= ?").bind(now),
    database.prepare("DELETE FROM operations_release_gates WHERE expires_at <= ?").bind(now),
    database
      .prepare("DELETE FROM operations_verified_legal_artifacts WHERE expires_at <= ?")
      .bind(now),
    database.prepare("DELETE FROM operations_journey_envelopes WHERE expires_at <= ?").bind(now),
    database
      .prepare(
        `DELETE FROM operations_meter_windows
         WHERE expires_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM operations_meter_reservations AS reservation
             WHERE reservation.meter_id = operations_meter_windows.meter_id
               AND reservation.window_start_utc = operations_meter_windows.window_start_utc
               AND reservation.reservation_state = 'reserved'
               AND reservation.expires_at > ?
           )`,
      )
      .bind(now, now),
  ] as const;
}

function parseAuthorityConfig(bindings: OperationsAuthorityBindings): AuthorityConfig {
  const required = {
    adapterVersion: bindings.OPERATIONS_PROVIDER_ADAPTER_VERSION,
    authority: bindings.OPERATIONS_AUTHORITY,
    dataFlowDigest: bindings.OPERATIONS_DATA_FLOW_DIGEST,
    hmacKey: bindings.OPERATIONS_AUTHORITY_HMAC_KEY,
    keyId: bindings.OPERATIONS_AUTHORITY_KEY_ID,
    providerId: bindings.OPERATIONS_PROVIDER_ID,
    providerOrigins: bindings.OPERATIONS_PROVIDER_ORIGINS,
    releaseDigest: bindings.OPERATIONS_RELEASE_DIGEST,
    representedConditionGates: bindings.OPERATIONS_REPRESENTED_CONDITION_GATES,
    retentionPolicyDigest: bindings.OPERATIONS_RETENTION_POLICY_DIGEST,
    reviewerDigest: bindings.OPERATIONS_REVIEWER_DIGEST,
  };
  if (
    required.authority === undefined ||
    required.hmacKey === undefined ||
    required.hmacKey.length < 32 ||
    required.keyId === undefined ||
    required.adapterVersion === undefined ||
    required.providerId === undefined
  ) {
    throw new AuthorityBoundaryError("authority_config_missing");
  }
  return {
    adapterVersion: required.adapterVersion,
    authority: required.authority,
    dataFlowDigest: digestSchema.parse(required.dataFlowDigest),
    environment: bindings.ENVIRONMENT,
    hmacKey: required.hmacKey,
    keyId: required.keyId,
    providerId: required.providerId,
    providerOrigins: originsSchema.parse(parseJson(required.providerOrigins ?? "")),
    releaseDigest: digestSchema.parse(required.releaseDigest),
    representedConditionGates: conditionsSchema.parse(
      parseJson(required.representedConditionGates ?? ""),
    ),
    retentionPolicyDigest: digestSchema.parse(required.retentionPolicyDigest),
    reviewerDigest: digestSchema.parse(required.reviewerDigest),
  };
}

function responseCanonicalText(
  input: Readonly<{
    bodyDigest: string;
    environment: DeployedEnvironment;
    keyId: string;
    nonce: string;
    releaseDigest: string;
    timestamp: number;
    writeEpoch: number;
  }>,
): string {
  return [
    "v1",
    "RESPONSE",
    "/v1/snapshot",
    "operations-authority.internal",
    input.environment,
    input.releaseDigest,
    String(input.writeEpoch),
    String(input.timestamp),
    input.keyId,
    input.nonce,
    input.bodyDigest,
  ].join("\n");
}

async function signHmac(secret: string, content: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  return bytesToHex(new Uint8Array(signature));
}

async function verifyHmac(secret: string, content: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(signature),
    new TextEncoder().encode(content),
  );
}

function parseTimestamp(value: string | null): number {
  if (value === null || !/^[0-9]{13}$/u.test(value)) {
    throw new AuthorityBoundaryError("response_timestamp_invalid");
  }
  return Number(value);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    return new Uint8Array();
  }
  return Uint8Array.from(value.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

function failureCode(error: unknown): string {
  return error instanceof AuthorityBoundaryError ? error.code : "authority_boundary_failure";
}

class AuthorityBoundaryError extends Error {
  override readonly name = "AuthorityBoundaryError";

  constructor(readonly code: string) {
    super("Operations authority rejected");
  }
}

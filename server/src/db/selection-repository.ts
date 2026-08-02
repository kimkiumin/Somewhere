import { z } from "zod";
import { allParsed, type Database, firstParsed, parseBoundary } from "./database";
import {
  nonnegativeIntegerSchema,
  opaqueIdSchema,
  positiveIntegerSchema,
  sha256DigestSchema,
} from "./values";

const poolSchema = z
  .object({
    pool_id: opaqueIdSchema,
    policy_id: opaqueIdSchema,
    pool_state: z.enum(["building", "sealed", "expired"]),
    pool_version: positiveIntegerSchema,
    member_count: nonnegativeIntegerSchema,
    pool_digest: sha256DigestSchema,
    sealed_at: positiveIntegerSchema.nullable(),
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const memberSchema = z
  .object({
    pool_id: opaqueIdSchema,
    ordinal: nonnegativeIntegerSchema,
    venue_id: opaqueIdSchema,
    evidence_digest: sha256DigestSchema,
    member_digest: sha256DigestSchema,
  })
  .strict()
  .readonly();

const receiptSchema = z
  .object({
    receipt_id: opaqueIdSchema,
    pool_id: opaqueIdSchema,
    policy_digest: sha256DigestSchema,
    randomness_digest: sha256DigestSchema,
    constraint_digest: sha256DigestSchema,
    receipt_state: z.enum(["prepared", "activated", "invalidated"]),
    selected_member_digest: sha256DigestSchema.nullable(),
    receipt_version: positiveIntegerSchema,
    prepared_at: positiveIntegerSchema,
    activated_at: positiveIntegerSchema.nullable(),
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const attemptSchema = z
  .object({
    receipt_id: opaqueIdSchema,
    attempt_number: positiveIntegerSchema,
    remaining_set_digest: sha256DigestSchema,
    candidate_member_digest: sha256DigestSchema,
    validation_result: z.enum(["pending", "accepted", "rejected"]),
    result_digest: sha256DigestSchema.nullable(),
    attempted_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

export type PoolRecord = z.infer<typeof poolSchema>;
export type PoolMemberRecord = z.infer<typeof memberSchema>;
export type SelectionReceiptRecord = z.infer<typeof receiptSchema>;
export type SelectionAttemptRecord = z.infer<typeof attemptSchema>;

export class SelectionRepository {
  constructor(private readonly database: Database) {}

  async insertPool(value: unknown): Promise<PoolRecord> {
    const record = parseBoundary(poolSchema, value);
    await this.database
      .prepare(
        "INSERT INTO qualified_pools (pool_id, policy_id, pool_state, pool_version, member_count, pool_digest, sealed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.pool_id,
        record.policy_id,
        record.pool_state,
        record.pool_version,
        record.member_count,
        record.pool_digest,
        record.sealed_at,
        record.expires_at,
      )
      .run();
    return record;
  }

  async insertMember(value: unknown): Promise<PoolMemberRecord> {
    const record = parseBoundary(memberSchema, value);
    await this.database
      .prepare(
        "INSERT INTO qualified_pool_members (pool_id, ordinal, venue_id, evidence_digest, member_digest) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        record.pool_id,
        record.ordinal,
        record.venue_id,
        record.evidence_digest,
        record.member_digest,
      )
      .run();
    return record;
  }

  async insertReceipt(value: unknown): Promise<SelectionReceiptRecord> {
    const record = parseBoundary(receiptSchema, value);
    await this.database
      .prepare(
        "INSERT INTO selection_receipts (receipt_id, pool_id, policy_digest, randomness_digest, constraint_digest, receipt_state, selected_member_digest, receipt_version, prepared_at, activated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.receipt_id,
        record.pool_id,
        record.policy_digest,
        record.randomness_digest,
        record.constraint_digest,
        record.receipt_state,
        record.selected_member_digest,
        record.receipt_version,
        record.prepared_at,
        record.activated_at,
        record.expires_at,
      )
      .run();
    return record;
  }

  async insertAttempt(value: unknown): Promise<SelectionAttemptRecord> {
    const record = parseBoundary(attemptSchema, value);
    await this.database
      .prepare(
        "INSERT INTO selection_attempts (receipt_id, attempt_number, remaining_set_digest, candidate_member_digest, validation_result, result_digest, attempted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.receipt_id,
        record.attempt_number,
        record.remaining_set_digest,
        record.candidate_member_digest,
        record.validation_result,
        record.result_digest,
        record.attempted_at,
      )
      .run();
    return record;
  }

  findReceipt(receiptId: string): Promise<SelectionReceiptRecord | null> {
    return firstParsed(
      this.database
        .prepare(
          "SELECT receipt_id, pool_id, policy_digest, randomness_digest, constraint_digest, receipt_state, selected_member_digest, receipt_version, prepared_at, activated_at, expires_at FROM selection_receipts WHERE receipt_id = ?",
        )
        .bind(receiptId),
      receiptSchema,
    );
  }

  listAttempts(receiptId: string): Promise<readonly SelectionAttemptRecord[]> {
    return allParsed(
      this.database
        .prepare(
          "SELECT receipt_id, attempt_number, remaining_set_digest, candidate_member_digest, validation_result, result_digest, attempted_at FROM selection_attempts WHERE receipt_id = ? ORDER BY attempt_number LIMIT 100",
        )
        .bind(receiptId),
      attemptSchema,
    );
  }
}

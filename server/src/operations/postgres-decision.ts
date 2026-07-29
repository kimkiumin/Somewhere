import { z } from "zod";
import type { Database, PreparedQuery } from "../db/database";

export const PostgresDecisionReceiptSchema = z
  .object({
    decidedAt: z.string().datetime({ offset: true }),
    decision: z.enum(["STAY_D1", "PLAN_POSTGRES_CUTOVER"]),
    decisionId: z.string().min(20).max(96),
    dualWrite: z.literal(false),
    expiresAt: z.string().datetime({ offset: true }),
    policyVersion: z.literal("postgres-trigger-v1"),
    reviewedReleaseDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    reviewerDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    schemaVersion: z.literal(1),
    triggerFactsDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
  .readonly();

export type PostgresDecisionReceipt = z.infer<typeof PostgresDecisionReceiptSchema>;

export const PostgresTriggerFactsSchema = z
  .object({
    crossDomainJoinsOperationallyCentral: z.boolean(),
    d1StorageFraction: z.number().finite().min(0).max(1),
    multiRegionControlRequired: z.boolean(),
    recoveryObjectiveHours: z.number().finite().nonnegative(),
    serializableCrossAggregateInvariantRequired: z.boolean(),
    sustainedWriteContentionP95Ms: z.number().finite().nonnegative(),
    writeContentionObjectiveMs: z.number().finite().positive(),
  })
  .strict()
  .readonly();

export type PostgresTriggerFacts = z.infer<typeof PostgresTriggerFactsSchema>;

export async function createPostgresDecisionReceipt(
  input: Readonly<{
    decidedAt: string;
    facts: PostgresTriggerFacts;
    reviewedReleaseDigest: string;
    reviewerDigest: string;
  }>,
): Promise<PostgresDecisionReceipt> {
  const facts = PostgresTriggerFactsSchema.parse(input.facts);
  const triggerFactsDigest = await digestCanonical(facts);
  const policyVersion = "postgres-trigger-v1";
  const decisionIdentityDigest = await digestText(
    `${input.reviewedReleaseDigest}\0${policyVersion}\0${triggerFactsDigest}`,
  );
  const triggered =
    facts.d1StorageFraction >= 0.7 ||
    facts.sustainedWriteContentionP95Ms > facts.writeContentionObjectiveMs ||
    facts.serializableCrossAggregateInvariantRequired ||
    facts.recoveryObjectiveHours > 7 * 24 ||
    facts.crossDomainJoinsOperationallyCentral ||
    facts.multiRegionControlRequired;
  const decidedAt = Date.parse(input.decidedAt);
  return PostgresDecisionReceiptSchema.parse({
    decidedAt: input.decidedAt,
    decision: triggered ? "PLAN_POSTGRES_CUTOVER" : "STAY_D1",
    decisionId: `pgd_v1.${decisionIdentityDigest.slice(7, 47)}`,
    dualWrite: false,
    expiresAt: new Date(decidedAt + 180 * 24 * 60 * 60 * 1_000).toISOString(),
    policyVersion,
    reviewedReleaseDigest: input.reviewedReleaseDigest,
    reviewerDigest: input.reviewerDigest,
    schemaVersion: 1,
    triggerFactsDigest,
  });
}

export class PostgresDecisionRepository {
  constructor(private readonly database: Database) {}

  async record(receipt: PostgresDecisionReceipt): Promise<void> {
    await this.prepare(receipt).run();
  }

  prepare(receipt: PostgresDecisionReceipt): PreparedQuery {
    return this.database
      .prepare(
        `INSERT INTO operations_postgres_decisions (
           decision_id, reviewed_release_digest, decision, trigger_facts_digest,
           reviewer_digest, policy_version, decided_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(decision_id) DO NOTHING`,
      )
      .bind(
        receipt.decisionId,
        rawDigest(receipt.reviewedReleaseDigest),
        receipt.decision,
        rawDigest(receipt.triggerFactsDigest),
        rawDigest(receipt.reviewerDigest),
        receipt.policyVersion,
        Date.parse(receipt.decidedAt),
        Date.parse(receipt.expiresAt),
      );
  }
}

async function digestCanonical(value: PostgresTriggerFacts): Promise<string> {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

async function digestText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function rawDigest(digest: string): string {
  return digest.startsWith("sha256:") ? digest.slice(7) : digest;
}

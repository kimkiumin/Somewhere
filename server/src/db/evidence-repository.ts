import { z } from "zod";
import { allParsed, type Database, firstParsed, parseBoundary } from "./database";
import { opaqueIdSchema, positiveIntegerSchema, sha256DigestSchema } from "./values";

const policySchema = z
  .object({
    policy_id: opaqueIdSchema,
    policy_kind: z.enum(["selection", "evidence", "retention", "navigation", "budget"]),
    version: positiveIntegerSchema,
    document_digest: sha256DigestSchema,
    effective_at: positiveIntegerSchema,
    retired_at: positiveIntegerSchema.nullable(),
  })
  .strict()
  .readonly();

const venueSchema = z
  .object({
    venue_id: opaqueIdSchema,
    lifecycle_state: z.enum(["active", "retired", "blocked"]),
    record_version: positiveIntegerSchema,
    record_digest: sha256DigestSchema,
    rights_expires_at: positiveIntegerSchema,
    created_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const venueSourceSchema = z
  .object({
    source_id: opaqueIdSchema,
    venue_id: opaqueIdSchema,
    provider_code: z.string().min(1).max(48),
    provider_reference_digest: sha256DigestSchema,
    source_version: positiveIntegerSchema,
    rights_expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const evidenceSchema = z
  .object({
    evidence_id: opaqueIdSchema,
    venue_id: opaqueIdSchema,
    source_id: opaqueIdSchema,
    evidence_kind: z.enum(["category", "hours", "accessibility", "safety", "merit"]),
    normalized_value: z.string().min(1).max(1024),
    confidence_basis_points: z.number().int().min(0).max(10000),
    review_state: z.enum(["approved", "rejected", "uncertain"]),
    evidence_version: positiveIntegerSchema,
    evidence_digest: sha256DigestSchema,
    reviewed_at: positiveIntegerSchema,
    evidence_expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

export type PolicyRecord = z.infer<typeof policySchema>;
export type VenueRecord = z.infer<typeof venueSchema>;
export type VenueSourceRecord = z.infer<typeof venueSourceSchema>;
export type EvidenceRecord = z.infer<typeof evidenceSchema>;

export class EvidenceRepository {
  constructor(private readonly database: Database) {}

  async insertPolicy(value: unknown): Promise<PolicyRecord> {
    const record = parseBoundary(policySchema, value);
    await this.database
      .prepare(
        "INSERT INTO policy_versions (policy_id, policy_kind, version, document_digest, effective_at, retired_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.policy_id,
        record.policy_kind,
        record.version,
        record.document_digest,
        record.effective_at,
        record.retired_at,
      )
      .run();
    return record;
  }

  async insertVenue(value: unknown): Promise<VenueRecord> {
    const record = parseBoundary(venueSchema, value);
    await this.database
      .prepare(
        "INSERT INTO canonical_venues (venue_id, lifecycle_state, record_version, record_digest, rights_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.venue_id,
        record.lifecycle_state,
        record.record_version,
        record.record_digest,
        record.rights_expires_at,
        record.created_at,
      )
      .run();
    return record;
  }

  async insertEvidence(value: unknown): Promise<EvidenceRecord> {
    const record = parseBoundary(evidenceSchema, value);
    await this.database
      .prepare(
        "INSERT INTO place_evidence (evidence_id, venue_id, source_id, evidence_kind, normalized_value, confidence_basis_points, review_state, evidence_version, evidence_digest, reviewed_at, evidence_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.evidence_id,
        record.venue_id,
        record.source_id,
        record.evidence_kind,
        record.normalized_value,
        record.confidence_basis_points,
        record.review_state,
        record.evidence_version,
        record.evidence_digest,
        record.reviewed_at,
        record.evidence_expires_at,
      )
      .run();
    return record;
  }

  async insertVenueSource(value: unknown): Promise<VenueSourceRecord> {
    const record = parseBoundary(venueSourceSchema, value);
    await this.database
      .prepare(
        "INSERT INTO venue_sources (source_id, venue_id, provider_code, provider_reference_digest, source_version, rights_expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.source_id,
        record.venue_id,
        record.provider_code,
        record.provider_reference_digest,
        record.source_version,
        record.rights_expires_at,
      )
      .run();
    return record;
  }

  findPolicy(kind: PolicyRecord["policy_kind"], version: number): Promise<PolicyRecord | null> {
    return firstParsed(
      this.database
        .prepare(
          "SELECT policy_id, policy_kind, version, document_digest, effective_at, retired_at FROM policy_versions WHERE policy_kind = ? AND version = ?",
        )
        .bind(kind, version),
      policySchema,
    );
  }

  listEligibleEvidence(venueId: string, now: number): Promise<readonly EvidenceRecord[]> {
    return allParsed(
      this.database
        .prepare(
          "SELECT evidence_id, venue_id, source_id, evidence_kind, normalized_value, confidence_basis_points, review_state, evidence_version, evidence_digest, reviewed_at, evidence_expires_at FROM place_evidence WHERE venue_id = ? AND review_state = 'approved' AND evidence_expires_at > ? ORDER BY evidence_kind, evidence_version DESC LIMIT 100",
        )
        .bind(venueId, now),
      evidenceSchema,
    );
  }
}

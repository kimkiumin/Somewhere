import {
  KoreaReviewRecordV1Schema,
  ProviderRightsRecordV1Schema,
} from "../../../contracts/src/provider";
import type { Database, PreparedQuery } from "../db/database";
import {
  evaluateExternalReleaseGates,
  type GateContext,
  type ReleaseGateResult,
} from "./release-gates";

export type SignedLegalArtifact = Readonly<{
  content: string;
  expectedContentDigest: string;
}>;

export type VerifiedLegalGateInput = Readonly<{
  context: GateContext;
  korea: SignedLegalArtifact;
  provider: SignedLegalArtifact;
}>;

export class VerifiedLegalGateRepository {
  constructor(private readonly database: Database) {}

  async ingest(input: VerifiedLegalGateInput): Promise<ReleaseGateResult> {
    const prepared = await this.prepare(input);
    if (prepared.statement !== undefined) {
      await prepared.statement.run();
    }
    return prepared.result;
  }

  async prepare(input: VerifiedLegalGateInput): Promise<
    Readonly<{
      result: ReleaseGateResult;
      statement?: PreparedQuery;
    }>
  > {
    const providerDigest = await contentDigest(input.provider.content);
    const koreaDigest = await contentDigest(input.korea.content);
    const integrityFailures = [
      ...(providerDigest === input.provider.expectedContentDigest
        ? []
        : ["provider.content-digest"]),
      ...(koreaDigest === input.korea.expectedContentDigest ? [] : ["korea.content-digest"]),
    ];
    const providerCandidate: unknown = parseJson(input.provider.content);
    const koreaCandidate: unknown = parseJson(input.korea.content);
    const evaluated = evaluateExternalReleaseGates(
      providerCandidate,
      koreaCandidate,
      input.context,
    );
    const failedRuleIds = [...integrityFailures, ...evaluated.failedRuleIds];
    if (failedRuleIds.length > 0) {
      return { result: { failedRuleIds, verdict: "BLOCK" } };
    }
    const provider = ProviderRightsRecordV1Schema.parse(providerCandidate);
    const korea = KoreaReviewRecordV1Schema.parse(koreaCandidate);
    const releaseDigest = rawDigest(input.context.releaseDigest);
    const evaluatedAt = Date.parse(input.context.nowIso);
    const verificationDigest = rawDigest(
      await contentDigest(
        JSON.stringify({
          environment: input.context.environment,
          koreaDigest,
          providerDigest,
          releaseDigest: input.context.releaseDigest,
        }),
      ),
    );
    const statement = this.database
      .prepare(
        `INSERT INTO operations_verified_legal_artifacts (
           environment, gate_kind, reviewed_release_digest, subject_digest,
           artifact_digest, verification_digest, failed_rule_ids_json,
           evaluated_at, expires_at
         ) VALUES
           (?, 'provider-rights', ?, ?, ?, ?, '[]', ?, ?),
           (?, 'korea-review', ?, ?, ?, ?, '[]', ?, ?)
         ON CONFLICT(environment, gate_kind, reviewed_release_digest, artifact_digest)
         DO NOTHING`,
      )
      .bind(
        input.context.environment,
        releaseDigest,
        rawDigest(await contentDigest(provider.providerId)),
        rawDigest(providerDigest),
        verificationDigest,
        evaluatedAt,
        Date.parse(provider.terms.expiresAt),
        input.context.environment,
        releaseDigest,
        rawDigest(korea.attestationDigest),
        rawDigest(koreaDigest),
        verificationDigest,
        evaluatedAt,
        Date.parse(korea.expiresAt),
      );
    return {
      result: { failedRuleIds: [], verdict: "PASS" },
      statement,
    };
  }
}

export async function contentDigest(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `sha256:${hex}`;
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function rawDigest(digest: string): string {
  return digest.startsWith("sha256:") ? digest.slice(7) : digest;
}

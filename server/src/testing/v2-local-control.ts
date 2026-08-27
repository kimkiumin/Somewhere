import { z } from "zod";
import { API_HEADERS, jsonResponse } from "../api/http-response";
import type { DeploymentEnvironment } from "../environment";

const CONTROL_PATH = "/api/test/v2-control";
const CONTROL_KEY = "somewhere-v2-local-qa";
const controlBodySchema = z
  .object({
    clockOffsetMs: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60 * 60 * 1_000),
    fixtureNowMs: z.number().int().min(0).nullable().optional(),
    grantFeedbackConsent: z.boolean().default(false),
  })
  .strict()
  .readonly();

let clockOffsetMs = 0;
let fixtureNowMs: number | undefined;

export async function handleV2LocalControl(
  request: Request,
  environment: DeploymentEnvironment,
  database?: D1Database,
): Promise<Response | undefined> {
  if (environment !== "local" || new URL(request.url).pathname !== CONTROL_PATH) {
    return undefined;
  }
  if (request.method !== "PUT") {
    return new Response(null, { headers: API_HEADERS, status: 405 });
  }
  if (request.headers.get("x-somewhere-v2-control") !== CONTROL_KEY) {
    return new Response(null, { headers: API_HEADERS, status: 403 });
  }
  const parsed = controlBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ contractVersion: 1, error: { code: "schema_invalid" } }, 400);
  }
  clockOffsetMs = parsed.data.clockOffsetMs;
  if (parsed.data.fixtureNowMs !== undefined) {
    fixtureNowMs = parsed.data.fixtureNowMs ?? undefined;
  }
  const consentRows = parsed.data.grantFeedbackConsent
    ? await grantFeedbackConsent(database, v2RuntimeNow(environment))
    : 0;
  return jsonResponse(
    { clockOffsetMs, consentRows, contractVersion: 1, fixtureNowMs: fixtureNowMs ?? null },
    200,
  );
}

export function v2RuntimeNow(
  environment: DeploymentEnvironment,
  wallClock: () => number = Date.now,
): number {
  return wallClock() + (environment === "local" ? clockOffsetMs : 0);
}

export function v2FixtureNow(environment: DeploymentEnvironment, runtimeNow: number): number {
  return environment === "local" ? (fixtureNowMs ?? runtimeNow) + clockOffsetMs : runtimeNow;
}

export function resetV2LocalControl(): void {
  clockOffsetMs = 0;
  fixtureNowMs = undefined;
}

async function grantFeedbackConsent(
  database: D1Database | undefined,
  now: number,
): Promise<number> {
  if (database === undefined) {
    return 0;
  }
  const result = await database
    .prepare(
      "INSERT OR REPLACE INTO consent_ledger (consent_id, session_binding_digest, consent_kind, notice_version, notice_digest, decision, decided_at) SELECT 'consent:v2qa:' || substr(binding_digest, 1, 40), binding_digest, 'feedback', 1, ?, 'granted', ? FROM http_sessions",
    )
    .bind("0".repeat(64), now)
    .run();
  return result.meta.changes;
}

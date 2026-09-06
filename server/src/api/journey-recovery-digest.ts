export async function resolvePreviousMemberDigest(
  database: D1Database,
  guardDigest: string,
): Promise<string> {
  const row = await database
    .prepare(
      "SELECT selected_member_digest FROM selection_receipts WHERE randomness_digest = ? AND selected_member_digest IS NOT NULL ORDER BY expires_at DESC LIMIT 1",
    )
    .bind(guardDigest)
    .first();
  return isSha256Hex(row?.["selected_member_digest"]) ? row["selected_member_digest"] : guardDigest;
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

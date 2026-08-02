import { describe, expect, it } from "vitest";

import { InMemorySessionRepository, SessionService } from "../src/security/session";
import { importHmacKey } from "../src/security/tokens";

async function service(): Promise<SessionService> {
  return new SessionService(
    new InMemorySessionRepository(),
    await importHmacKey(new Uint8Array(32).fill(7)),
  );
}

describe("session lifecycle", () => {
  it("FI-SESSION-01 replaces an attacker-selected valid-looking cookie", async () => {
    // Given: a canonical-looking value that the server never issued.
    const sessions = await service();
    const attackerCookie = `__Host-somewhere_session=${"A".repeat(43)}`;

    // When: two clients independently bootstrap with that value.
    const [left, right] = await Promise.all([
      sessions.issueOrRefresh(attackerCookie, 1_000),
      sessions.issueOrRefresh(attackerCookie, 1_000),
    ]);

    // Then: neither binding adopts the attacker value or the other client's value.
    expect(left.cookie).not.toContain("A".repeat(43));
    expect(right.cookie).not.toBe(left.cookie);
    expect(left.cookie).not.toContain("Domain=");
  });

  it("FI-SESSION-02 keeps the 24-hour expiry absolute while rotating CSRF", async () => {
    // Given: a live issued session.
    const sessions = await service();
    const issued = await sessions.issueOrRefresh(undefined, 1_000);
    const cookie = issued.cookie.split(";")[0];

    // When: the session endpoint rotates CSRF after ten minutes.
    const refreshed = await sessions.issueOrRefresh(cookie, 601_000);

    // Then: CSRF changes but the session expiry never extends.
    expect(refreshed.csrfToken).not.toBe(issued.csrfToken);
    expect(refreshed.expiresAt).toBe(issued.expiresAt);
    expect(await sessions.authenticate(cookie, issued.csrfToken, 601_000)).toBeUndefined();
    expect(await sessions.authenticate(cookie, refreshed.csrfToken, 601_000)).toBeDefined();
  });

  it("FI-CSRF-01 rejects missing and wrong synchronizer tokens", async () => {
    // Given: a live protected cookie and its issued token.
    const sessions = await service();
    const issued = await sessions.issueOrRefresh(undefined, 1_000);
    const cookie = issued.cookie.split(";")[0];

    // When: the token is missing or replaced.
    const missing = await sessions.authenticate(cookie, undefined, 1_001);
    const wrong = await sessions.authenticate(cookie, `csrf_v1.${"A".repeat(43)}`, 1_001);

    // Then: neither request authenticates.
    expect(missing).toBeUndefined();
    expect(wrong).toBeUndefined();
  });
});

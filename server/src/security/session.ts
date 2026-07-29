import { hmacDigest, isCanonicalToken, randomBase64Url } from "./tokens";

const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
const CSRF_TTL_MS = 30 * 60 * 1_000;
export const SESSION_COOKIE_NAME = "__Host-somewhere_session";

export type SessionRecord = Readonly<{
  bindingDigest: string;
  csrfDigest: string;
  csrfExpiresAt: number;
  expiresAt: number;
}>;

export interface SessionRepository {
  find(bindingDigest: string): Promise<SessionRecord | undefined>;
  save(record: SessionRecord): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  readonly #records = new Map<string, SessionRecord>();

  async find(bindingDigest: string): Promise<SessionRecord | undefined> {
    return this.#records.get(bindingDigest);
  }

  async save(record: SessionRecord): Promise<void> {
    this.#records.set(record.bindingDigest, record);
  }
}

export type IssuedSession = Readonly<{
  bindingDigest: string;
  cookie: string;
  csrfToken: string;
  expiresAt: number;
}>;

export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly hmacKey: CryptoKey,
  ) {}

  async issueOrRefresh(rawCookie: string | undefined, now: number): Promise<IssuedSession> {
    const presented = rawCookie === undefined ? undefined : parseSessionCookie(rawCookie);
    const presentedDigest =
      presented === undefined ? undefined : await hmacDigest(this.hmacKey, presented);
    const existing =
      presentedDigest === undefined ? undefined : await this.repository.find(presentedDigest);
    const sessionToken =
      existing !== undefined && existing.expiresAt > now ? presented : randomBase64Url(32);
    const bindingDigest = await hmacDigest(this.hmacKey, sessionToken ?? "");
    const csrfToken = `csrf_v1.${randomBase64Url(32)}`;
    const record: SessionRecord = {
      bindingDigest,
      csrfDigest: await hmacDigest(this.hmacKey, csrfToken),
      csrfExpiresAt: now + CSRF_TTL_MS,
      expiresAt:
        existing !== undefined && existing.expiresAt > now
          ? existing.expiresAt
          : now + SESSION_TTL_MS,
    };
    await this.repository.save(record);
    return {
      bindingDigest,
      cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; Secure; HttpOnly; SameSite=Strict; Path=/`,
      csrfToken,
      expiresAt: record.expiresAt,
    };
  }

  async authenticate(
    rawCookie: string | undefined,
    csrfToken: string | undefined,
    now: number,
  ): Promise<SessionRecord | undefined> {
    const token = rawCookie === undefined ? undefined : parseSessionCookie(rawCookie);
    if (
      token === undefined ||
      csrfToken === undefined ||
      !isCanonicalToken(csrfToken, "csrf_v1", 32)
    ) {
      return undefined;
    }
    const record = await this.repository.find(await hmacDigest(this.hmacKey, token));
    if (record === undefined || record.expiresAt <= now || record.csrfExpiresAt <= now) {
      return undefined;
    }
    const candidate = await hmacDigest(this.hmacKey, csrfToken);
    return fixedSizeEqual(candidate, record.csrfDigest) ? record : undefined;
  }
}

function fixedSizeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.byteLength ^ rightBytes.byteLength;
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function parseSessionCookie(header: string): string | undefined {
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  const value = match?.slice(prefix.length);
  return value !== undefined && isCanonicalToken(`session.${value}`, "session", 32)
    ? value
    : undefined;
}

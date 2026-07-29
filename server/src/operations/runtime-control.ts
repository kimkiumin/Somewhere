import { decideAdmission, type EndpointClass } from "../admission/admission";
import type { Database } from "../db/database";
import { RedactedOperationalLogger } from "../observability/redacted-logger";
import { JourneyEnvelopeRepository } from "./envelope-repository";
import { RuntimeStateRepository } from "./runtime-state-repository";
import { authorizeWrite } from "./write-fence";

export type RuntimeGateLease =
  | Readonly<{ allowed: false }>
  | Readonly<{
      allowed: true;
      reserveNewWork?: (idempotencyKey: string) => Promise<NewWorkReservationLease | undefined>;
      writeEpoch: number;
    }>;

export type NewWorkReservationLease = Readonly<{
  finalize: () => Promise<void>;
  release: () => Promise<void>;
}>;

export class OperationsRuntimeControl {
  private readonly logger = new RedactedOperationalLogger({
    write: (record) => console.log(record),
  });

  constructor(private readonly database: Database) {}

  async authorize(
    request: Request,
    environment: "local" | "staging" | "production",
    now: number,
  ): Promise<RuntimeGateLease> {
    return this.authorizeClass(classifyRequest(request), request, environment, now);
  }

  async authorizeClass(
    endpointClass: EndpointClass,
    request: Request,
    environment: "local" | "staging" | "production",
    now: number,
  ): Promise<RuntimeGateLease> {
    if (environment === "local") {
      this.logger.write({
        admissionState: "OPEN",
        environment,
        event: "admission_decision",
        outcome: "allowed",
        writeEpoch: 1,
      });
      return allowedLease(1);
    }
    const repository = new RuntimeStateRepository(this.database);
    const fence = await repository.loadFence(environment);
    if (fence === null) {
      return this.block(environment, "BOOT_BLOCKED");
    }
    const submittedEpoch = parseSubmittedEpoch(request, fence.writeEpoch);
    const write = authorizeWrite(fence, endpointClass, submittedEpoch, true);
    if (!write.allowed) {
      return this.block(environment, "WRITE_FENCED", fence.writeEpoch);
    }
    if (endpointClass === "SAFETY_SERVER" || endpointClass === "LOCAL_TERMINAL") {
      return allowedLease(fence.writeEpoch);
    }
    const { gateCount, journeyEnvelopeValid, killCount, meters, state } =
      await repository.loadSnapshot(environment, now);
    if (state === null || state.write_epoch !== fence.writeEpoch || !journeyEnvelopeValid) {
      return this.block(environment, "BOOT_BLOCKED", fence.writeEpoch);
    }
    const decision = decideAdmission({
      currentState: state.state,
      emergencyFreeze: false,
      endpointClass,
      externalGatesPass: gateCount === 2,
      freshRecoverySamples: state.fresh_recovery_samples,
      killSwitchActive: killCount > 0,
      meters,
      now,
      oldEpochReservations: state.old_epoch_reservations,
      providerBudgetAvailable: state.provider_budget_available === 1,
      queueHealthy: state.queue_healthy === 1,
      requiredStoresReachable: true,
      workerReachable: true,
      writeFenceMode: fence.mode,
    });
    this.logger.write({
      admissionState: decision.state === "PLATFORM_UNREACHABLE" ? "DEGRADED" : state.state,
      environment,
      event: "admission_decision",
      outcome: decision.allowed ? "allowed" : "blocked",
      writeEpoch: fence.writeEpoch,
    });
    if (!decision.allowed) {
      return { allowed: false };
    }
    return endpointClass === "NEW_WORK"
      ? {
          allowed: true,
          reserveNewWork: (idempotencyKey) =>
            this.reserveNewWork(
              idempotencyKey,
              environment,
              now,
              fence.writeEpoch,
              state.release_digest,
            ),
          writeEpoch: fence.writeEpoch,
        }
      : allowedLease(fence.writeEpoch);
  }

  private block(
    environment: "staging" | "production",
    admissionState: "BOOT_BLOCKED" | "WRITE_FENCED",
    writeEpoch?: number,
  ): RuntimeGateLease {
    this.logger.write({
      admissionState,
      environment,
      event: "admission_decision",
      outcome: "blocked",
      ...(writeEpoch === undefined ? {} : { writeEpoch }),
    });
    return { allowed: false };
  }

  private async reserveNewWork(
    idempotencyKey: string,
    environment: "staging" | "production",
    now: number,
    writeEpoch: number,
    releaseDigest: string,
  ): Promise<NewWorkReservationLease | undefined> {
    const requestDigest = await digestText(`${environment}\0${idempotencyKey}`);
    const repository = new JourneyEnvelopeRepository(this.database);
    const result = await repository.reserve({
      environment,
      expiresAt: now + 15 * 60 * 1_000,
      now,
      releaseDigest,
      requestDigest,
      writeEpoch,
    });
    if (result === "closed") {
      return undefined;
    }
    return {
      finalize: async () => {
        if (!(await repository.finalize(requestDigest, releaseDigest, writeEpoch))) {
          throw new Error("Journey meter envelope could not be finalized");
        }
      },
      release: async () => {
        if (!(await repository.release(requestDigest, releaseDigest, writeEpoch))) {
          throw new Error("Journey meter envelope could not be released");
        }
      },
    };
  }
}

function classifyRequest(request: Request): EndpointClass {
  const pathname = new URL(request.url).pathname;
  if (
    (request.method === "POST" && pathname === "/api/v1/journeys") ||
    (request.method === "GET" && pathname === "/api/v1/session")
  ) {
    return "NEW_WORK";
  }
  if (
    request.method === "GET" ||
    request.method === "DELETE" ||
    /\/(?:reveal|stop\/request|stop\/confirm|stop\/reason)$/u.test(pathname)
  ) {
    return "SAFETY_SERVER";
  }
  return "ACTIVE_MUTATION";
}

function parseSubmittedEpoch(request: Request, currentEpoch: number): number {
  const value = request.headers.get("x-write-epoch");
  if (value === null || !/^[1-9][0-9]*$/u.test(value)) {
    return currentEpoch;
  }
  return Number(value);
}

function allowedLease(writeEpoch: number): RuntimeGateLease {
  return { allowed: true, writeEpoch };
}

async function digestText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

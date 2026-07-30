import type { Database } from "../db/database";
import { DeletionCleanupRepository } from "./cleanup-repository";
import { DeletionIntentRepository, type PendingDelete } from "./intent-repository";
import type { DeletionStage } from "./saga";

export type { PendingDelete } from "./intent-repository";

export class DeletionRepository {
  private readonly cleanup: DeletionCleanupRepository;
  private readonly intent: DeletionIntentRepository;

  constructor(database: Database) {
    this.intent = new DeletionIntentRepository(database);
    this.cleanup = new DeletionCleanupRepository(database);
  }

  prepare(
    input: Readonly<{
      deleteRequestDigest: string;
      expectedSequence: number;
      journeyDigest: string;
      now: number;
      sessionBindingDigest: string;
    }>,
  ): Promise<PendingDelete> {
    return this.intent.prepare(input);
  }

  find(journeyDigest: string, now: number): Promise<PendingDelete | undefined> {
    return this.intent.find(journeyDigest, now);
  }

  advance(intent: PendingDelete, stage: DeletionStage): Promise<void> {
    return this.intent.advance(intent, stage);
  }

  writeTombstone(intent: PendingDelete, writeEpoch: number, now: number): Promise<void> {
    return this.cleanup.writeTombstone(intent, writeEpoch, now);
  }

  cleanupBindings(intent: PendingDelete): Promise<void> {
    return this.cleanup.cleanupBindings(intent);
  }

  abandonPending(intent: PendingDelete): Promise<void> {
    return this.intent.abandonPending(intent);
  }

  inventory(intent: PendingDelete): Promise<readonly string[]> {
    return this.cleanup.inventory(intent);
  }

  finalizeCompletion(intent: PendingDelete, writeEpoch: number, now: number): Promise<void> {
    return this.cleanup.finalizeCompletion(intent, writeEpoch, now);
  }

  complete(intent: PendingDelete): Promise<void> {
    return this.intent.complete(intent);
  }
}

import type { Database } from "../db/database";
import type {
  FeedbackConsumeInput,
  FeedbackEligibility,
  FeedbackIssueInput,
  FeedbackReaction,
} from "./contracts";
import { FeedbackEligibilityRepository } from "./eligibility-repository";
import { FeedbackReactionRepository } from "./reaction-repository";

export type { FeedbackEligibility, FeedbackReaction } from "./contracts";

export class FeedbackRepository {
  private readonly eligibility: FeedbackEligibilityRepository;
  private readonly reaction: FeedbackReactionRepository;

  constructor(database: Database, writeEpoch: number) {
    if (!Number.isInteger(writeEpoch) || writeEpoch < 1) {
      throw new RangeError("Feedback write epoch must be a positive integer");
    }
    this.eligibility = new FeedbackEligibilityRepository(database, writeEpoch);
    this.reaction = new FeedbackReactionRepository(database, writeEpoch, this.eligibility);
  }

  issue(input: FeedbackIssueInput): Promise<boolean> {
    return this.eligibility.issue(input);
  }

  hasActiveConsent(bindingDigest: string): Promise<boolean> {
    return this.eligibility.hasActiveConsent(bindingDigest);
  }

  find(capabilityDigest: string): Promise<FeedbackEligibility | null> {
    return this.eligibility.find(capabilityDigest);
  }

  expire(capabilityDigest: string, now: number): Promise<void> {
    return this.eligibility.expire(capabilityDigest, now);
  }

  revokeJourney(journeyDigest: string): Promise<void> {
    return this.eligibility.revokeJourney(journeyDigest);
  }

  deleteJourney(journeyDigest: string): Promise<void> {
    return this.eligibility.deleteJourney(journeyDigest);
  }

  consume(input: FeedbackConsumeInput): Promise<FeedbackReaction> {
    return this.reaction.consume(input);
  }
}

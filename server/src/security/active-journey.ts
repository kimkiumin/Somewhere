export interface ActiveJourneyRepository {
  find(bindingDigest: string): Promise<string | undefined>;
  reserve(bindingDigest: string, journeyId: string): Promise<boolean>;
  release(bindingDigest: string, journeyId: string): Promise<void>;
}

export class InMemoryActiveJourneyRepository implements ActiveJourneyRepository {
  readonly #active = new Map<string, string>();

  async find(bindingDigest: string): Promise<string | undefined> {
    return this.#active.get(bindingDigest);
  }

  async reserve(bindingDigest: string, journeyId: string): Promise<boolean> {
    if (this.#active.has(bindingDigest)) {
      return false;
    }
    this.#active.set(bindingDigest, journeyId);
    return true;
  }

  async release(bindingDigest: string, journeyId: string): Promise<void> {
    if (this.#active.get(bindingDigest) === journeyId) {
      this.#active.delete(bindingDigest);
    }
  }
}

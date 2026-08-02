export interface ObjectAuthorizer {
  authorize(bindingDigest: string, objectId: string): Promise<boolean>;
}

export class InMemoryObjectAuthorizer implements ObjectAuthorizer {
  readonly #owners = new Map<string, string>();

  bind(bindingDigest: string, objectId: string): void {
    this.#owners.set(objectId, bindingDigest);
  }

  async authorize(bindingDigest: string, objectId: string): Promise<boolean> {
    return this.#owners.get(objectId) === bindingDigest;
  }
}

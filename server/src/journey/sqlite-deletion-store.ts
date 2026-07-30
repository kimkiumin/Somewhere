type DeletionGateRow = Readonly<{
  delete_request_digest: string;
  expected_sequence: number;
}>;

export class JourneySqliteDeletionStore {
  constructor(private readonly storage: DurableObjectStorage) {}

  readDeletionGate(): DeletionGateRow | null {
    return (
      this.storage.sql
        .exec<DeletionGateRow>(
          "SELECT delete_request_digest, expected_sequence FROM journey_deletion_gate WHERE singleton = 1",
        )
        .toArray()[0] ?? null
    );
  }

  beginDeletion(
    expectedSequence: number,
    deleteRequestDigest: string,
    readState: () => Readonly<{ sequence: number }> | null,
  ): "fenced" | "sequence_conflict" {
    return this.storage.transactionSync(() => {
      const existing = this.readDeletionGate();
      if (existing !== null) {
        return existing.expected_sequence === expectedSequence &&
          existing.delete_request_digest === deleteRequestDigest
          ? "fenced"
          : "sequence_conflict";
      }
      const state = readState();
      if (state === null || state.sequence !== expectedSequence) {
        return "sequence_conflict";
      }
      this.storage.sql.exec(
        "INSERT INTO journey_deletion_gate (singleton, delete_request_digest, expected_sequence) VALUES (1, ?, ?)",
        deleteRequestDigest,
        expectedSequence,
      );
      return "fenced";
    });
  }

  resumeLegacyDeletion(
    deleteRequestDigest: string,
    readState: () => unknown | null,
  ): "fenced" | "sequence_conflict" {
    return this.storage.transactionSync(() => {
      const existing = this.readDeletionGate();
      if (existing !== null) {
        return existing.delete_request_digest === deleteRequestDigest
          ? "fenced"
          : "sequence_conflict";
      }
      if (readState() !== null) {
        return "sequence_conflict";
      }
      this.storage.sql.exec(
        "INSERT INTO journey_deletion_gate (singleton, delete_request_digest, expected_sequence) VALUES (1, ?, 0)",
        deleteRequestDigest,
      );
      return "fenced";
    });
  }

  isDeletionFenced(): boolean {
    return this.readDeletionGate() !== null;
  }

  matchesDeletionGate(deleteRequestDigest: string): boolean {
    return this.readDeletionGate()?.delete_request_digest === deleteRequestDigest;
  }

  deleteJourneyData(deleteRequestDigest: string): void {
    this.storage.transactionSync(() => {
      if (!this.matchesDeletionGate(deleteRequestDigest)) {
        throw new Error("Journey deletion gate identity changed");
      }
      this.storage.sql.exec("DELETE FROM journey_inbox");
      this.storage.sql.exec("DELETE FROM journey_outbox");
      this.storage.sql.exec("DELETE FROM journey_state");
    });
  }
}

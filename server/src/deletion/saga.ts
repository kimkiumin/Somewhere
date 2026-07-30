export type DeletionStage = "pending" | "fenced" | "tombstoned" | "object-deleted" | "cleaned";

export type DeletionSagaPorts = Readonly<{
  advance(stage: DeletionStage): Promise<void>;
  beginDeletion(): Promise<"fenced" | "sequence_conflict">;
  cleanupBindings(): Promise<void>;
  complete(): Promise<void>;
  deleteObject(): Promise<void>;
  inventory(): Promise<readonly string[]>;
  loadStage(): Promise<DeletionStage>;
  finalizeCompletion(): Promise<void>;
  writeTombstone(): Promise<void>;
}>;

export type DeletionSagaResult =
  | Readonly<{ kind: "complete" }>
  | Readonly<{ kind: "sequence-conflict" }>
  | Readonly<{ kind: "incomplete"; stage: DeletionStage }>;

export async function runDeletionSaga(ports: DeletionSagaPorts): Promise<DeletionSagaResult> {
  let stage = await ports.loadStage();
  while (true) {
    switch (stage) {
      case "pending": {
        const fence = await outcome(ports.beginDeletion);
        if (fence === undefined) {
          return { kind: "incomplete", stage };
        }
        if (fence === "sequence_conflict") {
          return { kind: "sequence-conflict" };
        }
        if (!(await completes(() => ports.advance("fenced")))) {
          return { kind: "incomplete", stage };
        }
        stage = "fenced";
        break;
      }
      case "fenced": {
        if (!(await completes(ports.writeTombstone))) {
          return { kind: "incomplete", stage };
        }
        if (!(await completes(() => ports.advance("tombstoned")))) {
          return { kind: "incomplete", stage };
        }
        stage = "tombstoned";
        break;
      }
      case "tombstoned": {
        if (!(await completes(ports.writeTombstone))) {
          return { kind: "incomplete", stage };
        }
        if (!(await completes(ports.deleteObject))) {
          return { kind: "incomplete", stage };
        }
        if (!(await completes(() => ports.advance("object-deleted")))) {
          return { kind: "incomplete", stage };
        }
        stage = "object-deleted";
        break;
      }
      case "object-deleted": {
        if (!(await completes(ports.cleanupBindings))) {
          return { kind: "incomplete", stage };
        }
        const inventory = await outcome(ports.inventory);
        if (inventory === undefined) {
          return { kind: "incomplete", stage };
        }
        const violations = inventory;
        if (violations.length > 0) {
          return { kind: "incomplete", stage };
        }
        if (!(await completes(() => ports.advance("cleaned")))) {
          return { kind: "incomplete", stage };
        }
        stage = "cleaned";
        break;
      }
      case "cleaned":
        if (!(await completes(ports.finalizeCompletion)) || !(await completes(ports.complete))) {
          return { kind: "incomplete", stage };
        }
        return { kind: "complete" };
      default:
        return assertNever(stage);
    }
  }
}

async function outcome<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      return undefined;
    }
    throw error;
  }
}

async function completes(operation: () => Promise<void>): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    if (error instanceof Error) {
      return false;
    }
    throw error;
  }
}

function assertNever(value: never): never {
  return value;
}

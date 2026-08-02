import { FeedbackCapabilitySchema } from "@somewhere/contracts";
import { z } from "zod";

const MAX_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const DATABASE_NAME = "somewhere-feedback-v1";
const OBJECT_STORE = "capability";
const RECORD_KEY = "active";

const recordSchema = z
  .object({
    feedbackCapability: FeedbackCapabilitySchema,
    dueAt: z.number().int().safe().nonnegative(),
    expiresAt: z.number().int().safe().nonnegative(),
  })
  .strict()
  .readonly();

export type FeedbackCapabilityRecord = z.infer<typeof recordSchema>;

export interface FeedbackCapabilityPersistence {
  read(): Promise<unknown>;
  write(value: FeedbackCapabilityRecord): Promise<void>;
  clear(): Promise<void>;
}

export interface FeedbackCapabilityStore {
  load(): Promise<FeedbackCapabilityRecord | null>;
  save(value: FeedbackCapabilityRecord): Promise<void>;
  clear(): Promise<void>;
}

export function createFeedbackCapabilityStore(
  persistence: FeedbackCapabilityPersistence,
  now: () => number = Date.now,
): FeedbackCapabilityStore {
  return {
    async load() {
      const parsed = recordSchema.safeParse(await persistence.read());
      if (!parsed.success || parsed.data.expiresAt <= now()) {
        await persistence.clear();
        return null;
      }
      return parsed.data;
    },
    async save(value) {
      const parsed = recordSchema.safeParse(value);
      if (
        !parsed.success ||
        parsed.data.dueAt > parsed.data.expiresAt ||
        parsed.data.expiresAt <= now() ||
        parsed.data.expiresAt > now() + MAX_RETENTION_MS
      ) {
        await persistence.clear();
        throw new TypeError("Feedback capability retention is invalid");
      }
      await persistence.write(parsed.data);
    },
    clear() {
      return persistence.clear();
    },
  };
}

export function createBrowserFeedbackCapabilityStore(
  factory: IDBFactory = indexedDB,
  now: () => number = Date.now,
): FeedbackCapabilityStore {
  return createFeedbackCapabilityStore(createIndexedDbPersistence(factory), now);
}

function createIndexedDbPersistence(factory: IDBFactory): FeedbackCapabilityPersistence {
  async function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, 1);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(OBJECT_STORE)) {
          database.createObjectStore(OBJECT_STORE);
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
      request.addEventListener("blocked", () => reject(new Error("Feedback database is blocked")), {
        once: true,
      });
    });
  }

  async function transact<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const connection = await database();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = connection.transaction(OBJECT_STORE, mode);
        const request = run(transaction.objectStore(OBJECT_STORE));
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error), { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
      });
    } finally {
      connection.close();
    }
  }

  return {
    read: () => transact("readonly", (store) => store.get(RECORD_KEY)),
    write: (value) =>
      transact("readwrite", (store) => store.put(value, RECORD_KEY)).then(() => undefined),
    clear: () => transact("readwrite", (store) => store.delete(RECORD_KEY)).then(() => undefined),
  };
}

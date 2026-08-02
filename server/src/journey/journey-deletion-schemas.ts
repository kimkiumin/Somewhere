import { z } from "zod";

type JourneyDeletionSchemaDependencies = Readonly<{
  digestSchema: z.ZodString;
  nonnegativeIntegerSchema: z.ZodNumber;
}>;

export function createJourneyDeletionSchemas({
  digestSchema,
  nonnegativeIntegerSchema,
}: JourneyDeletionSchemaDependencies) {
  const tombstoneReceiptSchema = z
    .object({
      deleteRequestDigest: digestSchema,
      durable: z.literal(true),
      replayStatus: z.literal(204),
    })
    .strict()
    .readonly();
  const beginDeletionSchema = z
    .object({
      deleteRequestDigest: digestSchema,
      expectedSequence: nonnegativeIntegerSchema,
    })
    .strict()
    .readonly();
  const resumeDeletionSchema = z.object({ deleteRequestDigest: digestSchema }).strict().readonly();
  return { beginDeletionSchema, resumeDeletionSchema, tombstoneReceiptSchema };
}

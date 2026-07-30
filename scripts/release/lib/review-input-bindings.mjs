import { resolve } from "node:path";
import { z } from "zod";

const bindingSchema = z
  .object({
    path: z.string().min(1),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();
const bindingReceiptSchema = z
  .object({
    reviewBindings: z.array(bindingSchema).min(1),
  })
  .passthrough();

export function assertReviewInputBindings(records) {
  const observed = new Map(records.map((record) => [resolve(record.path), record.sha256]));
  for (const record of records) {
    let value;
    try {
      value = JSON.parse(record.data.toString());
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
    if (typeof value !== "object" || value === null || !("reviewBindings" in value)) continue;
    const receipt = bindingReceiptSchema.parse(value);
    for (const binding of receipt.reviewBindings) {
      if (observed.get(resolve(binding.path)) !== binding.sha256) {
        throw new TypeError("review input binding mismatch");
      }
    }
  }
}

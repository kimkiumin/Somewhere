import { z } from "zod";

export const opaqueIdSchema = z.string().min(20).max(96);
export const sha256DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const positiveIntegerSchema = z.number().int().positive();
export const nonnegativeIntegerSchema = z.number().int().nonnegative();

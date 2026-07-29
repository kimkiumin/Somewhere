import type { z } from "zod";

export type DatabaseValue = string | number | null;

export interface PreparedQuery {
  bind(...values: readonly DatabaseValue[]): PreparedQuery;
  all(): Promise<Readonly<{ results: readonly unknown[] }>>;
  first(): Promise<unknown | null>;
  run(): Promise<unknown>;
}

export interface Database {
  prepare(query: string): PreparedQuery;
}

export class RepositoryDataError extends Error {
  override readonly name = "RepositoryDataError";

  constructor(readonly cause: z.ZodError) {
    super("D1 repository data did not match its durable schema", { cause });
  }
}

export function parseBoundary<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RepositoryDataError(result.error);
  }
  return result.data;
}

export async function firstParsed<T>(
  statement: PreparedQuery,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const row = await statement.first();
  return row === null ? null : parseBoundary(schema, row);
}

export async function allParsed<T>(
  statement: PreparedQuery,
  schema: z.ZodType<T>,
): Promise<readonly T[]> {
  const result = await statement.all();
  return result.results.map((row) => parseBoundary(schema, row));
}

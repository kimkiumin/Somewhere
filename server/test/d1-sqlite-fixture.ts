import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { Database, DatabaseValue, PreparedQuery } from "../src/db/database";

const rowsSchema = z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])));

class SqliteFixtureBindingError extends Error {
  override readonly name = "SqliteFixtureBindingError";
}

function sqlLiteral(value: DatabaseValue): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function bindSql(query: string, values: readonly DatabaseValue[]): string {
  let next = query;
  for (const value of values) {
    next = next.replace("?", sqlLiteral(value));
  }
  if (next.includes("?")) {
    throw new SqliteFixtureBindingError("Not all SQLite fixture parameters were bound");
  }
  return next;
}

class SqlitePreparedQuery implements PreparedQuery {
  constructor(
    private readonly path: string,
    private readonly query: string,
    private readonly values: readonly DatabaseValue[] = [],
  ) {}

  bind(...values: readonly DatabaseValue[]): PreparedQuery {
    return new SqlitePreparedQuery(this.path, this.query, values);
  }

  async all(): Promise<Readonly<{ results: readonly unknown[] }>> {
    const output = execFileSync("sqlite3", ["-json", this.path, bindSql(this.query, this.values)], {
      encoding: "utf8",
    });
    const results = output.trim() === "" ? [] : rowsSchema.parse(JSON.parse(output));
    return { results };
  }

  async first(): Promise<unknown | null> {
    const result = await this.all();
    return result.results[0] ?? null;
  }

  async run(): Promise<unknown> {
    execFileSync("sqlite3", [this.path, bindSql(this.query, this.values)], {
      encoding: "utf8",
    });
    return undefined;
  }
}

export class SqliteDatabase implements Database {
  constructor(private readonly path: string) {}

  prepare(query: string): PreparedQuery {
    return new SqlitePreparedQuery(this.path, query);
  }
}

export function executeSql(path: string, sql: string): string {
  return execFileSync("sqlite3", [path, sql], { encoding: "utf8" });
}

export function queryJson(path: string, sql: string): readonly unknown[] {
  const output = execFileSync("sqlite3", ["-json", path, sql], { encoding: "utf8" });
  return output.trim() === "" ? [] : rowsSchema.parse(JSON.parse(output));
}

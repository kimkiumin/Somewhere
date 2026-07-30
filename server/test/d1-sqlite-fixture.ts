import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { Database, DatabaseValue, PreparedQuery } from "../src/db/database";

const rowsSchema = z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])));
const changesSchema = z.object({ changes: z.number().int().nonnegative() });

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
    const output = execFileSync(
      "sqlite3",
      ["-json", this.path, `${bindSql(this.query, this.values)}; SELECT changes() AS changes;`],
      {
        encoding: "utf8",
      },
    );
    const rows = rowsSchema.parse(JSON.parse(output));
    return { meta: changesSchema.parse(rows.at(-1)) };
  }

  render(): string {
    return bindSql(this.query, this.values);
  }
}

export class SqliteDatabase implements Database {
  constructor(private readonly path: string) {}

  async batch(statements: readonly PreparedQuery[]): Promise<readonly unknown[]> {
    const queries = statements.map((statement) => {
      if (!(statement instanceof SqlitePreparedQuery)) {
        throw new TypeError("SQLite fixture batch received a foreign statement");
      }
      return `${statement.render()};`;
    });
    const output = execFileSync("sqlite3", ["-json", this.path], {
      encoding: "utf8",
      input: [
        ".bail on",
        "BEGIN IMMEDIATE;",
        ...queries.flatMap((query) => [query, "SELECT changes() AS changes;"]),
        "COMMIT;",
      ].join("\n"),
    });
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => ({ meta: changesSchema.parse(JSON.parse(line).at(0)) }));
  }

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

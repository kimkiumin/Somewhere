export type StrictBodyResult =
  | Readonly<{ ok: true; value: Readonly<Record<string, unknown>> }>
  | Readonly<{ ok: false }>;

class InvalidStrictJsonError extends Error {
  override readonly name = "InvalidStrictJsonError";
}

export function parseStrictBody(
  source: string,
  allowedKeys: ReadonlySet<string>,
): StrictBodyResult {
  try {
    const value: unknown = JSON.parse(source, (key: string, item: unknown) => {
      if (key === "__proto__" || key === "constructor") {
        throw new InvalidStrictJsonError();
      }
      return item;
    });
    if (
      containsDuplicateObjectKey(source) ||
      value === null ||
      Array.isArray(value) ||
      typeof value !== "object"
    ) {
      return { ok: false };
    }
    const entries = Object.entries(value);
    if (
      entries.some(([key]) => !allowedKeys.has(key)) ||
      entries.some(([, item]) => typeof item === "number" && !Number.isSafeInteger(item))
    ) {
      return { ok: false };
    }
    return { ok: true, value: Object.fromEntries(entries) };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof InvalidStrictJsonError) {
      return { ok: false };
    }
    throw error;
  }
}

function containsDuplicateObjectKey(source: string): boolean {
  const containers: Array<Set<string> | null> = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === "{") {
      containers.push(new Set<string>());
      index += 1;
      continue;
    }
    if (character === "[") {
      containers.push(null);
      index += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      containers.pop();
      index += 1;
      continue;
    }
    if (character !== '"') {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const item = source[index];
      if (escaped) {
        escaped = false;
      } else if (item === "\\") {
        escaped = true;
      } else if (item === '"') {
        index += 1;
        break;
      }
      index += 1;
    }
    let following = index;
    while (following < source.length && /\s/.test(source[following] ?? "")) {
      following += 1;
    }
    const keys = containers.at(-1);
    if (source[following] === ":" && keys instanceof Set) {
      const key: unknown = JSON.parse(source.slice(start, index));
      if (typeof key !== "string" || keys.has(key)) {
        return true;
      }
      keys.add(key);
    }
  }
  return false;
}

const FORBIDDEN_DURABLE_COLUMN_FRAGMENTS = [
  "latitude",
  "longitude",
  "coordinate",
  "polyline",
  "geometry",
  "raw_trace",
  "raw_binding",
  "origin_",
] as const;

export function findForbiddenDurableColumns(columnNames: readonly string[]): readonly string[] {
  return columnNames.filter((columnName) => {
    const normalized = columnName.toLowerCase();
    return FORBIDDEN_DURABLE_COLUMN_FRAGMENTS.some((fragment) => normalized.includes(fragment));
  });
}

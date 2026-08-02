export function parseExpectedSequence(value: string | undefined): number | undefined {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    return undefined;
  }
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) ? sequence : undefined;
}

export function sequenceMatches(value: string | undefined, current: number): boolean {
  return parseExpectedSequence(value) === current;
}

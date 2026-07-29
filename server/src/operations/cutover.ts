import { OPERATIONS_POLICY_V1 } from "../../../contracts/src/policy";

export type CutoverCheck = Readonly<{
  failedStep: string | null;
  valid: boolean;
}>;

export function validateCutoverOrder(observedSteps: readonly string[]): CutoverCheck {
  const expected = OPERATIONS_POLICY_V1.releaseOrder;
  const failedIndex = expected.findIndex((step, index) => observedSteps[index] !== step);
  if (failedIndex >= 0 || observedSteps.length !== expected.length) {
    return {
      failedStep: expected[failedIndex < 0 ? expected.length - 1 : failedIndex] ?? null,
      valid: false,
    };
  }
  return { failedStep: null, valid: true };
}

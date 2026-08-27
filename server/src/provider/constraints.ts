import type { CanonicalCandidate } from "./canonicalization";

type BudgetBand = "low" | "medium" | "high";

export type RecommendationConstraints = Readonly<{
  category: "cafe" | "restaurant";
  budgetBand: BudgetBand;
  dietary: readonly string[];
  allergies: readonly string[];
}>;

const MAX_PRICE_BAND: Record<BudgetBand, number> = {
  low: 1,
  medium: 2,
  high: 4,
};

function includesEvery(requested: readonly string[], available: readonly string[]): boolean {
  const availableSet = new Set(available);
  return requested.every((value) => availableSet.has(value));
}

function hasIntersection(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

/**
 * Hard eligibility gate for the single hidden-destination draw.
 *
 * Unknown food-safety metadata never becomes a positive claim: a candidate
 * with requested dietary or allergy constraints must have reviewed metadata
 * before it can enter the pool.
 */
export function matchesHardConstraints(
  candidate: CanonicalCandidate,
  constraints: RecommendationConstraints,
): boolean {
  const venue = candidate.venue;
  if (venue.category !== constraints.category) {
    return false;
  }
  if (venue.priceBand > MAX_PRICE_BAND[constraints.budgetBand]) {
    return false;
  }
  if (constraints.dietary.length > 0) {
    if (venue.dietaryEvidence !== "reviewed") {
      return false;
    }
    if (!includesEvery(constraints.dietary, venue.dietaryTags)) {
      return false;
    }
  }
  if (constraints.allergies.length > 0) {
    if (venue.allergenEvidence !== "reviewed") {
      return false;
    }
    if (hasIntersection(constraints.allergies, venue.allergenTags)) {
      return false;
    }
  }
  return true;
}

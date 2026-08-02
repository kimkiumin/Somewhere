import { ReleaseInputError } from "./release-core.mjs";
import { validateLocalRuntimeContract } from "./local-runtime-contract-checks.mjs";
import { semanticPaths } from "./local-runtime-schemas.mjs";

export function validateLocalRuntimeEvidence(artifacts, expected) {
  const indexed = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  const present = semanticPaths.filter((path) => indexed.has(path));
  if (present.length === 0) return;
  if (present.length !== semanticPaths.length) {
    throw new ReleaseInputError("incomplete local runtime evidence contract");
  }
  validateLocalRuntimeContract(indexed, expected);
}

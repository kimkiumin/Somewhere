import type { PreparedCollectionOptions } from "./prepared-evidence.mjs";

type PreparedArtifact = {
  bytes: number;
  height?: number;
  path: string;
  sha256: string;
  width?: number;
};

export type ManualPreparedCollection = Record<string, unknown> & {
  artifacts: PreparedArtifact[];
  observations: Record<string, unknown> & {
    accessibility: Record<string, Record<string, unknown>>;
  };
};

export function collectManualPreparedEvidence(
  options: PreparedCollectionOptions,
  dependencies?: {
    beforeEmit?: () => Promise<void>;
    fetchServed?: (url: string) => Promise<Uint8Array>;
    runBrowser?: (
      repo: string,
      outputDir: string,
      baseUrl: string,
    ) => Promise<{ stderr: string; stdout: string; status: number }>;
  },
): Promise<ManualPreparedCollection>;

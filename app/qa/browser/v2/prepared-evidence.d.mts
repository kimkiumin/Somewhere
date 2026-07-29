export const PREPARED_VISUAL_IDS: readonly string[];

export type PreparedCollectionOptions = Readonly<{
  baseUrl: string;
  buildReceipt: string;
  output: string;
  outputDir: string;
  repo: string;
  sha: string;
  sourceTree: string;
  viewports: string;
}>;

export function collectPreparedEvidence(
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
): Promise<Record<string, unknown>>;

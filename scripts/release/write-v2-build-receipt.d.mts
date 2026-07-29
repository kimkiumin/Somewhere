export function writeBuildReceipt(options: {
  beforeEmit?: () => Promise<void>;
  output: string;
  repo: string;
}): Promise<void>;

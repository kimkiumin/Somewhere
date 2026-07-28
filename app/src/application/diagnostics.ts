export type DiagnosticValues = Readonly<Record<string, string | number | boolean | null>>;

export type DiagnosticEvent = {
  readonly type:
    | "permission"
    | "visibility"
    | "wake-lock"
    | "subscription"
    | "location"
    | "heading"
    | "guidance"
    | "journey"
    | "marker";
  readonly capturedAtMs: number;
  readonly values: DiagnosticValues;
};

export type DiagnosticTraceOptions = {
  readonly buildSha: string;
  readonly policyVersion: string;
};

export type DiagnosticSessionMetadata = {
  readonly browserMode: "safari" | "home-screen" | "other";
  readonly environmentLabel: "open-sky" | "urban-canyon" | "indoor" | "other";
  readonly userAgent: string;
};

export interface DiagnosticTrace {
  record(event: DiagnosticEvent): void;
  snapshot(): readonly DiagnosticEvent[];
  exportJson(metadata: DiagnosticSessionMetadata): string;
  discard(): void;
}

const HEADING_STORAGE_INTERVAL_MS = 200;

export function createDiagnosticTrace(options: DiagnosticTraceOptions): DiagnosticTrace {
  let events: DiagnosticEvent[] = [];
  let lastStoredHeadingAtMs: number | null = null;

  return {
    record(event) {
      if (
        event.type === "heading" &&
        lastStoredHeadingAtMs !== null &&
        event.capturedAtMs - lastStoredHeadingAtMs < HEADING_STORAGE_INTERVAL_MS
      ) {
        return;
      }
      if (event.type === "heading") {
        lastStoredHeadingAtMs = event.capturedAtMs;
      }
      events.push(event);
    },
    snapshot() {
      return [...events];
    },
    exportJson(metadata) {
      return JSON.stringify(
        {
          schemaVersion: 1,
          buildSha: options.buildSha,
          policyVersion: options.policyVersion,
          session: metadata,
          events,
        },
        null,
        2,
      );
    },
    discard() {
      events = [];
      lastStoredHeadingAtMs = null;
    },
  };
}

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
  beginSession(): void;
  stopRecording(): void;
  record(event: DiagnosticEvent): void;
  eventCount(): number;
  snapshot(): readonly DiagnosticEvent[];
  exportJson(metadata: DiagnosticSessionMetadata): string;
  discard(): void;
}

const HEADING_STORAGE_INTERVAL_MS = 200;
export const MAX_DIAGNOSTIC_EVENTS = 12_000;

export function createDiagnosticTrace(options: DiagnosticTraceOptions): DiagnosticTrace {
  const events = new Array<DiagnosticEvent | undefined>(MAX_DIAGNOSTIC_EVENTS);
  let recording = false;
  let startIndex = 0;
  let count = 0;
  let droppedEventCount = 0;
  let lastStoredHeadingAtMs: number | null = null;

  function clear(): void {
    events.fill(undefined);
    startIndex = 0;
    count = 0;
    droppedEventCount = 0;
    lastStoredHeadingAtMs = null;
  }

  function orderedEvents(): DiagnosticEvent[] {
    const result: DiagnosticEvent[] = [];
    for (let offset = 0; offset < count; offset += 1) {
      const event = events[(startIndex + offset) % MAX_DIAGNOSTIC_EVENTS];
      if (event !== undefined) {
        result.push(event);
      }
    }
    return result;
  }

  return {
    beginSession() {
      clear();
      recording = true;
    },
    stopRecording() {
      recording = false;
    },
    record(event) {
      if (!recording) {
        return;
      }
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
      if (count < MAX_DIAGNOSTIC_EVENTS) {
        events[(startIndex + count) % MAX_DIAGNOSTIC_EVENTS] = event;
        count += 1;
        return;
      }
      events[startIndex] = event;
      startIndex = (startIndex + 1) % MAX_DIAGNOSTIC_EVENTS;
      droppedEventCount += 1;
    },
    eventCount() {
      return count;
    },
    snapshot() {
      return orderedEvents();
    },
    exportJson(metadata) {
      return JSON.stringify(
        {
          schemaVersion: 2,
          buildSha: options.buildSha,
          policyVersion: options.policyVersion,
          session: metadata,
          retention: {
            maxEvents: MAX_DIAGNOSTIC_EVENTS,
            droppedEventCount,
          },
          events: orderedEvents(),
        },
        null,
        2,
      );
    },
    discard() {
      recording = false;
      clear();
    },
  };
}

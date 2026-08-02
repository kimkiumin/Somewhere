import type { SensorSnapshot } from "./controller";
import type { DiagnosticTrace } from "./diagnostics";

export interface JourneyDiagnosticRecorder {
  recordSensorSamples(sensors: SensorSnapshot): void;
}

export function createJourneyDiagnosticRecorder(
  diagnostics: DiagnosticTrace,
): JourneyDiagnosticRecorder {
  let lastRecordedLocationAtMs: number | null = null;
  let lastRecordedHeadingAtMs: number | null = null;

  return {
    recordSensorSamples(sensors) {
      if (
        sensors.location.status === "live" &&
        sensors.location.sample.capturedAtMs !== lastRecordedLocationAtMs
      ) {
        const sample = sensors.location.sample;
        lastRecordedLocationAtMs = sample.capturedAtMs;
        diagnostics.record({
          type: "location",
          capturedAtMs: sample.capturedAtMs,
          values: {
            latitude: sample.coordinates.latitude,
            longitude: sample.coordinates.longitude,
            accuracyM: sample.accuracyM,
            movementHeadingTrueDeg: sample.movementHeadingTrueDeg ?? null,
            speedMps: sample.speedMps ?? null,
          },
        });
      }
      if (
        sensors.heading.status === "live" &&
        sensors.heading.sample.capturedAtMs !== lastRecordedHeadingAtMs
      ) {
        const sample = sensors.heading.sample;
        lastRecordedHeadingAtMs = sample.capturedAtMs;
        diagnostics.record({
          type: "heading",
          capturedAtMs: sample.capturedAtMs,
          values: {
            degrees: sample.degrees,
            reference: sample.reference,
            accuracyDeg: sample.accuracyDeg,
          },
        });
      }
    },
  };
}

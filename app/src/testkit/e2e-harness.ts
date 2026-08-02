import type { JourneyApplication } from "../application/journey-application";
import type { PermissionOutcome } from "../application/ports";
import type { ScriptedSensorRig } from "./fakes";
import type { V2ApiCall } from "./v2-fakes";

export type SomewhereTestApi = {
  readonly emitDistance: (distanceM: number, accuracyM: number) => void;
  readonly emitOrigin: () => void;
  readonly emitLocationOnly: (distanceM: number, accuracyM: number) => void;
  readonly emitHeadingOnly: (trueDegrees: number, accuracyDeg: number) => void;
  readonly setVisibility: (state: string) => void;
  readonly setHeadingPermission: (status: string) => void;
  readonly releaseWakeLock: () => void;
  readonly advanceMs: (milliseconds: number) => void;
  readonly snapshot: () => ReturnType<JourneyApplication["snapshot"]>;
  readonly calls: () => readonly V2ApiCall[];
  readonly injectMaliciousDisclosure: () => Promise<void>;
};

function coordinatesNorthOf(
  latitude: number,
  longitude: number,
  distanceM: number,
): { readonly latitude: number; readonly longitude: number } {
  return {
    latitude: latitude + distanceM / 111_195,
    longitude,
  };
}

export function createE2eHarness(
  application: JourneyApplication,
  sensors: ScriptedSensorRig,
  endpoint: Readonly<{ latitude: number; longitude: number }>,
  calls: () => readonly V2ApiCall[],
  injectMaliciousDisclosure: () => Promise<void>,
): SomewhereTestApi {
  function selectedCoordinates(): { readonly latitude: number; readonly longitude: number } {
    const snapshot = application.snapshot();
    const journey = snapshot.journey;
    if (journey.phase === "idle" || journey.phase === "selecting") {
      throw new Error("A destination must be selected before emitting a scripted walk.");
    }
    return endpoint;
  }

  function locationAtDistance(distanceM: number, accuracyM: number): void {
    const selected = selectedCoordinates();
    sensors.advanceMs(3_000);
    sensors.emitLocation({
      coordinates: coordinatesNorthOf(selected.latitude, selected.longitude, distanceM),
      accuracyM,
      capturedAtMs: sensors.nowMs(),
      movementHeadingTrueDeg: 180,
      speedMps: 1.2,
    });
  }

  return {
    emitOrigin() {
      sensors.emitLocation({
        coordinates: coordinatesNorthOf(endpoint.latitude, endpoint.longitude, 1_000),
        accuracyM: 8,
        capturedAtMs: sensors.nowMs(),
      });
    },
    emitDistance(distanceM, accuracyM) {
      locationAtDistance(distanceM, accuracyM);
      sensors.emitHeading({
        degrees: 180,
        reference: "true",
        accuracyDeg: 8,
        capturedAtMs: sensors.nowMs(),
      });
    },
    emitLocationOnly: locationAtDistance,
    emitHeadingOnly(trueDegrees, accuracyDeg) {
      sensors.advanceMs(250);
      sensors.emitHeading({
        degrees: trueDegrees,
        reference: "true",
        accuracyDeg,
        capturedAtMs: sensors.nowMs(),
      });
    },
    setVisibility(state) {
      if (state === "visible" || state === "hidden") {
        sensors.setVisibility(state);
      }
    },
    setHeadingPermission(status) {
      let outcome: PermissionOutcome;
      if (status === "granted" || status === "denied" || status === "unsupported") {
        outcome = { status };
      } else {
        outcome = { status: "error", message: "Scripted permission error." };
      }
      sensors.setHeadingPermission(outcome);
    },
    releaseWakeLock: () => sensors.releaseWakeLockFromSystem(),
    advanceMs: (milliseconds) => sensors.advanceMs(milliseconds),
    snapshot: () => application.snapshot(),
    calls,
    injectMaliciousDisclosure,
  };
}

import type { JourneyApplication } from "../application/journey-application";
import type { PermissionOutcome } from "../application/ports";
import type { DestinationBundle } from "../platform/curated-destinations";
import type { ScriptedSensorRig } from "./fakes";

export type SomewhereTestApi = {
  readonly emitDistance: (distanceM: number, accuracyM: number) => void;
  readonly emitLocationOnly: (distanceM: number, accuracyM: number) => void;
  readonly emitHeadingOnly: (trueDegrees: number, accuracyDeg: number) => void;
  readonly setVisibility: (state: string) => void;
  readonly setHeadingPermission: (status: string) => void;
  readonly releaseWakeLock: () => void;
  readonly snapshot: () => ReturnType<JourneyApplication["snapshot"]>;
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
  bundle: DestinationBundle,
): SomewhereTestApi {
  function selectedCoordinates(): { readonly latitude: number; readonly longitude: number } {
    const snapshot = application.snapshot();
    const journey = snapshot.journey;
    if (journey.phase === "idle" || journey.phase === "selecting") {
      throw new Error("A destination must be selected before emitting a scripted walk.");
    }
    const selected = bundle.destinations.find(
      (destination) => destination.id === journey.destinationId,
    );
    if (selected === undefined) {
      throw new Error("Selected scripted destination is missing.");
    }
    return selected.coordinates;
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
    snapshot: () => application.snapshot(),
  };
}

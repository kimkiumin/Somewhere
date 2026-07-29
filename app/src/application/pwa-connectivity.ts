import type { JourneyGuidance } from "./journey-guidance";

export type PwaGuidanceConfidence = JourneyGuidance["status"];

export type PwaConnectivitySnapshot = {
  readonly network: "online" | "offline";
  readonly journey: "idle" | "continuing" | "paused";
  readonly canStart: boolean;
};

export interface PwaConnectivityController {
  snapshot(): PwaConnectivitySnapshot;
  setOnline(online: boolean): void;
  setJourneyActive(active: boolean): void;
  setGuidanceConfidence(confidence: PwaGuidanceConfidence): void;
}

export function createPwaConnectivityController(
  initiallyOnline: boolean,
): PwaConnectivityController {
  let online = initiallyOnline;
  let journeyActive = false;
  let confidence: PwaGuidanceConfidence = "inactive";

  return {
    snapshot() {
      if (!journeyActive) {
        return {
          network: online ? "online" : "offline",
          journey: "idle",
          canStart: online,
        };
      }
      return {
        network: online ? "online" : "offline",
        journey: confidence === "live" ? "continuing" : "paused",
        canStart: false,
      };
    },
    setOnline(nextOnline) {
      online = nextOnline;
    },
    setJourneyActive(active) {
      journeyActive = active;
      if (!active) {
        confidence = "inactive";
      }
    },
    setGuidanceConfidence(nextConfidence) {
      confidence = nextConfidence;
    },
  };
}

import type { JourneyProjectionV1 } from "@somewhere/contracts";
import type { JourneyState } from "../domain/journey";
import type { Unsubscribe } from "./ports";

export type PwaJourneyPhase = JourneyState["phase"] | JourneyProjectionV1["phase"];

export interface PwaUpdateSource {
  listen(onUpdateReady: (applyUpdate: () => Promise<void>) => void): void;
}

export type PwaUpdateSnapshot =
  | { readonly status: "none" }
  | { readonly status: "deferred" }
  | { readonly status: "available" };

export interface PwaUpdateController {
  snapshot(): PwaUpdateSnapshot;
  setJourneyPhase(phase: PwaJourneyPhase): void;
  accept(): Promise<void>;
  subscribe(listener: (snapshot: PwaUpdateSnapshot) => void): Unsubscribe;
}

export function createPwaUpdateController(
  source: PwaUpdateSource,
  initialPhase: PwaJourneyPhase,
): PwaUpdateController {
  let phase = initialPhase;
  let applyUpdate: (() => Promise<void>) | null = null;
  let status: PwaUpdateSnapshot["status"] = "none";
  const listeners = new Set<(snapshot: PwaUpdateSnapshot) => void>();

  function snapshot(): PwaUpdateSnapshot {
    return { status };
  }

  function notify(): void {
    const next = snapshot();
    for (const listener of listeners) {
      listener(next);
    }
  }

  source.listen((apply) => {
    applyUpdate = apply;
    status = phase === "idle" ? "available" : "deferred";
    notify();
  });

  return {
    snapshot,
    setJourneyPhase(nextPhase) {
      phase = nextPhase;
      if (applyUpdate === null) {
        return;
      }
      const nextStatus = phase === "idle" ? "available" : "deferred";
      if (nextStatus !== status) {
        status = nextStatus;
        notify();
      }
    },
    async accept() {
      if (status !== "available" || applyUpdate === null) {
        return;
      }
      const apply = applyUpdate;
      applyUpdate = null;
      status = "none";
      notify();
      await apply();
    },
    subscribe(listener) {
      listeners.add(listener);
      let active = true;
      return () => {
        if (active) {
          active = false;
          listeners.delete(listener);
        }
      };
    },
  };
}

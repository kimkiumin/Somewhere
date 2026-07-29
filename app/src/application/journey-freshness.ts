import type { SensorSnapshot } from "./controller";
import { freshnessDeadlineMs } from "./journey-guidance";
import type { Clock, DeadlineScheduler, Unsubscribe } from "./ports";

export interface JourneyFreshnessWatchdog {
  refresh(sensors: SensorSnapshot, active: boolean, onExpire: () => void): void;
  cancel(): void;
}

export function createJourneyFreshnessWatchdog(
  clock: Clock,
  scheduler: DeadlineScheduler,
): JourneyFreshnessWatchdog {
  let scheduledDeadlineMs: number | null = null;
  let cancelDeadline: Unsubscribe | null = null;

  function cancel(): void {
    cancelDeadline?.();
    cancelDeadline = null;
    scheduledDeadlineMs = null;
  }

  return {
    refresh(sensors, active, onExpire) {
      const deadlineMs = active ? freshnessDeadlineMs(sensors) : null;
      if (deadlineMs === null || deadlineMs <= clock.nowMs()) {
        cancel();
        return;
      }
      if (deadlineMs === scheduledDeadlineMs) {
        return;
      }
      cancel();
      scheduledDeadlineMs = deadlineMs;
      cancelDeadline = scheduler.schedule(deadlineMs - clock.nowMs(), () => {
        cancelDeadline = null;
        scheduledDeadlineMs = null;
        onExpire();
      });
    },
    cancel,
  };
}

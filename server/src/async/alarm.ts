import type { JourneyState } from "../journey/types";

export type AlarmPlan =
  | Readonly<{ alarmAt: number; kind: "scheduled" }>
  | Readonly<{ kind: "terminal" }>;

export function planJourneyAlarm(
  state: JourneyState | null,
  nextOutboxAt: number | null,
): AlarmPlan {
  if (state === null) {
    return { kind: "terminal" };
  }
  const candidates = [
    state.expiresAt,
    nextOutboxAt,
    state.feedback?.status === "scheduled" ? state.feedback.dueAt : null,
  ].filter((value): value is number => value !== null);
  return { alarmAt: Math.min(...candidates), kind: "scheduled" };
}

export function alarmWork(
  state: JourneyState | null,
  now: number,
): "terminal" | "expire" | "feedback" | "outbox" {
  if (state === null) {
    return "terminal";
  }
  if (state.expiresAt <= now) {
    return "expire";
  }
  if (
    state.feedback !== undefined &&
    state.feedback.status === "scheduled" &&
    state.feedback.dueAt <= now
  ) {
    return "feedback";
  }
  return "outbox";
}

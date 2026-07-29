import type {
  JourneyApplicationSnapshot,
  ReactionStopReason,
  RouteRecoveryChoice,
} from "../application/journey-application";
import type { FeedbackPrompt, RecoveryIntent } from "../application/v2-api";
import { actionButton, element, instrumentHeader } from "./dom-primitives";
import {
  constraintsScreen,
  findingScreen,
  guidanceScreen,
  readyScreen,
  startScreen,
} from "./journey-screens";

export type UiState = Readonly<{
  setup: "start" | "constraints" | "finding";
  stopPending: boolean;
  recoveryIntent: RecoveryIntent | null;
  feedbackPrompt: FeedbackPrompt | null;
  routeRecoveryOpen: boolean;
  updateAvailable: boolean;
}>;

const STOP_REASONS: readonly [ReactionStopReason, string][] = [
  ["safety-concern", "안전이 걱정돼요"],
  ["route-or-sensor", "길 안내가 불안정해요"],
  ["hard-condition", "조건과 맞지 않아요"],
  ["venue-situation", "장소 상황이 달라요"],
  ["changed-mind", "마음이 바뀌었어요"],
  ["schedule-changed", "일정이 바뀌었어요"],
];

const ROUTE_CHOICES: readonly [RouteRecoveryChoice, string][] = [
  ["recalibrate", "나침반 다시 맞추기"],
  ["reroute", "경로 다시 찾기"],
  ["cached-route", "확인된 경로 이어가기"],
  ["external-map", "외부 지도 열기 · 목적지 공개"],
];

function stopConfirmation(main: HTMLElement): void {
  const dialog = element("section", "decision-panel");
  dialog.setAttribute("aria-labelledby", "stop-title");
  const title = element("h1", undefined, "정말 중단할까요?");
  title.id = "stop-title";
  dialog.append(
    element("p", "eyebrow", "방향 안내를 멈췄어요"),
    title,
    element("p", "body-copy muted", "계속하면 같은 여정을 안전한 새 신호부터 이어갑니다."),
  );
  const row = element("div", "safety-row");
  row.append(
    actionButton("계속하기", "cancel-stop"),
    actionButton("중단 확정", "confirm-stop", "button--caution"),
  );
  dialog.append(row);
  main.append(dialog);
}

function reasonScreen(main: HTMLElement): void {
  const group = element("section", "decision-panel");
  group.append(
    element("p", "eyebrow", "안내가 종료됐어요"),
    element("h1", undefined, "중단한 이유가 있나요?"),
    element("p", "body-copy muted", "답하지 않아도 바로 나갈 수 있어요."),
  );
  const reasons = element("div", "reason-list");
  for (const [value, label] of STOP_REASONS) {
    const button = actionButton(label, "stop-reason", "button--secondary button--wide");
    button.dataset.value = value;
    reasons.append(button);
  }
  reasons.append(actionButton("건너뛰기", "skip-reason", "button--quiet button--wide"));
  group.append(reasons);
  main.append(group);
}

function completedScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
  main.append(
    element("p", "eyebrow", "여정 종료"),
    element("h1", undefined, "안전하게 마쳤어요."),
    element("p", "body-copy muted", "새 장소를 원하면 조건을 한 번 확인한 뒤 다시 찾을 수 있어요."),
  );
  if (snapshot.revealedDestination === null) {
    main.append(actionButton("목적지 확인", "reveal"));
  }
  if (snapshot.projection?.phase === "completed" && "recoveryExpiresAt" in snapshot.projection) {
    main.append(actionButton("새 장소 찾기", "request-recovery", "button--primary button--wide"));
  } else {
    main.append(actionButton("처음으로", "restart", "button--primary button--wide"));
  }
}

function routeRecovery(main: HTMLElement): void {
  const panel = element("section", "decision-panel");
  panel.append(
    element("p", "eyebrow", "안내 복구"),
    element("h1", undefined, "어떻게 이어갈까요?"),
    element("p", "body-copy muted", "선택하기 전에는 방향을 표시하지 않아요."),
  );
  for (const [value, label] of ROUTE_CHOICES) {
    const button = actionButton(label, "route-recover", "button--secondary button--wide");
    button.dataset.value = value;
    panel.append(button);
  }
  panel.append(actionButton("돌아가기", "close-route-recovery", "button--quiet button--wide"));
  main.append(panel);
}

function recoveryReview(main: HTMLElement, intent: RecoveryIntent): void {
  const panel = element("section", "decision-panel");
  panel.append(
    element("p", "eyebrow", "조건 다시 보기"),
    element("h1", undefined, "바꿀 조건을 확인해요."),
    element("p", "body-copy muted", "이전 장소를 제외하고 새로운 한 곳을 찾아요."),
  );
  const list = element("ul", "review-list");
  for (const field of intent.requiredReviewFields) {
    list.append(
      element("li", undefined, field === "constraints" ? "카테고리 · 거리 · 예산" : field),
    );
  }
  panel.append(
    list,
    actionButton("확인하고 다시 찾기", "confirm-recovery", "button--primary button--wide"),
  );
  main.append(panel);
}

function feedbackScreen(main: HTMLElement, prompt: FeedbackPrompt): void {
  main.append(
    element("p", "eyebrow", "한 번만 여쭤볼게요"),
    element("h1", undefined, "이 장소는 어땠나요?"),
  );
  for (const [reaction, label] of [
    ["dislike", "싫어요"],
    ["like", "좋아요"],
    ["love", "매우 좋아요"],
    ["did_not_visit", "가지 않았어요"],
  ] as const) {
    const button = actionButton(label, "reaction", "button--secondary button--wide");
    button.dataset.value = reaction;
    button.dataset.feedbackId = prompt.feedbackId;
    main.append(button);
  }
}

export function renderSomewhere(
  root: HTMLElement,
  snapshot: JourneyApplicationSnapshot,
  uiState: UiState,
): void {
  const main = element("main", "app-shell");
  main.dataset.appScreen = "";
  main.append(instrumentHeader());
  if (uiState.feedbackPrompt !== null) {
    feedbackScreen(main, uiState.feedbackPrompt);
  } else if (uiState.recoveryIntent !== null) {
    recoveryReview(main, uiState.recoveryIntent);
  } else if (uiState.routeRecoveryOpen) {
    routeRecovery(main);
  } else if (uiState.stopPending || snapshot.projection?.phase === "paused") {
    stopConfirmation(main);
  } else if (snapshot.projection?.phase === "stopped") {
    reasonScreen(main);
  } else if (snapshot.projection?.phase === "completed") {
    completedScreen(main, snapshot);
  } else if (snapshot.projection?.phase === "finding" || snapshot.journey.phase === "selecting") {
    findingScreen(main);
  } else if (snapshot.projection?.phase === "ready" || snapshot.journey.phase === "hidden") {
    readyScreen(main, snapshot);
  } else if (snapshot.projection === null && snapshot.journey.phase === "idle") {
    if (uiState.setup === "start") {
      startScreen(main);
    } else if (uiState.setup === "constraints") {
      constraintsScreen(main);
    } else {
      findingScreen(main);
    }
  } else {
    guidanceScreen(main, snapshot);
  }
  if (
    uiState.updateAvailable &&
    snapshot.projection === null &&
    snapshot.journey.phase === "idle"
  ) {
    const update = element("aside", "update-notice");
    update.append(
      element("p", "small-copy", "새 버전이 준비됐어요."),
      actionButton("Somewhere 업데이트", "accept-update"),
    );
    main.append(update);
  }
  root.querySelector(":scope > main")?.replaceWith(main) ?? root.prepend(main);
  let live = root.querySelector<HTMLElement>("[data-app-live]");
  if (live === null) {
    live = element("p", "sr-only");
    live.dataset.appLive = "";
    live.setAttribute("aria-live", "polite");
    root.append(live);
  }
  live.textContent =
    snapshot.projection?.phase === "near"
      ? "목적지에 가까워졌어요."
      : snapshot.projection?.phase === "arrived"
        ? "도착했어요."
        : snapshot.projection?.phase === "paused"
          ? "방향 안내를 멈췄어요."
          : "";
}

export function renderKey(snapshot: JourneyApplicationSnapshot, uiState: UiState): string {
  const disclosure =
    snapshot.projection !== null &&
    snapshot.projection.phase !== "finding" &&
    snapshot.projection.phase !== "expired"
      ? snapshot.projection.disclosure
      : null;
  return JSON.stringify({
    phase: snapshot.projection?.phase ?? snapshot.journey.phase,
    sequence: snapshot.projection?.sequence ?? 0,
    revealed: snapshot.revealedDestination !== null,
    guidance: snapshot.guidance.status,
    distance: snapshot.guidance.status === "live" ? Math.round(snapshot.guidance.distanceM) : null,
    disclosure,
    failure: snapshot.failure?.code ?? null,
    uiState,
  });
}

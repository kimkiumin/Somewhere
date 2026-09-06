import type {
  JourneyApplication,
  JourneyPreferences,
  ReactionStopReason,
  RouteRecoveryChoice,
} from "./application/journey-application";
import { createPwaUpdateController, type PwaUpdateController } from "./application/pwa-update";
import type { ReactionBody } from "./application/v2-api";
import { createProductionComposition, createTestComposition } from "./composition";
import { createBrowserPwaUpdateSource } from "./platform/browser-pwa";
import { createScriptedPwaUpdateSource } from "./testkit/pwa-update-source";
import { createCompassAnimator } from "./ui/compass";
import { renderKey, renderSomewhere, type UiState } from "./ui/render";
import "./ui/styles.css";

function requireAppRoot(): HTMLElement {
  const node = document.querySelector<HTMLElement>("#app");
  if (node === null) {
    throw new Error("Somewhere app root is missing.");
  }
  return node;
}

function normalizedError(error: unknown): Error {
  return error instanceof Error ? error : new Error("잠시 뒤 다시 시도해 주세요.");
}

function renderFatal(root: HTMLElement, error: Error): void {
  const main = document.createElement("main");
  main.className = "app-shell";
  const heading = document.createElement("h1");
  heading.textContent = "연결을 다시 확인해 주세요.";
  const copy = document.createElement("p");
  copy.className = "body-copy muted";
  copy.textContent = error.message;
  const reload = document.createElement("button");
  reload.className = "button button--primary";
  reload.type = "button";
  reload.textContent = "다시 불러오기";
  reload.addEventListener("click", () => window.location.reload());
  main.append(heading, copy, reload);
  root.replaceChildren(main);
}

function preferences(root: HTMLElement): JourneyPreferences {
  const form = root.querySelector<HTMLFormElement>("#constraints-form");
  const values = form === null ? new FormData() : new FormData(form);
  const category = "restaurant" as const;
  const budgetValue = values.get("budgetBand");
  const budgetBand = budgetValue === "low" || budgetValue === "high" ? budgetValue : "medium";
  const walkValue = Number(values.get("maxWalkMinutes"));
  const maxWalkMinutes = Number.isInteger(walkValue) && walkValue > 0 ? walkValue : 30;
  return { budgetBand, category, disclosureLevel: "standard", maxWalkMinutes };
}

function stopReason(value: string | undefined): ReactionStopReason | null {
  switch (value) {
    case "safety-concern":
    case "route-or-sensor":
    case "hard-condition":
    case "venue-situation":
    case "changed-mind":
    case "schedule-changed":
      return value;
    default:
      return null;
  }
}

function recoveryChoice(value: string | undefined): RouteRecoveryChoice | null {
  switch (value) {
    case "recalibrate":
    case "reroute":
    case "cached-route":
    case "external-map":
      return value;
    default:
      return null;
  }
}

function reaction(value: string | undefined): ReactionBody["reaction"] | null {
  switch (value) {
    case "dislike":
    case "like":
    case "love":
    case "did_not_visit":
      return value;
    default:
      return null;
  }
}

function mount(
  root: HTMLElement,
  application: JourneyApplication,
  pwaUpdates: PwaUpdateController,
): void {
  let uiState: UiState = {
    setup: "start",
    stopPending: false,
    recoveryIntent: null,
    feedbackPrompt: null,
    routeRecoveryOpen: false,
    updateAvailable: pwaUpdates.snapshot().status === "available",
  };
  let lastRenderKey = "";
  let feedbackTimer: number | null = null;
  let focusHeading = false;
  const animator = createCompassAnimator(root);

  function render(force = false): void {
    const snapshot = application.snapshot();
    animator.update(
      snapshot.guidance.status === "live" && !uiState.stopPending
        ? snapshot.guidance.relativeAngleDeg
        : null,
    );
    const nextKey = renderKey(snapshot, uiState);
    if (!force && nextKey === lastRenderKey) {
      return;
    }
    const focusedAction =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.action
        : undefined;
    renderSomewhere(root, snapshot, uiState);
    animator.applyCurrent();
    if (focusHeading) {
      const heading = root.querySelector<HTMLElement>("h1");
      if (heading !== null) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      focusHeading = false;
    } else if (focusedAction !== undefined) {
      root
        .querySelector<HTMLElement>(`[data-action="${focusedAction}"]`)
        ?.focus({ preventScroll: true });
    }
    lastRenderKey = nextKey;
  }

  const fail = (error: unknown) => renderFatal(root, normalizedError(error));
  const stopApplication = application.subscribe((snapshot) => {
    if (snapshot.projection?.phase === "paused") {
      uiState = { ...uiState, stopPending: false };
    }
    pwaUpdates.setJourneyPhase(snapshot.journey.phase);
    render();
    if (
      feedbackTimer === null &&
      snapshot.projection?.phase === "arrived" &&
      uiState.feedbackPrompt === null
    ) {
      feedbackTimer = window.setTimeout(
        () => {
          application
            .eligibleFeedback()
            .then((prompt) => {
              if (prompt !== null) {
                uiState = { ...uiState, feedbackPrompt: prompt };
                render(true);
              }
            })
            .catch(() => undefined);
        },
        Math.max(0, snapshot.projection.feedbackDueAt - Date.now()),
      );
    }
  });
  const stopPwaUpdates = pwaUpdates.subscribe((snapshot) => {
    uiState = { ...uiState, updateAvailable: snapshot.status === "available" };
    render(true);
  });

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const button = event.target.closest<HTMLButtonElement>("button[data-action]");
    if (button === null) {
      return;
    }
    focusHeading = true;
    switch (button.dataset.action) {
      case "open-constraints":
        uiState = { ...uiState, setup: "constraints" };
        render(true);
        break;
      case "find": {
        const selectedPreferences = preferences(root);
        uiState = { ...uiState, setup: "finding" };
        render(true);
        application.startAdventure(selectedPreferences).catch(fail);
        break;
      }
      case "commit":
        application.beginWalk();
        break;
      case "reveal":
        application.reveal();
        break;
      case "stop":
        uiState = { ...uiState, stopPending: true };
        render(true);
        application.stop().catch(fail);
        break;
      case "cancel-stop":
        application.cancelStop().catch(fail);
        break;
      case "confirm-stop":
        application.confirmStop().catch(fail);
        break;
      case "stop-reason": {
        const reason = stopReason(button.dataset.value);
        if (reason !== null) {
          application.recordStopReason(reason).catch(fail);
        }
        break;
      }
      case "skip-reason":
        application.recordStopReason("skip").catch(fail);
        break;
      case "open-route-recovery":
        uiState = { ...uiState, routeRecoveryOpen: true };
        render(true);
        break;
      case "close-route-recovery":
        uiState = { ...uiState, routeRecoveryOpen: false };
        render(true);
        break;
      case "route-recover": {
        const choice = recoveryChoice(button.dataset.value);
        if (choice !== null) {
          uiState = { ...uiState, routeRecoveryOpen: false };
          application.recoverRoute(choice).catch(fail);
        }
        break;
      }
      case "request-recovery":
        application
          .requestRecovery()
          .then((intent) => {
            uiState = { ...uiState, recoveryIntent: intent };
            render(true);
          })
          .catch(fail);
        break;
      case "confirm-recovery":
        if (uiState.recoveryIntent !== null) {
          application
            .confirmRecovery(uiState.recoveryIntent, uiState.recoveryIntent.requiredReviewFields)
            .then(() => {
              uiState = { ...uiState, recoveryIntent: null };
              render(true);
            })
            .catch(fail);
        }
        break;
      case "reaction": {
        const selectedReaction = reaction(button.dataset.value);
        const feedbackId = button.dataset.feedbackId;
        if (selectedReaction !== null && feedbackId !== undefined) {
          application
            .recordReaction(feedbackId, selectedReaction)
            .then(() => {
              uiState = { ...uiState, feedbackPrompt: null };
              render(true);
            })
            .catch(fail);
        }
        break;
      }
      case "restart":
        window.location.reload();
        break;
      case "accept-update":
        pwaUpdates.accept().catch(fail);
        break;
    }
  });
  window.addEventListener(
    "pagehide",
    () => {
      stopApplication();
      stopPwaUpdates();
      animator.destroy();
      if (feedbackTimer !== null) {
        window.clearTimeout(feedbackTimer);
      }
      application.destroy().catch(() => undefined);
    },
    { once: true },
  );
  render(true);
  application
    .eligibleFeedback()
    .then((prompt) => {
      if (prompt !== null) {
        uiState = { ...uiState, feedbackPrompt: prompt };
        render(true);
      }
    })
    .catch(() => undefined);
}

function bootstrap(): void {
  const root = requireAppRoot();
  if (import.meta.env.MODE === "test-harness") {
    const composition = createTestComposition();
    if (composition.testApi === null) {
      throw new Error("Test harness composition is missing its control API.");
    }
    const updates = createScriptedPwaUpdateSource();
    Reflect.set(composition.testApi, "triggerUpdate", () => updates.emitReady());
    Reflect.set(window, "somewhereTest", composition.testApi);
    mount(root, composition.application, createPwaUpdateController(updates, "idle"));
    return;
  }
  const composition = createProductionComposition();
  mount(
    root,
    composition.application,
    createPwaUpdateController(createBrowserPwaUpdateSource(), "idle"),
  );
}

try {
  bootstrap();
} catch (error) {
  renderFatal(requireAppRoot(), normalizedError(error));
}

import type { DiagnosticSessionMetadata } from "./application/diagnostics";
import type { JourneyApplication } from "./application/journey-application";
import { createProductionComposition, createTestComposition } from "./composition";
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

const root = requireAppRoot();

function normalizedError(error: unknown): Error {
  return error instanceof Error ? error : new Error("An unexpected startup error occurred.");
}

function renderFatal(error: Error): void {
  const main = document.createElement("main");
  main.className = "app-shell";
  const heading = document.createElement("h1");
  heading.textContent = "Somewhere needs a reset.";
  const copy = document.createElement("p");
  copy.className = "lead muted";
  copy.textContent = error.message;
  const reload = document.createElement("button");
  reload.className = "button button--primary";
  reload.type = "button";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => window.location.reload());
  main.append(heading, copy, reload);
  root.replaceChildren(main);
}

function browserMode(): DiagnosticSessionMetadata["browserMode"] {
  return window.matchMedia("(display-mode: standalone)").matches ? "home-screen" : "other";
}

function downloadTrace(application: JourneyApplication, uiState: UiState): void {
  const json = application.exportDiagnostics({
    browserMode: browserMode(),
    environmentLabel: uiState.environmentLabel,
    userAgent: navigator.userAgent,
  });
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `somewhere-field-trace-${new Date().toISOString()}.json`;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

function mount(application: JourneyApplication): void {
  let uiState: UiState = {
    diagnosticsOpen: false,
    environmentLabel: "other",
  };
  let lastRenderKey = "";
  const animator = createCompassAnimator(root);

  function render(force = false): void {
    const snapshot = application.snapshot();
    animator.update(
      snapshot.guidance.status === "live" ? snapshot.guidance.relativeAngleDeg : null,
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
    lastRenderKey = nextKey;
    if (focusedAction !== undefined) {
      root
        .querySelector<HTMLElement>(`[data-action="${focusedAction}"]`)
        ?.focus({ preventScroll: true });
    }
  }

  const stopApplication = application.subscribe(() => render());
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const button = event.target.closest<HTMLButtonElement>("button[data-action]");
    if (button === null) {
      return;
    }
    switch (button.dataset.action) {
      case "start":
        application.startAdventure().catch((error: unknown) => renderFatal(normalizedError(error)));
        break;
      case "begin":
        application.beginWalk();
        break;
      case "retry":
        application.retrySignals().catch((error: unknown) => renderFatal(normalizedError(error)));
        break;
      case "reveal":
        application.reveal();
        break;
      case "give-up":
        application.giveUp();
        break;
      case "reroll":
        application.reroll();
        break;
      case "restart":
        window.location.reload();
        break;
      case "open-diagnostics":
        uiState = { ...uiState, diagnosticsOpen: true };
        render(true);
        break;
      case "close-diagnostics":
        uiState = { ...uiState, diagnosticsOpen: false };
        render(true);
        break;
      case "download-diagnostics":
        downloadTrace(application, uiState);
        break;
      case "discard-diagnostics":
        application.discardDiagnostics();
        break;
    }
  });
  root.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }
    if (event.target.dataset.action !== "environment") {
      return;
    }
    const value = event.target.value;
    if (
      value === "open-sky" ||
      value === "urban-canyon" ||
      value === "indoor" ||
      value === "other"
    ) {
      uiState = { ...uiState, environmentLabel: value };
      render(true);
    }
  });
  window.addEventListener(
    "pagehide",
    () => {
      stopApplication();
      animator.destroy();
      application.destroy().catch(() => undefined);
    },
    { once: true },
  );
  render(true);
}

function bootstrap(): void {
  if (import.meta.env.MODE === "test-harness") {
    const composition = createTestComposition();
    if (composition.testApi === null) {
      throw new Error("Test harness composition is missing its control API.");
    }
    Reflect.set(window, "somewhereTest", composition.testApi);
    mount(composition.application);
    return;
  }

  mount(createProductionComposition().application);
}

try {
  bootstrap();
} catch (error) {
  if (error instanceof Error) {
    renderFatal(error);
  } else {
    renderFatal(new Error("An unexpected startup error occurred."));
  }
}

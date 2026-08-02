import type { DiagnosticSessionMetadata } from "./application/diagnostics";
import type { JourneyApplication } from "./application/journey-application";
import { createProductionComposition } from "./composition";
import { diagnosticsPanel } from "./ui/diagnostics-panel";
import "./ui/field.css";

function rootNode(): HTMLElement {
  const root = document.querySelector<HTMLElement>("#field");
  if (root === null) {
    throw new Error("Field diagnostics root is missing.");
  }
  return root;
}

function metadata(): DiagnosticSessionMetadata {
  return {
    browserMode: window.matchMedia("(display-mode: standalone)").matches ? "home-screen" : "other",
    environmentLabel: "other",
    userAgent: navigator.userAgent,
  };
}

function exportTrace(application: JourneyApplication): void {
  const blob = new Blob([application.exportDiagnostics(metadata())], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `somewhere-field-trace-${new Date().toISOString()}.json`;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

const root = rootNode();
const application = createProductionComposition().application;

function render(): void {
  const main = document.createElement("main");
  main.className = "app-shell";
  main.append(diagnosticsPanel(application.snapshot()));
  root.replaceChildren(main);
}

const unsubscribe = application.subscribe(render);
root.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  switch (button?.dataset.action) {
    case "field-start":
      application.startAdventure().catch(() => undefined);
      break;
    case "field-retry":
      application.retrySignals().catch(() => undefined);
      break;
    case "field-export":
      exportTrace(application);
      break;
    case "field-discard":
      application.discardDiagnostics();
      render();
      break;
  }
});
window.addEventListener(
  "pagehide",
  () => {
    unsubscribe();
    application.destroy().catch(() => undefined);
  },
  { once: true },
);
render();

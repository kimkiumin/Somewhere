import type { PwaUpdateSource } from "../application/pwa-update";

export interface ScriptedPwaUpdateSource extends PwaUpdateSource {
  emitReady(): void;
  appliedCount(): number;
}

export function createScriptedPwaUpdateSource(): ScriptedPwaUpdateSource {
  let listener: ((applyUpdate: () => Promise<void>) => void) | null = null;
  let applied = 0;

  return {
    listen(next) {
      listener = next;
    },
    emitReady() {
      listener?.(() => {
        applied += 1;
        return Promise.resolve();
      });
    },
    appliedCount: () => applied,
  };
}

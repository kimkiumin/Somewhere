import { registerSW } from "virtual:pwa-register";
import type { PwaUpdateSource } from "../application/pwa-update";

export function createBrowserPwaUpdateSource(): PwaUpdateSource {
  return {
    listen(onUpdateReady) {
      const applyUpdate = registerSW({
        immediate: true,
        onNeedRefresh() {
          onUpdateReady(() => applyUpdate(true));
        },
      });
    },
  };
}

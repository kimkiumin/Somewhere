"use strict";

(function init(globalScope) {
  function boot() {
    const root = globalScope.document?.querySelector("#app");
    const controls = globalScope.document?.querySelector("#prototype-controls");
    if (!root || !controls) return null;
    return globalScope.RollTheCompassVNextController.mount(root, controls);
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { boot };
  globalScope.RollTheCompassVNextApp = { boot };
  if (globalScope.document) boot();
})(typeof globalThis !== "undefined" ? globalThis : window);

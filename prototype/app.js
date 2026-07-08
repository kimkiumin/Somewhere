"use strict";

(function initApp(globalScope) {
  const stateApi =
    globalScope.BlindCompassState ||
    (typeof require === "function" ? require("./state.js") : undefined);
  const icons =
    globalScope.BlindCompassIcons ||
    (typeof require === "function" ? require("./icons.js") : undefined);
  const components =
    globalScope.BlindCompassComponents ||
    (typeof require === "function" ? require("./components.js") : undefined);
  const screens =
    globalScope.BlindCompassScreens ||
    (typeof require === "function" ? require("./screens.js") : undefined);
  const controller =
    globalScope.BlindCompassController ||
    (typeof require === "function" ? require("./controller.js") : undefined);

  const api = {
    ...stateApi,
    icons,
    ...components,
    ...screens,
    ...controller,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.BlindCompass = api;

  if (globalScope.document) {
    globalScope.document.addEventListener("DOMContentLoaded", controller.init);
  }
})(typeof globalThis !== "undefined" ? globalThis : window);

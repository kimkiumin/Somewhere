"use strict";

(function initComponents(globalScope) {
  const stateApi =
    globalScope.BlindCompassState ||
    (typeof require === "function" ? require("./state.js") : undefined);
  const icons =
    globalScope.BlindCompassIcons ||
    (typeof require === "function" ? require("./icons.js") : undefined);

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function button(label, action, variant = "button-quiet", icon = "") {
    return `<button class="button ${variant}" type="button" data-action="${action}">${icon}${label}</button>`;
  }

  function renderCompass(publicState) {
    const headingDeg = Number(publicState.headingDeg) || 0;
    return `
      <div class="compass-stage" style="--heading-deg: ${headingDeg}deg" role="img" aria-label="Compass direction and approximate distance">
        <div class="compass-needle">${icons.arrow}</div>
        <div class="compass-readout">
          <div class="distance">${escapeHtml(stateApi.formatDistance(publicState.distanceM))}</div>
          <div class="distance-unit">approximate distance</div>
        </div>
      </div>
    `;
  }

  function renderHiddenPanel(publicState, message) {
    return `
      <div class="reveal-panel">
        <div class="status-line"><span class="status-dot"></span>${escapeHtml(message)}</div>
        <div class="info-grid">
          <div class="info-item">
            <p class="meta-label">Hint</p>
            <p class="info-value">${escapeHtml(publicState.hint)}</p>
          </div>
          <div class="info-item">
            <p class="meta-label">Distance</p>
            <p class="info-value">${escapeHtml(stateApi.formatDistance(publicState.distanceM))}</p>
          </div>
          <div class="info-item">
            <p class="meta-label">Time</p>
            <p class="info-value">${escapeHtml(stateApi.formatEstimatedTime(publicState.estimatedMinutes))}</p>
          </div>
          <div class="info-item">
            <p class="meta-label">Safety</p>
            <p class="info-value">${escapeHtml(publicState.safetyLevel)}</p>
          </div>
        </div>
      </div>
    `;
  }

  const api = {
    icons,
    escapeHtml,
    button,
    renderCompass,
    renderHiddenPanel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.BlindCompassComponents = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

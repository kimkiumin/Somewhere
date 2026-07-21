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
    const routeBearingDeg = Number(publicState.routeBearingDeg ?? publicState.headingDeg) || 0;
    const userHeadingDeg = Number(publicState.userHeadingDeg ?? publicState.headingDeg) || 0;
    const distance = stateApi.formatDistance(publicState.distanceM);
    return `
      <div class="compass-stage compass-${escapeHtml(publicState.phase)}" style="--bearing-deg: ${routeBearingDeg}deg; --user-heading-deg: ${userHeadingDeg}deg" role="img" aria-label="Compass direction ${escapeHtml(publicState.directionLabel)}; distance ${escapeHtml(distance)}">
        <div class="compass-cardinal compass-cardinal-n">N</div>
        <div class="compass-cardinal compass-cardinal-e">E</div>
        <div class="compass-cardinal compass-cardinal-s">S</div>
        <div class="compass-cardinal compass-cardinal-w">W</div>
        <div class="compass-bearing-ring" aria-hidden="true"></div>
        <div class="compass-needle" aria-hidden="true">
          <span class="needle-spine"></span>
          <span class="needle-head">${icons.arrow}</span>
          <span class="needle-pivot"></span>
        </div>
        <div class="compass-readout">
          <div class="distance">${escapeHtml(distance)}</div>
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

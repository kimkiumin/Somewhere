"use strict";

(function initScreens(globalScope) {
  const stateApi =
    globalScope.BlindCompassState ||
    (typeof require === "function" ? require("./state.js") : undefined);
  const components =
    globalScope.BlindCompassComponents ||
    (typeof require === "function" ? require("./components.js") : undefined);
  const { button, escapeHtml, icons, renderCompass, renderHiddenPanel } =
    components;

  function phaseLabel(phase) {
    const labels = {
      idle: "Idle",
      selecting: "Selecting",
      hidden: "Hidden",
      following: "Following",
      near: "Near",
      arrived: "Arrived",
      revealed: "Revealed",
      "give-up": "Give up",
      reroll: "Reroll",
    };
    return labels[phase] ?? "Idle";
  }

  function statusText(state) {
    if (!state) return "Ready when you are.";
    const messages = {
      hidden: "Your destination is hidden. Only the hint is available.",
      reroll: "A new hidden destination is ready.",
      following: "Keep going. The place is still hidden.",
      near: "Very close. Slow down and look around.",
      arrived: "Arrived. Ready to discover?",
      revealed: "Destination revealed.",
      "give-up": "You stepped out safely.",
    };
    return messages[state.phase] ?? "Ready when you are.";
  }

  function renderApp(root, model) {
    const currentPhase = model.loading ? "selecting" : (model.state?.phase ?? "idle");
    root.dataset.state = currentPhase;
    root.innerHTML = `
      <div class="app-frame app-frame-${escapeHtml(currentPhase)}">
        <header class="app-header">
          <div class="brand-lockup">
            <p class="eyebrow">Blind Compass</p>
            <p class="support-text">Follow the unknown.</p>
          </div>
          <div class="state-pill">${phaseLabel(currentPhase)}</div>
        </header>
        ${renderScreen(model)}
        ${
          currentPhase === "idle"
            ? `<footer class="app-footer">
                <p class="support-text"><strong>Safety:</strong> Reveal, Give Up, and Reroll stay available during the journey.</p>
              </footer>`
            : ""
        }
      </div>
    `;
  }

  function renderScreen(model) {
    if (model.loading) return renderSelecting();
    if (!model.state) return renderIdle();
    if (model.state.phase === "revealed") return renderRevealed(model.state);
    if (model.state.phase === "give-up") return renderGiveUp(model.state);
    return renderJourney(model.state);
  }

  function renderIdle() {
    return `
      <section class="screen" aria-labelledby="idle-title">
        <div class="screen-copy">
          <p class="eyebrow">v0.1 simulated walk</p>
          <h1 class="screen-title" id="idle-title">Follow the unknown.</h1>
          <p class="screen-text">Your destination will stay hidden. The compass gives only distance, direction, and a small hint.</p>
        </div>
        <div class="status-line"><span class="status-dot"></span>Mock destinations only. Simulated movement with local data.</div>
        <div class="actions">
          ${button("Start Adventure", "start", "button-primary", icons.arrow)}
        </div>
      </section>
    `;
  }

  function renderSelecting() {
    return `
      <section class="screen" aria-labelledby="selecting-title">
        <div class="loading-mark" aria-hidden="true"></div>
        <div class="screen-copy">
          <p class="eyebrow">Selecting</p>
          <h1 class="screen-heading" id="selecting-title">Choosing a safe nearby discovery...</h1>
          <p class="screen-text">The destination name stays hidden until you reveal it.</p>
        </div>
      </section>
    `;
  }

  function renderJourney(state) {
    const publicState = stateApi.toPublicJourney(state);
    const showCompass = ["following", "near", "arrived"].includes(state.phase);

    return `
      <section class="screen ${showCompass ? "screen-instrument" : ""}" aria-labelledby="journey-title">
        ${
          showCompass
            ? `<h1 class="visually-hidden" id="journey-title">${journeyHeading(state.phase)}</h1>`
            : `<div class="screen-copy">
                <p class="eyebrow">Hidden destination</p>
                <h1 class="screen-heading" id="journey-title">${journeyHeading(state.phase)}</h1>
              </div>`
        }
        ${
          showCompass
            ? renderCompass(publicState)
            : renderHiddenPanel(publicState, statusText(state))
        }
        ${showCompass ? `<p class="visually-hidden" aria-live="polite">${escapeHtml(statusText(state))}</p>` : ""}
        <div class="actions ${showCompass ? "actions-minimal" : ""}">
          ${
            showCompass && state.phase !== "arrived"
              ? button("Move closer", "move", "button-primary", icons.step)
              : ""
          }
          ${
            state.phase === "arrived"
              ? button("Reveal destination", "reveal", "button-warm", icons.reveal)
              : ""
          }
          ${!showCompass ? button("Start following", "follow", "button-primary", icons.arrow) : ""}
          <div class="action-row ${state.phase === "arrived" ? "action-row-two" : ""}">
            ${state.phase === "arrived" ? "" : button("Reveal", "reveal", "button-quiet", icons.reveal)}
            ${button("Give Up", "give-up", "button-caution", icons.stop)}
            ${button("Reroll", "reroll", "button-quiet", icons.reroll)}
          </div>
        </div>
      </section>
    `;
  }

  function journeyHeading(phase) {
    if (phase === "reroll") return "New destination hidden.";
    if (phase === "near") return "You are getting closer.";
    if (phase === "arrived") return "Arrived.";
    if (phase === "following") return "Follow the direction.";
    return "Destination hidden.";
  }

  function renderRevealed(state) {
    const publicState = stateApi.toPublicJourney(state);
    return `
      <section class="screen" aria-labelledby="revealed-title">
        <div class="screen-copy">
          <p class="eyebrow">Revealed</p>
          <h1 class="screen-heading" id="revealed-title">You found it.</h1>
        </div>
        <div class="reveal-panel">
          <p class="category-line">${escapeHtml(publicState.category)}</p>
          <h2 class="destination-name">${escapeHtml(publicState.destinationName)}</h2>
          <p class="screen-text">${escapeHtml(publicState.description)}</p>
          <p class="support-text"><strong>Hidden hint:</strong> ${escapeHtml(publicState.hint)}</p>
        </div>
        <div class="actions">
          ${button("Start Again", "start", "button-primary", icons.arrow)}
          ${button("Reroll", "reroll", "button-quiet", icons.reroll)}
        </div>
      </section>
    `;
  }

  function renderGiveUp(state) {
    return `
      <section class="screen" aria-labelledby="give-up-title">
        <div class="screen-copy">
          <p class="eyebrow">Safe exit</p>
          <h1 class="screen-heading" id="give-up-title">You stepped out.</h1>
          <p class="screen-text">The destination can stay hidden, or you can reveal it now for closure.</p>
        </div>
        ${renderHiddenPanel(stateApi.toPublicJourney(state), statusText(state))}
        <div class="actions">
          ${button("Reveal anyway", "reveal", "button-primary", icons.reveal)}
          <div class="action-row">
            ${button("Start Again", "start", "button-quiet", icons.arrow)}
            ${button("Reroll", "reroll", "button-quiet", icons.reroll)}
          </div>
        </div>
      </section>
    `;
  }

  const api = { phaseLabel, statusText, renderApp };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.BlindCompassScreens = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

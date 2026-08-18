"use strict";

(function initScreens(globalScope) {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function action(label, name, attributes = "") {
    return `<button type="button" data-action="${escapeHtml(name)}"${attributes}>${escapeHtml(label)}</button>`;
  }

  function screenHeading(label) {
    return `<h1 class="screen-heading screen-heading-visually-hidden">${escapeHtml(label)}</h1>`;
  }

  function formatDistance(distanceM) {
    if (!Number.isFinite(distanceM)) return "Checking distance";
    if (distanceM < 1000) return `${Math.round(distanceM)} m`;
    return `${(distanceM / 1000).toFixed(1)} km`;
  }

  const MANEUVER_LABELS = Object.freeze({
    STRAIGHT: "Straight",
    TURN_LEFT: "Left",
    TURN_RIGHT: "Right",
    U_TURN: "U-turn",
    ARRIVE: "Arrive",
  });

  function formatGuidanceDistance(distanceM) {
    if (!Number.isFinite(distanceM)) return "Checking distance";
    if (distanceM < 1000) return `${Math.round(distanceM)}m`;
    return `${(distanceM / 1000).toFixed(1)}km`;
  }

  function maneuverLabel(maneuver) {
    return {
      ...MANEUVER_LABELS,
      TURN_LEFT: "Turn left",
      TURN_RIGHT: "Turn right",
    }[maneuver] || "Next step";
  }

  function renderCompassShell(view, options = {}) {
    const canPoint = view.needleMode === "pointing" && Number.isFinite(view.bearingDeg);
    const needleState = canPoint
      ? "is-pointing"
      : view.needleMode === "paused"
        ? "is-paused"
        : view.needleMode === "ready"
          ? "is-ready"
          : "is-searching";
    const needleStyle = canPoint ? ` style="--bearing:${view.bearingDeg}deg"` : "";
    const status = canPoint
      ? "Pointing"
      : view.needleMode === "paused"
        ? "Paused"
        : view.needleMode === "ready"
          ? "Ready to start"
          : "Searching";
    const compassContent = `<img class="compass-face" src="./assets/compass-body.png" alt="" aria-hidden="true">
      <span class="compass-needle ${needleState}"${needleStyle} aria-hidden="true"><img class="compass-needle-image" src="./assets/compass-needle.png" alt=""></span>`;
    if (options.action === "start") {
      return `<button type="button" class="compass-shell compass-action" data-action="start" aria-label="Start with these conditions">
        ${compassContent}
      </button>`;
    }
    return `<div class="compass-shell" role="img" aria-label="${escapeHtml(status)}">${compassContent}</div>`;
  }

  function navigationStatus(view) {
    if (view.routeStatus === "paused" || view.needleMode === "paused") return "Paused";
    if (view.routeStatus === "recovery" || ["route_recovery", "recomputing"].includes(view.phase)) {
      return "Recalculating route";
    }
    if (view.routeStatus !== "ready") return "Checking route";
    if (view.phase === "near") return "Near destination";
    return "Following";
  }

  function renderNavigationGuidance(view) {
    const status = navigationStatus(view);
    const ready = view.routeStatus === "ready" && view.nextStep && Number.isFinite(view.distanceToNextM);
    const remaining = Number.isFinite(view.remainingDistanceM) ? formatGuidanceDistance(view.remainingDistanceM) : "Checking distance";
    const nextStep = ready
      ? `<div class="next-action" data-maneuver="${escapeHtml(view.nextStep.maneuver)}">
          <div>
            <p class="next-action-label">Next action</p>
            <p class="next-action-title">${escapeHtml(formatGuidanceDistance(view.distanceToNextM))} ahead · ${escapeHtml(maneuverLabel(view.nextStep.maneuver))}</p>
          </div>
        </div>`
      : `<div class="next-action is-unavailable" aria-live="polite">
          <p class="next-action-label">Next action</p>
          <p class="next-action-title">${escapeHtml(status)}</p>
        </div>`;

    return `<section class="navigation-guidance${ready ? " is-ready" : " is-unavailable"}" aria-label="Walking guidance">
      ${nextStep}
      ${renderCompassShell(view)}
      <div class="guidance-summary">
        <div class="remaining-distance"><span>${view.routeStatus === "paused" ? "Last known distance" : "To destination"}</span><strong>${escapeHtml(remaining)}</strong></div>
      </div>
    </section>`;
  }

  function renderGuidanceRows(view) {
    return `<dl class="guidance-details">
      <div><dt>Signature dish</dt><dd>${escapeHtml(view.menu ?? "Not available")}</dd></div>
      <div><dt>Price range</dt><dd>${escapeHtml(view.priceBand ?? "Not available")}</dd></div>
    </dl>`;
  }

  function renderSplash() {
    return `<div class="splash-wordmark" aria-label="Roll the compass!">Roll the compass!</div>
      <div class="splash-loader" role="status" aria-label="Preparing the app"></div>`;
  }

  function renderOnboarding() {
    return `<h1>Roll the compass!</h1>
      ${action("Start", "continue-onboarding")}`;
  }

  function renderConstraintErrors(errors) {
    const messages = Object.values(errors || {});
    if (messages.length === 0) return "";
    return `<ul class="form-errors">${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`;
  }

  function renderAffectedConditions(conditions) {
    if (!Array.isArray(conditions) || conditions.length === 0) return "";
    const items = conditions
      .filter((condition) => condition && typeof condition.label === "string")
      .map((condition) => (
        `<li data-condition="${escapeHtml(condition.field)}">${escapeHtml(condition.label)}</li>`
      ))
      .join("");
    if (!items) return "";
    return `<section class="no-fit-review" aria-labelledby="no-fit-heading">
      <h2 id="no-fit-heading">Review these conditions</h2>
      <ul>${items}</ul>
    </section>`;
  }

  const RECOVERY_REVIEWS = Object.freeze({
    safety: {
      label: "Safety issue",
      prompt: "Check the safety conditions before moving on.",
      instruction: "Guidance will not resume automatically. Choose whether to get a new recommendation.",
    },
    route_sensor: {
      label: "Route or sensor issue",
      prompt: "Review recalibration, route recalculation, a saved route, or an external map before changing the destination.",
      instruction: "Reviewing options will not resume guidance or open an external map.",
    },
    condition_mismatch: {
      label: "Required condition mismatch",
      prompt: "Edit or review the required condition before continuing.",
      instruction: "Conditions will not be relaxed and a new recommendation will not start until you confirm.",
    },
    venue_problem: {
      label: "Venue issue",
      prompt: "Review the issue at the venue and the related condition before continuing.",
      instruction: "Conditions will not be relaxed and a new recommendation will not start until you confirm.",
    },
    change_of_mind: {
      label: "Changed your mind",
      prompt: "Review all conditions before starting again.",
      instruction: "You must press Start to get a new recommendation.",
    },
    schedule_change: {
      label: "Schedule change",
      prompt: "Review your current schedule and new starting conditions.",
      instruction: "Returning to this screen will not start a new recommendation automatically.",
    },
    skipped: {
      label: "Reason skipped",
      prompt: "The stop reason was skipped. Review all new starting conditions.",
      instruction: "You must press Start to get a new recommendation.",
    },
  });

  function renderGuardedRecovery(view) {
    if (!view.guardedRecovery) return "";
    const review = RECOVERY_REVIEWS[view.recoveryReason] ?? {
      label: "Stop reason not confirmed",
      prompt: "Review the previous stop reason and all conditions.",
      instruction: "You must press Start to get a new recommendation.",
    };
    return `<fieldset class="recovery-review">
      <legend>Recent stop reason</legend>
      <p class="recovery-reason">${escapeHtml(review.label)}</p>
      <p>${escapeHtml(review.prompt)}</p>
      <p>${escapeHtml(review.instruction)}</p>
      <label><input type="checkbox" name="recoveryReviewed" value="yes" required> I reviewed the stop reason and new starting conditions.</label>
    </fieldset>`;
  }

  function activeAdvancedConditions(constraints) {
    const active = [];
    if (Array.isArray(constraints.dietary) && constraints.dietary.length > 0) active.push("Dietary");
    if (Array.isArray(constraints.allergies) && constraints.allergies.length > 0) active.push("Allergies");
    if (constraints.disclosure === "private") active.push("Disclosure");
    return active;
  }

  function summarizeAdvancedConditions(constraints) {
    const active = activeAdvancedConditions(constraints || {});
    return active.length === 0
      ? "No additional conditions"
      : `${active.length} additional conditions · ${active.join(" · ")}`;
  }

  const DIETARY_OPTIONS = Object.freeze([
    ["vegan", "Vegan", "No animal products"],
    ["lacto", "Lacto", "Dairy allowed · no meat, fish, or eggs"],
    ["ovo", "Ovo", "Eggs allowed · no dairy, meat, or fish"],
    ["lacto_ovo", "Lacto-ovo", "Dairy and eggs allowed · no meat or fish"],
    ["pesco", "Pescatarian", "Fish and shellfish allowed · no meat or poultry"],
    ["pollo_pesco", "Pollo-pescatarian", "Fish, shellfish, and poultry allowed · no red meat"],
    ["flexitarian", "Flexitarian", "Meat allowed depending on context"],
    ["halal", "Halal", "Check certification and preparation"],
    ["kosher", "Kosher", "Check standards and preparation"],
    ["low_sodium", "Low sodium", "Prefers low-sodium dishes"],
  ]);
  const ALLERGY_OPTIONS = Object.freeze([
    ["egg", "Egg", "Poultry egg"], ["milk", "Milk", "Milk or dairy"], ["buckwheat", "Buckwheat", "Buckwheat ingredient"],
    ["peanut", "Peanut", "Peanut ingredient"], ["soy", "Soy", "Soy ingredient"], ["wheat", "Wheat", "Wheat or flour"],
    ["mackerel", "Mackerel", "Mackerel ingredient"], ["crab", "Crab", "Crab ingredient"], ["shrimp", "Shrimp", "Shrimp ingredient"],
    ["pork", "Pork", "Pork ingredient"], ["peach", "Peach", "Peach ingredient"], ["tomato", "Tomato", "Tomato ingredient"],
    ["sulfites", "Sulfites", "Sulfur dioxide ≥ 10 mg/kg in final product"], ["walnut", "Walnut", "Walnut ingredient"],
    ["chicken", "Chicken", "Chicken ingredient"], ["beef", "Beef", "Beef ingredient"], ["squid", "Squid", "Squid ingredient"],
    ["shellfish", "Shellfish (oyster, abalone, mussel)", "Shellfish ingredient"], ["pine_nut", "Pine nut", "Pine nut ingredient"],
  ]);
  const LEGACY_DIETARY_OPTIONS = Object.freeze([
    ["vegetarian", "Vegetarian (specific type not selected)", "Existing setting. Choose vegan, lacto, ovo, or another specific type."],
  ]);
  const LEGACY_ALLERGY_OPTIONS = Object.freeze([
    ["tree_nut", "Existing nut setting", "Check walnuts and pine nuts separately."],
  ]);
  const BUDGET_STOPS = Object.freeze([
    4_000, 6_000, 8_000, 10_000, 12_000, 14_000, 16_000, 18_000, 20_000,
    30_000, 40_000, 50_000, null,
  ]);

  function parseBudgetAmount(value) {
    const numeric = Number.isFinite(value)
      ? value
      : Number(String(value ?? "").replace(/[^0-9]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function budgetIndexForAmount(value) {
    const amount = parseBudgetAmount(value);
    if (amount == null) return BUDGET_STOPS.length - 1;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < BUDGET_STOPS.length - 1; index += 1) {
      const distance = Math.abs(BUDGET_STOPS[index] - amount);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }
    return nearestIndex;
  }

  function budgetAmountForIndex(value) {
    const index = Math.max(0, Math.min(BUDGET_STOPS.length - 1, Math.round(Number(value))));
    return BUDGET_STOPS[index] ?? null;
  }

  function budgetWheelAmount(value, direction) {
    const amount = parseBudgetAmount(value);
    if (amount == null) return direction < 0 ? BUDGET_STOPS[BUDGET_STOPS.length - 2] : null;
    if (direction > 0) {
      return BUDGET_STOPS.find((stop) => Number.isFinite(stop) && stop > amount) ?? null;
    }
    const lower = BUDGET_STOPS.filter((stop) => Number.isFinite(stop) && stop < amount);
    return lower.at(-1) ?? BUDGET_STOPS[0];
  }

  function renderProfile(view, setup = false) {
    const profile = view.profile || { dietary: [], allergies: [] };
    const selected = (name) => Array.isArray(profile[name]) ? profile[name] : [];
    const picker = (name, label, options) => `<fieldset class="profile-picker" data-profile-picker="${name}">
      <legend>${label}</legend>
      <label class="picker-search"><input type="search" data-picker-search="${name}" aria-label="${label} search" placeholder="${label} search"></label>
      <div class="picker-options picker-options-scroll" data-picker-options="${name}" data-visible-items="4" tabindex="0" aria-label="${label} options. Four items visible.">
        <label class="picker-option picker-option-none"><input class="profile-choice-input" type="checkbox" name="${name}" value="none" data-profile-none="${name}"${selected(name).length === 0 ? " checked" : ""}><span class="picker-option-text"><strong>None</strong><small>Do not apply this condition</small></span></label>
        ${options.map(([value, text, description]) => `<label class="picker-option"><input class="profile-choice-input" type="checkbox" name="${name}" value="${value}"${selected(name).includes(value) ? " checked" : ""}><span class="picker-option-text"><strong>${text}</strong>${description ? `<small>${description}</small>` : ""}</span></label>`).join("")}
      </div>
    </fieldset>`;
    const dietaryOptions = selected("dietary").includes("vegetarian")
      ? [...LEGACY_DIETARY_OPTIONS, ...DIETARY_OPTIONS]
      : DIETARY_OPTIONS;
    const allergyOptions = selected("allergies").includes("tree_nut")
      ? [...LEGACY_ALLERGY_OPTIONS, ...ALLERGY_OPTIONS]
      : ALLERGY_OPTIONS;
    return `${screenHeading(setup ? "Set your preferences" : "Profile")}
      <form data-form="profile">
        ${picker("dietary", "Dietary preferences", dietaryOptions)}
        ${picker("allergies", "Allergies", allergyOptions)}
        ${action("Save and continue", "save-profile")}
        ${setup ? "" : action("Cancel", "cancel-profile")}
      </form>`;
  }

  function partyLabel(partySize) {
    return partySize === 5 ? "5+ people" : `${partySize} people`;
  }

  function renderPartyPawn() {
    return `<svg class="party-pawn" data-party-pawn viewBox="0 0 32 40" aria-hidden="true" focusable="false">
      <circle cx="16" cy="9" r="6"></circle>
      <path d="M7 34c0-8 3-13 9-13s9 5 9 13H7Z"></path>
    </svg>`;
  }

  function renderSettingsButton() {
    return `<div class="settings-button-wrap">
      <button type="button" class="settings-button" data-action="open-profile-settings" aria-label="Settings">
        <svg class="settings-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.7 7.7 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.25-1.17.58-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65A.5.5 0 0 0 10 22h4a.5.5 0 0 0 .5-.42l.38-2.65a7.7 7.7 0 0 0 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"></path>
        </svg>
      </button>
    </div>`;
  }

  function renderPartySelector(constraints) {
    const rawPartySize = Number(constraints.partySize);
    const partySize = Number.isInteger(rawPartySize) && rawPartySize >= 1 && rawPartySize <= 5 ? rawPartySize : 2;
    const pawns = Array.from({ length: partySize }, () => renderPartyPawn()).join("");
    return `<section class="party-selector" aria-labelledby="party-size-label">
      <div class="party-selector-heading">
        <h2 id="party-size-label">Party size</h2>
        <output class="party-count" aria-live="polite">${escapeHtml(partyLabel(partySize))}</output>
      </div>
      <div class="party-selector-controls">
        ${action("‹", "party-decrement", ` aria-label="Decrease party size"${partySize === 1 ? " disabled" : ""}`)}
        <div class="party-pawns" aria-hidden="true">${pawns}</div>
        ${action("›", "party-increment", ` aria-label="Increase party size"${partySize === 5 ? " disabled" : ""}`)}
      </div>
      <input type="hidden" name="partySize" value="${escapeHtml(partySize)}">
    </section>`;
  }

  function renderConstraints(view) {
    const constraints = view.constraints || {};
    const minutes = Number.isFinite(constraints.maxWalkMinutes) ? constraints.maxWalkMinutes : 20;
    const parsedBudget = parseBudgetAmount(constraints.budget);
    const budgetStep = budgetIndexForAmount(parsedBudget);
    const budgetAmount = budgetAmountForIndex(budgetStep);
    const disclosure = constraints.disclosure === "private" ? "private" : "minimal";
    const advancedSummary = summarizeAdvancedConditions(constraints);
    return `<form data-form="constraints" class="constraints-home">
      <section class="constraints-launch" id="constraints-launch">
        <header class="launch-header">
          <h1>Roll the compass!</h1>
          ${renderSettingsButton()}
        </header>
        <div class="launch-action">
          ${renderCompassShell({ needleMode: "ready" }, { action: "start" })}
        </div>
        <a class="condition-scroll-cue" href="#condition-settings" data-action="scroll-to-conditions">Conditions</a>
      </section>
      <section class="condition-settings" id="condition-settings" aria-labelledby="condition-settings-title">
        <h2 id="condition-settings-title">Conditions</h2>
        ${renderConstraintErrors(view.errors)}
        ${renderAffectedConditions(view.affectedConditions)}
        <input type="hidden" name="category" value="restaurant">
        ${renderPartySelector(constraints)}
        <div class="slider-field"><label for="walk-time-slider">Walk time <output id="walk-time-value">${escapeHtml(minutes)} min</output></label><input id="walk-time-slider" name="maxWalkMinutes" type="range" min="5" max="60" step="5" value="${escapeHtml(minutes)}" data-slider="walk" aria-label="Maximum walk time"></div>
        <div class="slider-field"><label for="budget-slider">Budget <output id="budget-value"${budgetAmount == null ? " data-budget-unlimited" : ""}>${budgetAmount == null ? "Any budget" : `${escapeHtml(budgetAmount.toLocaleString("en-US"))} or less`}</output></label><input id="budget-slider" name="budget" type="range" min="0" max="12" step="1" value="${escapeHtml(budgetStep)}" data-slider="budget" data-budget-amount="${budgetAmount == null ? "" : escapeHtml(budgetAmount)}" aria-label="Budget per person"></div>
        <details data-advanced-conditions>
          <summary>${escapeHtml(advancedSummary)}</summary>
          <label>Destination disclosure <select name="disclosure">
            <option value="minimal"${disclosure === "minimal" ? " selected" : ""}>Minimal (walk time · budget · signature dish)</option>
            <option value="private"${disclosure === "private" ? " selected" : ""}>Private</option>
          </select></label>
        </details>
        ${renderGuardedRecovery(view)}
        ${action("Done", "scroll-to-launch", ' class="condition-complete-button" aria-label="Finish condition settings. Return to start."')}
      </section>
    </form>`;
  }

  function renderFinding() {
    return `${screenHeading("Choosing one place")}
      ${renderCompassShell({ needleMode: "searching" })}`;
  }

  function renderDisclosedIdentity(view) {
    if (!view.revealed || !view.destination) return "";
    return `<div class="disclosed-identity">
      <p class="disclosure-status">Destination revealed</p>
      <p class="destination-name">${detailOrUnknown(view.destination.name, "Place name unavailable")}</p>
    </div>`;
  }

  function renderCompass(view) {
    const heading = view.phase === "following_revealed"
      ? "Guiding to revealed destination"
      : view.phase === "near" ? "Almost there" : "Follow the direction";
    return `${screenHeading(heading)}
      ${renderDisclosedIdentity(view)}
      ${renderNavigationGuidance(view)}
      ${view.constraints?.disclosure === "private" ? "" : renderGuidanceRows(view)}
      ${action("Stop", "stop")}`;
  }

  function renderPaused(view) {
    return `${screenHeading("Guidance paused")}
      ${renderNavigationGuidance({ ...view, routeStatus: "paused", needleMode: "paused" })}
      ${action("Resume", "continue-guidance")}
      ${action("View destination", "open-destination-info")}
      ${action("End guidance", "request-end")}`;
  }

  function reasonButton(reason, label) {
    return action(label, "reveal-destination", ` data-reason="${escapeHtml(reason)}"`);
  }

  function renderRevealReason() {
    return `${screenHeading("Reveal destination?")}
      <div class="reason-actions">
        ${reasonButton("safety", "For safety")}
        ${reasonButton("route_difficulty", "The route is difficult")}
        ${reasonButton("sensor_problem", "Direction is unclear")}
        ${reasonButton("condition_check", "To check the conditions")}
        ${reasonButton("companion_check", "To check with my companion")}
        ${reasonButton("curiosity", "I'm curious")}
        ${reasonButton("skipped", "Skip and reveal")}
      </div>`;
  }

  function detailOrUnknown(value, unknown) {
    return escapeHtml(value == null || value === "" ? unknown : value);
  }

  function renderDestinationPhoto(destination) {
    const source = typeof destination.photoUrl === "string" && destination.photoUrl.trim() !== ""
      ? destination.photoUrl.trim()
      : null;
    if (!source) return `<p class="photo-unavailable">No photo available</p>`;
    const altName = detailOrUnknown(destination.name, "Destination") + " photo";
    return `<img class="destination-photo" src="${escapeHtml(source)}" alt="${altName}" loading="lazy">`;
  }

  function renderDestinationDetails(destination) {
    if (!destination) {
      return `<p class="destination-unavailable">Destination details unavailable.</p>`;
    }
    return `<div class="destination-details">
      <p class="destination-name">${detailOrUnknown(destination.name, "Place name unavailable")}</p>
      ${renderDestinationPhoto(destination)}
      <dl>
        <div><dt>Building</dt><dd>${detailOrUnknown(destination.building, "Building unavailable")}</dd></div>
        <div><dt>Floor</dt><dd>${detailOrUnknown(destination.floorUnit, "Floor unavailable")}</dd></div>
      </dl>
      <section class="destination-note recommendation-reason">
        <h2>Why it was recommended</h2>
        <p>${detailOrUnknown(destination.recommendationReason, "Recommendation unavailable")}</p>
      </section>
      <section class="destination-note review-summary">
        <h2>Review summary</h2>
        <p>${detailOrUnknown(destination.reviewSummary, "Review summary unavailable")}</p>
      </section>
    </div>`;
  }

  function renderDestination(view) {
    const heading = view.phase === "arrived" ? "Arrived" : "Destination revealed";
    const followUp = view.phase === "arrived"
      ? `${action("Finish", "finish-arrival")}${action("Open in external map", "request-external-map")}`
      : `${action("Resume", "continue-after-reveal")}${action("End guidance", "request-end")}${action("Open in external map", "request-external-map")}`;
    return `${screenHeading(heading)}${renderDestinationDetails(view.destination)}${followUp}`;
  }

  function renderStopConfirm() {
    return `${screenHeading("End guidance?")}
      ${action("Resume", "continue-guidance")}
      ${action("Confirm end", "confirm-end")}`;
  }

  function renderStopReason() {
    const reasons = [
      ["safety", "Safety issue"], ["route_sensor", "Route or sensor issue"],
      ["condition_mismatch", "Condition mismatch"], ["venue_problem", "Venue issue"],
      ["change_of_mind", "Changed my mind"], ["schedule_change", "Schedule changed"],
      ["skipped", "Skip"],
    ];
    return `${screenHeading("End guidance")}
      <div class="reason-actions">${reasons.map(([reason, label]) => action(label, "submit-stop-reason", ` data-reason="${reason}"`)).join("")}</div>`;
  }

  function renderStopped() {
    return `${screenHeading("Guidance ended")}
      ${action("Get a new recommendation", "new-recommendation")}`;
  }

  function renderRouteRecovery(view) {
    return `${screenHeading("Review guidance")}
      ${renderDisclosedIdentity(view)}
      ${renderNavigationGuidance({ ...view, routeStatus: "recovery", needleMode: "searching" })}
      ${action("Retry guidance", "retry-guidance")}
      ${action("Use saved route", "use-cached-route")}
      ${action("Stop", "stop")}
      ${action("Open in external map", "request-external-map")}`;
  }

  function renderRecomputing(view) {
    return `${screenHeading("Recalculating route")}
      ${renderDisclosedIdentity(view)}
      ${renderNavigationGuidance({ ...view, routeStatus: "recovery", needleMode: "searching" })}`;
  }

  function renderExternalMapWarning() {
    return `${screenHeading("Open external map?")}
      <p>The destination may be revealed in an external map.</p>
      ${action("Back", "cancel-external-map")}
      ${action("Reveal and open", "confirm-external-map")}`;
  }

  function renderExternalMapHandoff() {
    return `${screenHeading("Sent to external map")}`;
  }

  function renderFeedbackPending() {
    return `${screenHeading("Waiting for your visit")}
      ${action("Check in", "check-feedback")}`;
  }

  function renderPlaceReaction() {
    return `${screenHeading("How was this place?")}
      <div class="reaction-actions">
        ${action("Not for me", "react", " data-reaction=\"dislike\"")}
        ${action("Good", "react", " data-reaction=\"like\"")}
        ${action("Loved it", "react", " data-reaction=\"love\"")}
        ${action("Could not visit", "react", " data-reaction=\"did_not_visit\"")}
      </div>`;
  }

  function renderComplete() {
    return `${screenHeading("Thank you")}`;
  }

  function renderInvalidState() {
    return `${screenHeading("Unable to load screen")}<p>Reset from the prototype controls.</p>`;
  }

  function renderProductScreen(view) {
    const renderers = {
      splash: renderSplash,
      onboarding: renderOnboarding,
      profile_setup: (value) => renderProfile(value, true),
      profile: (value) => renderProfile(value, false),
      constraints: renderConstraints,
      finding: renderFinding,
      following: renderCompass,
      following_revealed: renderCompass,
      near: renderCompass,
      paused: renderPaused,
      reveal_reason: renderRevealReason,
      revealed: renderDestination,
      stop_confirm: renderStopConfirm,
      stop_reason: renderStopReason,
      stopped: renderStopped,
      route_recovery: renderRouteRecovery,
      recomputing: renderRecomputing,
      external_map_warning: renderExternalMapWarning,
      external_map_handoff: renderExternalMapHandoff,
      arrived: renderDestination,
      feedback_pending: renderFeedbackPending,
      place_reaction: renderPlaceReaction,
      complete: renderComplete,
    };
    const safeView = view && typeof view === "object" ? view : {};
    const renderer = renderers[safeView.phase] || renderInvalidState;
    const body = renderer(safeView).replace(
      "<h1",
      '<h1 data-screen-heading tabindex="-1"',
    );
    const screenClass = safeView.phase === "splash" ? " product-screen splash-screen" : " product-screen";
    return `<section class="${screenClass.trim()}" data-phase="${escapeHtml(safeView.phase)}" data-visual-style="a">${body}</section>`;
  }

  function renderPrototypeControls() {
    const simulations = [
      ["walk", "140m 이동"], ["near", "더 가까이 이동"], ["arrive", "도착"],
      ["no-fit", "조건 불일치"], ["low-confidence", "방향 신뢰도 낮음"],
      ["restore-confidence", "안내 복원"], ["permission-denied", "위치 권한 거부"],
      ["missing-arrival-field", "층 정보 없이 도착"], ["feedback-ready", "후기 확인 가능"],
      ["reset", "초기화"],
    ];
    return `<aside class="prototype-controls" aria-label="프로토타입 컨트롤">
      <h2>프로토타입 컨트롤 — 앱 UI에 포함되지 않음</h2>
      <div>${simulations.map(([name, label]) => `<button type="button" data-simulate="${name}">${label}</button>`).join("")}</div>
    </aside>`;
  }

  const COMPASS_TRANSITION_DURATION = 680;
  const COMPASS_TRANSITION_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

  function reducedMotionPreferred() {
    return Boolean(globalScope.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  function renderWithCompassFallback(root, updateRoot) {
    const previousCompass = root.querySelector?.(".compass-shell");
    const previousRect = previousCompass?.getBoundingClientRect?.();
    updateRoot();

    const document = globalScope.document;
    const body = document?.body;
    const nextCompass = root.querySelector?.(".compass-shell");
    const nextRect = nextCompass?.getBoundingClientRect?.();
    if (
      !previousCompass || !previousRect || typeof previousCompass.cloneNode !== "function"
      || !body || typeof body.appendChild !== "function" || !nextCompass || !nextRect
    ) return;

    const proxy = previousCompass.cloneNode(true);
    if (!proxy?.style) return;
    const reducedMotion = reducedMotionPreferred();
    const duration = reducedMotion ? 1 : COMPASS_TRANSITION_DURATION;
    const scaleX = previousRect.width ? nextRect.width / previousRect.width : 1;
    const scaleY = previousRect.height ? nextRect.height / previousRect.height : 1;
    const deltaX = nextRect.left - previousRect.left;
    const deltaY = nextRect.top - previousRect.top;
    const previousVisibility = nextCompass.style.visibility;
    let cleaned = false;
    let timeoutId = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timeoutId != null) globalScope.clearTimeout?.(timeoutId);
      nextCompass.style.visibility = previousVisibility;
      body.removeChild?.(proxy);
    };

    proxy.setAttribute?.("aria-hidden", "true");
    proxy.tabIndex = -1;
    Object.assign(proxy.style, {
      position: "fixed",
      left: `${previousRect.left}px`,
      top: `${previousRect.top}px`,
      width: `${previousRect.width}px`,
      height: `${previousRect.height}px`,
      margin: "0",
      zIndex: "9999",
      pointerEvents: "none",
      transformOrigin: "top left",
      transform: "translate3d(0px, 0px, 0) scale(1, 1)",
      transition: `transform ${duration}ms ${COMPASS_TRANSITION_EASING}`,
    });
    body.appendChild(proxy);
    nextCompass.style.visibility = "hidden";
    proxy.addEventListener?.("transitionend", cleanup, { once: true });
    timeoutId = globalScope.setTimeout?.(cleanup, duration + 100) ?? null;
    const requestFrame = globalScope.requestAnimationFrame
      || ((callback) => globalScope.setTimeout(callback, 0));
    requestFrame(() => {
      proxy.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
    });
  }

  function renderApp(root, controlsRoot, view) {
    if (root) {
      const previousPhase = root.querySelector?.(".product-screen")?.dataset?.phase;
      const phaseChanged = previousPhase !== view?.phase;
      const updateRoot = () => {
        root.innerHTML = renderProductScreen(view);
        if (phaseChanged) root.scrollIntoView?.({ block: "start" });
        root.querySelector?.("[data-screen-heading]")?.focus?.({ preventScroll: true });
      };
      const startViewTransition = globalScope.document?.startViewTransition;
      if (phaseChanged && typeof startViewTransition === "function") {
        try {
          const transition = startViewTransition.call(globalScope.document, updateRoot);
          transition?.finished?.catch?.(() => {});
        } catch {
          updateRoot();
        }
      } else if (phaseChanged && globalScope.document?.body) {
        renderWithCompassFallback(root, updateRoot);
      } else {
        updateRoot();
      }
    }
    if (controlsRoot) {
      controlsRoot.innerHTML = view?.phase === "splash" ? "" : renderPrototypeControls(view);
    }
  }

  const api = {
    BUDGET_STOPS, budgetIndexForAmount, budgetAmountForIndex, budgetWheelAmount,
    escapeHtml, summarizeAdvancedConditions, renderProductScreen,
    renderPrototypeControls, renderApp,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.RollTheCompassVNextScreens = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

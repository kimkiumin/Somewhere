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

  function formatDistance(distanceM) {
    if (!Number.isFinite(distanceM)) return "거리 확인 중";
    if (distanceM < 1000) return `${Math.round(distanceM)} m`;
    return `${(distanceM / 1000).toFixed(1)} km`;
  }

  function renderCompassShell(view) {
    const canPoint = view.needleMode === "pointing" && Number.isFinite(view.bearingDeg);
    const needleClass = canPoint
      ? "compass-needle is-pointing"
      : view.needleMode === "paused"
        ? "compass-needle is-paused"
        : "compass-needle is-searching";
    const needleStyle = canPoint ? ` style="--bearing:${view.bearingDeg}deg"` : "";
    const status = canPoint
      ? `경로 방향 ${Math.round(view.bearingDeg)}도 안내 중이에요`
      : view.needleMode === "paused"
        ? "안내 일시정지"
        : ["route_recovery", "recomputing"].includes(view.phase)
          ? "정확한 방향을 확인하고 있어요"
        : "방향을 확인하고 있어요";

    return `<p class="guidance-status">${escapeHtml(status)}</p>
      <div class="compass-shell" role="img" aria-label="${escapeHtml(status)}">
        <div class="${needleClass}"${needleStyle} aria-hidden="true"></div>
      </div>`;
  }

  function renderGuidanceRows(view) {
    return `<dl class="guidance-details">
      <div><dt>남은 거리</dt><dd>${escapeHtml(formatDistance(view.distanceM))}</dd></div>
      <div><dt>대표 메뉴</dt><dd>${escapeHtml(view.menu ?? "정보 없음")}</dd></div>
      <div><dt>가격대</dt><dd>${escapeHtml(view.priceBand ?? "정보 없음")}</dd></div>
    </dl>`;
  }

  function renderOnboarding() {
    return `<h1>Somewhere</h1>
      <p>한 곳을 정하고, 비교 없이 출발해요.</p>
      ${action("시작하기", "continue-onboarding")}`;
  }

  function renderConstraintErrors(errors) {
    const messages = Object.values(errors || {});
    if (messages.length === 0) return "";
    return `<ul class="form-errors">${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`;
  }

  function renderGuardedRecovery(view) {
    if (!view.guardedRecovery) return "";
    const reasonLabels = {
      safety: "안전 문제",
      route_sensor: "길 또는 센서 문제",
      condition_mismatch: "조건이 맞지 않음",
      venue_problem: "장소 문제",
      change_of_mind: "마음이 바뀜",
      schedule_change: "일정 변경",
      skipped: "건너뜀",
    };
    const reason = reasonLabels[view.recoveryReason] ?? "종료 이유 미확인";
    return `<fieldset class="recovery-review">
      <legend>최근 안내 종료 이유</legend>
      <p>${escapeHtml(reason)}</p>
      <label><input type="checkbox" name="recoveryReviewed" value="yes" required> 종료 이유와 조건을 다시 확인했어요.</label>
    </fieldset>`;
  }

  function renderConstraints(view) {
    const constraints = view.constraints || {};
    const category = constraints.category === "cafe" ? "cafe" : "restaurant";
    const minutes = Number.isFinite(constraints.maxWalkMinutes) ? constraints.maxWalkMinutes : 20;
    return `<h1>지금 필요한 조건</h1>
      <p>최소 조건만 정하면 한 곳으로 바로 출발해요.</p>
      ${renderConstraintErrors(view.errors)}
      <form data-form="constraints">
        <fieldset><legend>어디로 갈까요?</legend>
          <label><input type="radio" name="category" value="restaurant"${category === "restaurant" ? " checked" : ""}> 식당</label>
          <label><input type="radio" name="category" value="cafe"${category === "cafe" ? " checked" : ""}> 카페</label>
        </fieldset>
        <label>도보 시간 <input name="maxWalkMinutes" type="number" min="1" value="${escapeHtml(minutes)}"></label>
        <details data-advanced-conditions>
          <summary>추가 조건</summary>
          <label>예산 <input name="budget" value="${escapeHtml(constraints.budget ?? "")}"></label>
          <label>식이 조건 <input name="dietary" value="${escapeHtml((constraints.dietary || []).join(", "))}"></label>
          <label>접근성 조건 <input name="accessibility" value="${escapeHtml((constraints.accessibility || []).join(", "))}"></label>
        </details>
        ${renderGuardedRecovery(view)}
        ${action("조건으로 바로 출발", "start")}
      </form>`;
  }

  function renderFinding() {
    return `<h1>한 곳을 고르고 있어요</h1>
      <p>조건에 맞는 목적지와 걸을 길을 확인 중이에요.</p>`;
  }

  function renderCompass(view) {
    const disclosure = view.phase === "following_revealed" && view.destination
      ? `<p class="disclosure-status">목적지 공개됨</p><h1 class="destination-name">${escapeHtml(view.destination.name ?? "목적지")}</h1>`
      : `<h1>${view.phase === "near" ? "거의 다 왔어요" : "방향을 따라가요"}</h1>`;
    return `${disclosure}
      ${renderCompassShell(view)}
      ${renderGuidanceRows(view)}
      ${action("안내 멈추기", "stop")}`;
  }

  function renderPaused(view) {
    return `<h1>안내 일시정지</h1>
      <p>언제든 다시 이어갈 수 있어요.</p>
      ${renderCompassShell({ ...view, needleMode: "paused" })}
      ${action("안내 계속", "continue-guidance")}
      ${action("목적지 정보 확인", "open-destination-info")}
      ${action("안내 종료", "request-end")}`;
  }

  function reasonButton(reason, label) {
    return action(label, "reveal-destination", ` data-reason="${escapeHtml(reason)}"`);
  }

  function renderRevealReason() {
    return `<h1>목적지 정보를 확인할까요?</h1>
      <p>정확한 위치가 공개됩니다. 이유를 남기면 다음 경험을 개선하는 데 도움이 돼요.</p>
      <div class="reason-actions">
        ${reasonButton("safety", "안전을 위해")}
        ${reasonButton("route_difficulty", "길이 어려워서")}
        ${reasonButton("sensor_problem", "방향 확인이 어려워서")}
        ${reasonButton("condition_check", "조건을 확인하려고")}
        ${reasonButton("companion_check", "동행과 확인하려고")}
        ${reasonButton("curiosity", "궁금해서")}
        ${reasonButton("skipped", "건너뛰고 확인")}
      </div>`;
  }

  function detailOrUnknown(value, unknown) {
    return escapeHtml(value == null || value === "" ? unknown : value);
  }

  function renderDestinationDetails(destination) {
    if (!destination) {
      return `<p class="destination-unavailable">목적지 정보를 불러올 수 없어요.</p>`;
    }
    return `<div class="destination-details">
      <h1 class="destination-name">${escapeHtml(destination.name ?? "목적지")}</h1>
      <dl>
        <div><dt>주소</dt><dd>${detailOrUnknown(destination.address, "주소 정보 없음")}</dd></div>
        <div><dt>건물</dt><dd>${detailOrUnknown(destination.building, "건물 정보 없음")}</dd></div>
        <div><dt>층</dt><dd>${detailOrUnknown(destination.floorUnit, "층 정보 없음")}</dd></div>
        <div><dt>입구</dt><dd>${detailOrUnknown(destination.entrance, "입구 정보 없음")}</dd></div>
      </dl>
    </div>`;
  }

  function renderDestination(view) {
    const heading = view.phase === "arrived" ? "도착했어요" : "목적지 공개됨";
    const followUp = view.phase === "arrived"
      ? `${action("도착 완료", "finish-arrival")}${action("외부 지도에서 보기", "request-external-map")}`
      : `${action("안내 계속", "continue-after-reveal")}${action("안내 종료", "request-end")}${action("외부 지도에서 보기", "request-external-map")}`;
    return `<p class="disclosure-status">${heading}</p>${renderDestinationDetails(view.destination)}${followUp}`;
  }

  function renderStopConfirm() {
    return `<h1>안내를 종료할까요?</h1>
      <p>종료한 뒤에 이유를 건너뛸 수 있어요.</p>
      ${action("안내 계속", "continue-guidance")}
      ${action("안내 종료 확인", "confirm-end")}`;
  }

  function renderStopReason() {
    const reasons = [
      ["safety", "안전 문제"], ["route_sensor", "길 또는 센서 문제"],
      ["condition_mismatch", "조건이 맞지 않음"], ["venue_problem", "장소 문제"],
      ["change_of_mind", "마음이 바뀜"], ["schedule_change", "일정 변경"],
      ["skipped", "건너뛰기"],
    ];
    return `<h1>안내를 종료했어요</h1>
      <p>이유를 남기면 다음 추천을 더 안전하게 만들 수 있어요.</p>
      <div class="reason-actions">${reasons.map(([reason, label]) => action(label, "submit-stop-reason", ` data-reason="${reason}"`)).join("")}</div>`;
  }

  function renderStopped() {
    return `<h1>안내가 종료되었어요</h1>
      <p>필요하면 다시 조건을 확인해 새 추천을 받을 수 있어요.</p>
      ${action("새 추천 받기", "new-recommendation")}`;
  }

  function renderRouteRecovery(view) {
    return `<h1>안내를 다시 확인해야 해요</h1>
      <p>현재 방향을 신뢰하기 어려워서 정확한 방향을 확인하고 있어요.</p>
      ${renderCompassShell({ ...view, needleMode: "searching" })}
      ${action("안내 다시 시도", "retry-guidance")}
      ${action("저장된 경로 사용", "use-cached-route")}
      ${action("안내 멈추기", "stop")}
      ${action("외부 지도에서 보기", "request-external-map")}`;
  }

  function renderRecomputing(view) {
    return `<h1>경로를 다시 계산하고 있어요</h1>
      ${renderCompassShell({ ...view, needleMode: "searching" })}`;
  }

  function renderExternalMapWarning() {
    return `<h1>외부 지도로 이동할까요?</h1>
      <p>외부 지도에서는 목적지가 공개될 수 있습니다.</p>
      ${action("돌아가기", "cancel-external-map")}
      ${action("공개하고 이동", "confirm-external-map")}`;
  }

  function renderExternalMapHandoff() {
    return `<h1>외부 지도에 전달했어요</h1>
      <p>이 프로토타입은 실제 지도나 경로를 열지 않아요.</p>`;
  }

  function renderFeedbackPending() {
    return `<h1>방문 경험을 기다리고 있어요</h1>
      <p>한 시간 뒤에 장소에 대한 짧은 반응을 남길 수 있어요.</p>
      ${action("반응 확인", "check-feedback")}`;
  }

  function renderPlaceReaction() {
    return `<h1>이 장소는 어땠나요?</h1>
      <div class="reaction-actions">
        ${action("별로예요", "react", " data-reaction=\"dislike\"")}
        ${action("좋아요", "react", " data-reaction=\"like\"")}
        ${action("아주 좋아요", "react", " data-reaction=\"love\"")}
        ${action("방문하지 못했어요", "react", " data-reaction=\"did_not_visit\"")}
      </div>`;
  }

  function renderComplete() {
    return `<h1>고마워요</h1><p>다음 출발을 위한 반응이 기록되었어요.</p>`;
  }

  function renderInvalidState() {
    return `<h1>화면을 불러올 수 없어요</h1><p>프로토타입 제어에서 처음부터 다시 시작할 수 있어요.</p>`;
  }

  function renderProductScreen(view) {
    const renderers = {
      onboarding: renderOnboarding,
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
    return `<section class="product-screen" data-phase="${escapeHtml(safeView.phase)}">${renderer(safeView)}</section>`;
  }

  function renderPrototypeControls() {
    const simulations = [
      ["walk", "140 m 걷기"], ["near", "가까이 이동"], ["arrive", "도착"],
      ["no-fit", "조건 불일치"], ["low-confidence", "방향 신뢰도 낮음"],
      ["restore-confidence", "안내 복구"], ["permission-denied", "위치 권한 거부"],
      ["missing-arrival-field", "층 정보 누락 도착"], ["feedback-ready", "반응 가능 시간"],
      ["reset", "처음부터"],
    ];
    return `<aside class="prototype-controls" aria-label="프로토타입 제어">
      <h2>프로토타입 제어 — 실제 앱 UI 아님</h2>
      <div>${simulations.map(([name, label]) => `<button type="button" data-simulate="${name}">${label}</button>`).join("")}</div>
    </aside>`;
  }

  function renderApp(root, controlsRoot, view) {
    if (root) root.innerHTML = renderProductScreen(view);
    if (controlsRoot) controlsRoot.innerHTML = renderPrototypeControls(view);
  }

  const api = { escapeHtml, renderProductScreen, renderPrototypeControls, renderApp };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.SomewhereVNextScreens = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

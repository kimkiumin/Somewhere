"use strict";

(function initController(globalScope) {
  const MOCK_DESTINATION = Object.freeze({
    id: "pilot-restaurant-01",
    name: "온담식당",
    address: "서울시 성동구 테스트로 12",
    building: "해빛가 빌딩",
    floorUnit: "2층 201호",
    entrance: "건물 오른쪽 유리문으로 들어가 계단을 이용하세요.",
    menu: "국수",
    priceBand: "₩₩",
  });
  const MOCK_ROUTE = Object.freeze({
    id: "mock-route-01",
    distanceM: 850,
    bearingDeg: 40,
  });

  const TIMED_ACTIONS = new Set([
    "WALK",
    "ARRIVE",
    "ARRIVE_WITH_MISSING_FIELD",
    "CONFIRM_END",
    "NEW_RECOMMENDATION",
    "CHECK_FEEDBACK",
  ]);

  function loadApi(browserApi, modulePath) {
    if (browserApi) return browserApi;
    if (typeof require === "function") return require(modulePath);
    return null;
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function affectedConditionsForNoFit(constraints) {
    const affected = [];
    const budget = Number.isFinite(constraints?.budget)
      ? constraints.budget
      : Number(String(constraints?.budget ?? "").replace(/[^0-9]/g, ""));
    if (Number.isFinite(budget) && budget > 0) {
      affected.push({ field: "budget", label: "예산" });
    }
    if (Array.isArray(constraints?.dietary) && constraints.dietary.length > 0) {
      affected.push({ field: "dietary", label: "식이 조건" });
    }
    if (Array.isArray(constraints?.allergies) && constraints.allergies.length > 0) {
      affected.push({ field: "allergies", label: "알레르기" });
    }
    if (constraints?.disclosure === "private") {
      affected.push({ field: "disclosure", label: "목적지 공개 수준" });
    }
    return affected.length > 0
      ? affected
      : [{ field: "maxWalkMinutes", label: "최대 도보 시간" }];
  }

  function createControllerCore(options = {}, inspectable = false) {
    const stateApi = options.stateApi || loadApi(globalScope.SomewhereVNextState, "./state.js");
    if (!stateApi) throw new Error("Somewhere vNext state API is required.");

    const render = typeof options.render === "function" ? options.render : () => {};
    const schedule = typeof options.schedule === "function" ? options.schedule : globalScope.setTimeout.bind(globalScope);
    const cancel = typeof options.cancel === "function" ? options.cancel : globalScope.clearTimeout.bind(globalScope);
    const now = typeof options.now === "function" ? options.now : Date.now;
    let state = clone(options.initialState ?? stateApi.createInitialState());
    let pendingEffect = null;
    let destroyed = false;

    function renderCurrent() {
      render(stateApi.toPublicView(state));
    }

    function cancelPendingEffect() {
      if (!pendingEffect) return;
      const effect = pendingEffect;
      pendingEffect = null;
      effect.active = false;
      if (effect.id != null) cancel(effect.id);
    }

    function dispatch(action) {
      if (destroyed || !action || typeof action.type !== "string") return false;
      const previous = state;
      const timedAction = TIMED_ACTIONS.has(action.type) && !Number.isFinite(action.nowMs)
        ? { ...action, nowMs: now() }
        : action;
      const next = stateApi.reduce(previous, timedAction);
      if (next === previous) return false;

      state = next;
      if (previous.phase === "finding" && next.phase !== "finding") {
        cancelPendingEffect();
      }
      renderCurrent();
      return true;
    }

    function scheduleFindingCompletion() {
      if (pendingEffect || destroyed) return;
      const effect = { active: true, id: null };
      pendingEffect = effect;
      effect.id = schedule(() => {
        if (!effect.active || destroyed || pendingEffect !== effect) return;
        effect.active = false;
        pendingEffect = null;
        dispatch({
          type: "FIND_SUCCESS",
          destination: MOCK_DESTINATION,
          route: MOCK_ROUTE,
        });
      }, 700);
    }

    function start(constraints, { recoveryReviewed = false } = {}) {
      if (destroyed) return false;
      const previousPhase = state.phase;
      const accepted = dispatch({ type: "START", constraints, recoveryReviewed });
      if (accepted && previousPhase !== "finding" && state.phase === "finding") {
        scheduleFindingCompletion();
      }
      return accepted;
    }

    function simulate(name) {
      if (destroyed) return false;
      if (name === "walk") {
        const distanceM = Number.isFinite(state.distanceM) ? Math.max(0, state.distanceM - 140) : state.distanceM;
        return dispatch({ type: "WALK", distanceM });
      }
      if (name === "near") return dispatch({ type: "WALK", distanceM: 70 });
      if (name === "arrive") return dispatch({ type: "ARRIVE" });
      if (name === "no-fit") {
        return dispatch({
          type: "FIND_NO_FIT",
          affectedConditions: affectedConditionsForNoFit(state.constraints),
        });
      }
      if (name === "low-confidence") return dispatch({ type: "LOW_CONFIDENCE", reason: "heading" });
      if (name === "restore-confidence") {
        const retried = dispatch({ type: "RETRY_GUIDANCE" });
        const restored = dispatch({ type: "RECOVERY_READY" });
        return retried || restored;
      }
      if (name === "permission-denied") {
        return dispatch({ type: "PERMISSION_DENIED", context: "finding" });
      }
      if (name === "missing-arrival-field") {
        return dispatch({ type: "ARRIVE_WITH_MISSING_FIELD", field: "floorUnit" });
      }
      if (name === "feedback-ready") {
        if (state.phase === "arrived") dispatch({ type: "FINISH_ARRIVAL" });
        if (state.phase !== "feedback_pending") return false;
        return dispatch({ type: "CHECK_FEEDBACK", nowMs: state.feedbackEligibleAtMs });
      }
      if (name === "reset") return dispatch({ type: "RESET" });
      return false;
    }

    function getState() {
      return clone(state);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelPendingEffect();
    }

    renderCurrent();
    const controller = { dispatch, start, simulate, destroy };
    if (inspectable) controller.getState = getState;
    return controller;
  }

  function createController(options = {}) {
    return createControllerCore({
      ...options,
      stateApi: loadApi(globalScope.SomewhereVNextState, "./state.js"),
    });
  }

  function createTestController(options = {}) {
    return createControllerCore(options, true);
  }

  function mountController(root, controlsRoot, options = {}, inspectable = false) {
    if (!root || !controlsRoot) throw new Error("Product and prototype-control roots are required.");
    const screens = options.screens || loadApi(globalScope.SomewhereVNextScreens, "./screens.js");
    if (!screens) throw new Error("Somewhere vNext screen API is required.");

    const FormDataType = options.FormData || globalScope.FormData;
    const controllerFactory = inspectable ? createTestController : createController;
    let currentView = null;
    const controller = controllerFactory({
      ...options,
      render: (view) => {
        currentView = view;
        screens.renderApp(root, controlsRoot, view);
      },
    });

    function inside(container, element) {
      return typeof container.contains !== "function" || container.contains(element);
    }

    function readStartForm(button) {
      const form = button.closest?.('[data-form="constraints"]');
      if (!form || typeof FormDataType !== "function") return null;
      const recoveryReview = form.querySelector?.('[name="recoveryReviewed"]');
      if (recoveryReview && !recoveryReview.checked) {
        recoveryReview.reportValidity?.();
        recoveryReview.focus?.();
        return null;
      }
      return {
        constraints: readConstraints(form),
        recoveryReviewed: new FormDataType(form).get("recoveryReviewed") === "yes",
      };
    }

    function readProfileForm(button) {
      const form = button.closest?.('[data-form="profile"]');
      if (!form || typeof FormDataType !== "function") return null;
      const data = new FormDataType(form);
      const getAll = typeof data.getAll === "function" ? (name) => data.getAll(name) : (name) => {
        const value = data.get(name);
        return value == null ? [] : [value];
      };
      const readValues = (name) => getAll(name).map(String).filter((value) => value !== "none");
      return {
        dietary: readValues("dietary"),
        allergies: readValues("allergies"),
      };
    }

    function readConstraints(form) {
      const data = new FormDataType(form);
      const rawBudget = data.get("budget");
      const budgetStep = rawBudget == null || String(rawBudget).trim() === "" ? null : Number(rawBudget);
      const disclosure = data.get("disclosure") === "private" ? "private" : "minimal";
      return {
        category: "restaurant",
        partySize: Number(data.get("partySize")),
        maxWalkMinutes: Number(data.get("maxWalkMinutes")),
        budget: budgetStep == null || typeof screens.budgetAmountForIndex !== "function"
          ? null
          : screens.budgetAmountForIndex(budgetStep),
        dietary: clone(currentView?.profile?.dietary || []),
        allergies: clone(currentView?.profile?.allergies || []),
        disclosure,
      };
    }

    const productActions = {
      "continue-onboarding": () => controller.dispatch({ type: "CONTINUE_ONBOARDING" }),
      "open-profile-menu": () => controller.dispatch({ type: "OPEN_PROFILE_MENU" }),
      "close-profile-menu": () => controller.dispatch({ type: "CLOSE_PROFILE_MENU" }),
      "open-profile-settings": () => controller.dispatch({ type: "OPEN_PROFILE" }),
      "party-decrement": () => {
        const current = Number(currentView?.constraints?.partySize);
        return controller.dispatch({ type: "SET_PARTY_SIZE", partySize: Math.max(1, current - 1) });
      },
      "party-increment": () => {
        const current = Number(currentView?.constraints?.partySize);
        return controller.dispatch({ type: "SET_PARTY_SIZE", partySize: Math.min(5, current + 1) });
      },
      "open-profile": () => controller.dispatch({ type: "OPEN_PROFILE" }),
      "cancel-profile": () => controller.dispatch({ type: "CANCEL_PROFILE" }),
      stop: () => controller.dispatch({ type: "STOP" }),
      "continue-guidance": () => controller.dispatch({ type: "CONTINUE_GUIDANCE" }),
      "open-destination-info": () => controller.dispatch({ type: "OPEN_DESTINATION_INFO" }),
      "continue-after-reveal": () => controller.dispatch({ type: "CONTINUE_AFTER_REVEAL" }),
      "request-end": () => controller.dispatch({ type: "REQUEST_END" }),
      "confirm-end": () => controller.dispatch({ type: "CONFIRM_END" }),
      "new-recommendation": () => controller.dispatch({ type: "NEW_RECOMMENDATION" }),
      "retry-guidance": () => controller.dispatch({ type: "RETRY_GUIDANCE" }),
      "use-cached-route": () => controller.dispatch({ type: "USE_CACHED_ROUTE" }),
      "request-external-map": () => controller.dispatch({ type: "REQUEST_EXTERNAL_MAP" }),
      "cancel-external-map": () => controller.dispatch({ type: "CANCEL_EXTERNAL_MAP" }),
      "confirm-external-map": () => controller.dispatch({ type: "CONFIRM_EXTERNAL_MAP" }),
      "finish-arrival": () => controller.dispatch({ type: "FINISH_ARRIVAL" }),
      "check-feedback": () => controller.dispatch({ type: "CHECK_FEEDBACK" }),
    };

    function onProductClick(event) {
      const button = event.target?.closest?.("[data-action]");
      if (!button) {
        if (currentView?.profileMenuOpen) controller.dispatch({ type: "CLOSE_PROFILE_MENU" });
        return;
      }
      if (!inside(root, button)) return;
      event.preventDefault?.();
      const actionName = button.dataset.action;
      if (actionName === "start") {
        const startForm = readStartForm(button);
        if (!startForm) return;
        controller.start(startForm.constraints, {
          recoveryReviewed: startForm.recoveryReviewed,
        });
        return;
      }
      if (actionName === "save-profile") {
        const profile = readProfileForm(button);
        if (profile) controller.dispatch({ type: "SAVE_PROFILE", profile });
        return;
      }
      if (actionName === "reveal-destination") {
        controller.dispatch({ type: "REVEAL_DESTINATION", reason: button.dataset.reason });
        return;
      }
      if (actionName === "submit-stop-reason") {
        controller.dispatch({ type: "SUBMIT_STOP_REASON", reason: button.dataset.reason });
        return;
      }
      if (actionName === "react") {
        controller.dispatch({ type: "REACT", reaction: button.dataset.reaction });
        return;
      }
      productActions[actionName]?.();
    }

    function onPrototypeClick(event) {
      const button = event.target?.closest?.("[data-simulate]");
      if (!button || !inside(controlsRoot, button)) return;
      event.preventDefault?.();
      controller.simulate(button.dataset.simulate);
    }

    function onConstraintsInput(event) {
      const form = event.target?.closest?.('[data-form="constraints"]');
      const details = event.target?.closest?.("[data-advanced-conditions]") || form?.querySelector?.("[data-advanced-conditions]");
      if (!form || typeof screens.summarizeAdvancedConditions !== "function") return;
      if (details) {
        const summary = details.querySelector?.("summary");
        if (summary) summary.textContent = screens.summarizeAdvancedConditions(readConstraints(form));
      }
      const time = form.querySelector?.('[name="maxWalkMinutes"]');
      const timeOutput = form.querySelector?.("#walk-time-value");
      if (time && timeOutput) timeOutput.textContent = `${time.value}분`;
      const budget = form.querySelector?.('[name="budget"]');
      const budgetOutput = form.querySelector?.("#budget-value");
      if (budget && budgetOutput) {
        const amount = typeof screens.budgetAmountForIndex === "function"
          ? screens.budgetAmountForIndex(budget.value)
          : null;
        const unlimited = amount == null;
        budget.dataset.budgetAmount = unlimited ? "" : String(amount);
        budgetOutput.textContent = unlimited ? "상관없음" : `${amount.toLocaleString("ko-KR")}원 이하`;
        if (unlimited) budgetOutput.setAttribute?.("data-budget-unlimited", "");
        else budgetOutput.removeAttribute?.("data-budget-unlimited");
      }
    }

    function onProfileInput(event) {
      const checkbox = event.target?.closest?.('input[type="checkbox"]');
      const pickerForCheckbox = checkbox?.closest?.("[data-profile-picker]");
      if (checkbox && pickerForCheckbox) {
        const checkboxes = pickerForCheckbox.querySelectorAll?.('input[type="checkbox"]') || [];
        if (checkbox.dataset?.profileNone && checkbox.checked) {
          for (const option of checkboxes) {
            if (option !== checkbox) option.checked = false;
          }
        } else if (checkbox.checked) {
          const none = pickerForCheckbox.querySelector?.(`[data-profile-none="${checkbox.name}"]`);
          if (none) none.checked = false;
        }
        return;
      }
      const search = event.target?.closest?.("[data-picker-search]");
      if (!search) return;
      const picker = search.closest?.("[data-profile-picker]");
      const query = String(search.value || "").trim().toLocaleLowerCase();
      const options = picker?.querySelectorAll?.(".picker-options label") || [];
      for (const option of options) {
        option.hidden = query !== "" && !String(option.textContent || "").toLocaleLowerCase().includes(query);
      }
    }

    function onSliderWheel(event) {
      const slider = event.target?.closest?.('input[type="range"][data-slider]');
      if (!slider || !inside(root, slider)) return;
      const direction = event.deltaY < 0 ? 1 : -1;
      if (slider.dataset?.slider === "budget" && typeof screens.budgetWheelAmount === "function") {
        const rawAmount = String(slider.dataset.budgetAmount ?? "");
        const currentAmount = rawAmount === "" ? null : Number(rawAmount);
        const nextAmount = screens.budgetWheelAmount(
          currentAmount == null || !Number.isFinite(currentAmount)
            ? screens.budgetAmountForIndex(slider.value)
            : currentAmount,
          direction,
        );
        if (nextAmount === null && currentAmount == null) return;
        const nextIndex = screens.budgetIndexForAmount(nextAmount);
        if (nextIndex === Number(slider.value) && String(nextAmount ?? "") === String(slider.dataset.budgetAmount ?? "")) return;
        event.preventDefault?.();
        slider.value = String(nextIndex);
        slider.dataset.budgetAmount = nextAmount == null ? "" : String(nextAmount);
        onConstraintsInput({ target: slider });
        return;
      }
      const step = Number(slider.step) || 1;
      const min = Number(slider.min);
      const max = Number(slider.max);
      const next = Math.min(max, Math.max(min, Number(slider.value) + direction * step));
      if (next === Number(slider.value)) return;
      event.preventDefault?.();
      slider.value = String(next);
      onConstraintsInput({ target: slider });
    }

    root.addEventListener("click", onProductClick);
    root.addEventListener("input", onConstraintsInput);
    root.addEventListener("change", onConstraintsInput);
    root.addEventListener("input", onProfileInput);
    root.addEventListener("change", onProfileInput);
    root.addEventListener("wheel", onSliderWheel, { passive: false });
    controlsRoot.addEventListener("click", onPrototypeClick);

    let mounted = true;
    function destroy() {
      if (!mounted) return;
      mounted = false;
      root.removeEventListener("click", onProductClick);
      root.removeEventListener("input", onConstraintsInput);
      root.removeEventListener("change", onConstraintsInput);
      root.removeEventListener("input", onProfileInput);
      root.removeEventListener("change", onProfileInput);
      root.removeEventListener("wheel", onSliderWheel);
      controlsRoot.removeEventListener("click", onPrototypeClick);
      controller.destroy();
    }

    return { controller, destroy };
  }

  function mount(root, controlsRoot, options = {}) {
    return mountController(root, controlsRoot, options);
  }

  function mountForTest(root, controlsRoot, options = {}) {
    return mountController(root, controlsRoot, options, true);
  }

  const browserApi = { createController, mount };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ...browserApi,
      createTestController,
      mountForTest,
      MOCK_DESTINATION,
      MOCK_ROUTE,
    };
  }
  globalScope.SomewhereVNextController = browserApi;
})(typeof globalThis !== "undefined" ? globalThis : window);

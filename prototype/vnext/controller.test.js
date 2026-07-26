"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const stateApi = require("./state.js");
const controllerModule = require("./controller.js");
const {
  createController,
  createTestController,
  mount,
  mountForTest,
  MOCK_DESTINATION,
  MOCK_ROUTE,
} = controllerModule;
const createInspectableController = createTestController ?? createController;
const mountInspectable = mountForTest ?? mount;

function validConstraints(overrides = {}) {
  return {
    category: "restaurant",
    maxWalkMinutes: 20,
    budget: null,
    dietary: [],
    allergies: [],
    accessibility: [],
    disclosure: "standard",
    ...overrides,
  };
}

function createScheduler() {
  const scheduled = [];
  const cancelled = [];
  return {
    scheduled,
    cancelled,
    schedule(callback) {
      const effect = { id: scheduled.length + 1, callback };
      scheduled.push(effect);
      return effect.id;
    },
    cancel(id) {
      cancelled.push(id);
    },
  };
}

test("start schedules one automatic finding completion and no second commit", () => {
  const timer = createScheduler();
  const controller = createInspectableController({
    initialState: stateApi.createInitialState({ firstUse: false }),
    render: () => {},
    schedule: timer.schedule,
    cancel: timer.cancel,
    now: () => 1000,
  });

  controller.start(validConstraints());
  controller.start(validConstraints());

  assert.equal(controller.getState().phase, "finding");
  assert.equal(timer.scheduled.length, 1);
  timer.scheduled[0].callback();
  assert.equal(controller.getState().phase, "following");
});

test("finding exits cancel the pending completion and stale callbacks stay inert", () => {
  const exits = [
    {
      action: {
        type: "FIND_NO_FIT",
        affectedConditions: [{ field: "maxWalkMinutes", label: "최대 도보 시간" }],
      },
      expectedError: "finding",
    },
    { action: { type: "PERMISSION_DENIED", context: "finding" }, expectedError: "locationPermission" },
    { action: { type: "RESET" }, expectedError: null },
  ];

  for (const { action, expectedError } of exits) {
    const timer = createScheduler();
    const controller = createInspectableController({
      initialState: stateApi.createInitialState({ firstUse: false }),
      render: () => {},
      schedule: timer.schedule,
      cancel: timer.cancel,
      now: () => 1000,
    });
    controller.start(validConstraints());
    controller.dispatch(action);

    assert.deepEqual(timer.cancelled, [1], action.type);
    assert.equal(controller.getState().phase, "constraints", action.type);
    if (expectedError) assert.ok(controller.getState().errors[expectedError], action.type);
    timer.scheduled[0].callback();
    assert.equal(controller.getState().phase, "constraints", `${action.type} stale callback`);
  }
});

test("destroy cancels a pending finding completion", () => {
  const cancelled = [];
  const controller = createInspectableController({
    initialState: stateApi.createInitialState({ firstUse: false }),
    render: () => {},
    schedule: () => 91,
    cancel: (id) => cancelled.push(id),
    now: () => 1000,
  });
  controller.start(validConstraints({ category: "cafe", maxWalkMinutes: 15 }));
  controller.destroy();
  assert.deepEqual(cancelled, [91]);
});

test("mock destination is complete for arrival but is not exposed on the browser API", () => {
  assert.equal(typeof MOCK_DESTINATION.name, "string");
  assert.equal(typeof MOCK_DESTINATION.floorUnit, "string");
  assert.equal(Number.isFinite(MOCK_ROUTE.distanceM), true);
  assert.equal(globalThis.SomewhereVNextController.MOCK_DESTINATION, undefined);
  assert.equal(globalThis.SomewhereVNextController.MOCK_ROUTE, undefined);
});

test("render receives only public views and getState returns a deep copy", () => {
  const rendered = [];
  const timer = createScheduler();
  const controller = createInspectableController({
    initialState: stateApi.createInitialState({ firstUse: false }),
    render: (view) => rendered.push(view),
    schedule: timer.schedule,
    cancel: timer.cancel,
    now: () => 1000,
  });
  controller.start(validConstraints());
  timer.scheduled[0].callback();

  assert.equal(rendered.at(-1).phase, "following");
  assert.equal(rendered.at(-1).destination, null);
  assert.equal(JSON.stringify(rendered.at(-1)).includes(MOCK_DESTINATION.name), false);

  const copy = controller.getState();
  copy.destination.name = "changed outside";
  assert.equal(controller.getState().destination.name, MOCK_DESTINATION.name);
});

test("no-fit simulation reports the active advanced conditions without changing them", () => {
  const timer = createScheduler();
  const rendered = [];
  const controller = createInspectableController({
    initialState: stateApi.createInitialState({ firstUse: false }),
    render: (publicView) => rendered.push(publicView),
    schedule: timer.schedule,
    cancel: timer.cancel,
    now: () => 1_000,
  });
  const constraints = validConstraints({
    budget: "20,000원 이하",
    dietary: ["채식"],
    allergies: ["견과류"],
    accessibility: ["계단 없는 입구"],
    disclosure: "minimal",
  });

  controller.start(constraints);
  controller.simulate("no-fit");

  assert.equal(controller.getState().phase, "constraints");
  assert.deepEqual(controller.getState().constraints, constraints);
  assert.deepEqual(controller.getState().affectedConditions, [
    { field: "budget", label: "예산" },
    { field: "dietary", label: "식이 조건" },
    { field: "allergies", label: "알레르기" },
    { field: "accessibility", label: "접근성 조건" },
    { field: "disclosure", label: "목적지 공개 수준" },
  ]);
  assert.deepEqual(rendered.at(-1).affectedConditions, controller.getState().affectedConditions);
});

function createEventRoot() {
  const listeners = new Map();
  const focusCalls = [];
  const focusTarget = {
    focus(options) {
      focusCalls.push(options);
    },
  };
  return {
    innerHTML: "",
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    contains() {
      return true;
    },
    querySelector(selector) {
      return selector === "[data-screen-heading]" ? focusTarget : null;
    },
    click(target) {
      for (const listener of listeners.get("click") || []) {
        listener({ target, preventDefault() {} });
      }
    },
    input(target) {
      for (const listener of listeners.get("input") || []) listener({ target });
    },
    listenerCount(type = "click") {
      return listeners.get(type)?.size ?? 0;
    },
    focusCount() {
      return focusCalls.length;
    },
  };
}

function productButton(action, { reason, reaction, form } = {}) {
  return {
    dataset: { action, ...(reason ? { reason } : {}), ...(reaction ? { reaction } : {}) },
    closest(selector) {
      if (selector === "[data-action]") return this;
      if (selector === '[data-form="constraints"]') return form ?? null;
      return null;
    },
  };
}

function simulationButton(simulation) {
  return {
    dataset: { simulate: simulation },
    closest(selector) {
      return selector === "[data-simulate]" ? this : null;
    },
  };
}

class FixtureFormData {
  constructor(form) {
    this.values = form.values;
  }

  get(name) {
    return this.values[name] ?? null;
  }
}

test("mount delegates product and prototype controls through the reducer", () => {
  const root = createEventRoot();
  const controlsRoot = createEventRoot();
  const timer = createScheduler();
  const dispatchedActions = [];
  let currentNow = 10_000;
  const mounted = mountInspectable(root, controlsRoot, {
    initialState: stateApi.createInitialState({ firstUse: false }),
    schedule: timer.schedule,
    cancel: timer.cancel,
    now: () => currentNow,
    FormData: FixtureFormData,
    stateApi: {
      ...stateApi,
      reduce(state, action) {
        dispatchedActions.push(action.type);
        return stateApi.reduce(state, action);
      },
    },
  });
  const form = {
    values: {
      category: "cafe",
      maxWalkMinutes: "15",
      budget: "10000",
      dietary: "vegan, shellfish-free",
      allergies: "peanut, sesame",
      accessibility: "step-free",
      disclosure: "minimal",
    },
  };

  root.click(productButton("start", { form }));
  assert.equal(mounted.controller.getState().phase, "finding");
  assert.deepEqual(mounted.controller.getState().constraints.dietary, ["vegan", "shellfish-free"]);
  assert.deepEqual(mounted.controller.getState().constraints.allergies, ["peanut", "sesame"]);
  assert.equal(mounted.controller.getState().constraints.disclosure, "minimal");
  timer.scheduled[0].callback();
  assert.equal(mounted.controller.getState().phase, "following");

  controlsRoot.click(simulationButton("walk"));
  assert.equal(mounted.controller.getState().distanceM, 710);
  controlsRoot.click(simulationButton("near"));
  assert.equal(mounted.controller.getState().phase, "near");
  controlsRoot.click(simulationButton("low-confidence"));
  assert.equal(mounted.controller.getState().phase, "route_recovery");
  controlsRoot.click(simulationButton("restore-confidence"));
  assert.equal(mounted.controller.getState().phase, "following");
  controlsRoot.click(simulationButton("missing-arrival-field"));
  assert.equal(mounted.controller.getState().phase, "arrived");
  assert.equal(mounted.controller.getState().destination.floorUnit, null);
  assert.equal(dispatchedActions.at(-1), "ARRIVE_WITH_MISSING_FIELD");

  root.click(productButton("finish-arrival"));
  assert.equal(mounted.controller.getState().phase, "feedback_pending");
  currentNow = mounted.controller.getState().feedbackEligibleAtMs;
  controlsRoot.click(simulationButton("feedback-ready"));
  assert.equal(mounted.controller.getState().phase, "place_reaction");
  root.click(productButton("react", { reaction: "love" }));
  assert.equal(mounted.controller.getState().phase, "complete");

  assert.equal(root.listenerCount(), 1);
  assert.equal(controlsRoot.listenerCount(), 1);
  mounted.destroy();
  assert.equal(root.listenerCount(), 0);
  assert.equal(controlsRoot.listenerCount(), 0);
});

test("mount renders guarded review and restarts with one acknowledged Start", () => {
  const root = createEventRoot();
  const controlsRoot = createEventRoot();
  const timer = createScheduler();
  const mounted = mountInspectable(root, controlsRoot, {
    initialState: stateApi.createInitialState({ firstUse: false }),
    schedule: timer.schedule,
    cancel: timer.cancel,
    now: () => 1000,
    FormData: FixtureFormData,
  });
  const form = {
    values: { category: "restaurant", maxWalkMinutes: "20" },
    reviewVisible: false,
    querySelector(selector) {
      if (selector !== '[name="recoveryReviewed"]' || !this.reviewVisible) return null;
      return {
        checked: this.values.recoveryReviewed === "yes",
        reportValidity() {},
        focus() {},
      };
    },
  };
  root.click(productButton("start", { form }));
  timer.scheduled[0].callback();

  root.click(productButton("stop"));
  root.click(productButton("open-destination-info"));
  root.click(productButton("reveal-destination", { reason: "skipped" }));
  root.click(productButton("continue-after-reveal"));
  controlsRoot.click(simulationButton("restore-confidence"));
  assert.equal(mounted.controller.getState().phase, "following_revealed");

  root.click(productButton("stop"));
  root.click(productButton("request-end"));
  root.click(productButton("confirm-end"));
  root.click(productButton("submit-stop-reason", { reason: "safety" }));
  root.click(productButton("new-recommendation"));
  assert.equal(mounted.controller.getState().guardedRecovery, true);
  assert.match(root.innerHTML, /최근 안내 종료 이유/);
  assert.match(root.innerHTML, /안전 문제/);
  form.reviewVisible = true;
  root.click(productButton("start", { form }));
  assert.equal(mounted.controller.getState().phase, "constraints");
  assert.equal(mounted.controller.getState().errors.recoveryReview, undefined);
  form.values.recoveryReviewed = "yes";
  root.click(productButton("start", { form }));
  assert.equal(mounted.controller.getState().phase, "finding");
});

function stoppedState(reason) {
  const finding = stateApi.reduce(
    stateApi.createInitialState({ firstUse: false }),
    { type: "START", constraints: validConstraints() },
  );
  const following = stateApi.reduce(finding, {
    type: "FIND_SUCCESS",
    destination: MOCK_DESTINATION,
    route: MOCK_ROUTE,
  });
  const paused = stateApi.reduce(following, { type: "STOP" });
  const confirm = stateApi.reduce(paused, { type: "REQUEST_END" });
  const reasonScreen = stateApi.reduce(confirm, { type: "CONFIRM_END", nowMs: 1_000 });
  return stateApi.reduce(reasonScreen, { type: "SUBMIT_STOP_REASON", reason });
}

test("mount dispatches every Stop reason into its guarded new-start review", () => {
  const cases = [
    ["safety", /안전 관련 조건/],
    ["route_sensor", /재보정/],
    ["condition_mismatch", /맞지 않았던 필수 조건/],
    ["venue_problem", /현장에서 문제가 된 사항/],
    ["change_of_mind", /모든 조건/],
    ["schedule_change", /이전 여정은 종료되었어요/],
    ["skipped", /종료 이유를 건너뛰었어요/],
  ];

  for (const [reason, expectedPrompt] of cases) {
    const root = createEventRoot();
    const controlsRoot = createEventRoot();
    const timer = createScheduler();
    const mounted = mountInspectable(root, controlsRoot, {
      initialState: stoppedState(reason),
      schedule: timer.schedule,
      cancel: timer.cancel,
      now: () => 301_000,
      FormData: FixtureFormData,
    });

    root.click(productButton("new-recommendation"));
    assert.equal(mounted.controller.getState().guardedRecovery, true, reason);
    assert.equal(mounted.controller.getState().recoveryReason, reason, reason);
    assert.match(root.innerHTML, expectedPrompt, reason);
    assert.equal((root.innerHTML.match(/name="recoveryReviewed"/g) || []).length, 1, reason);
    assert.equal((root.innerHTML.match(/data-action="start"/g) || []).length, 1, reason);

    const form = {
      values: {
        category: "restaurant",
        maxWalkMinutes: "20",
        disclosure: "standard",
        recoveryReviewed: "yes",
      },
      querySelector(selector) {
        if (selector !== '[name="recoveryReviewed"]') return null;
        return { checked: true, reportValidity() {}, focus() {} };
      },
    };
    root.click(productButton("start", { form }));
    assert.equal(mounted.controller.getState().phase, "finding", reason);
    assert.equal(timer.scheduled.length, 1, reason);
    mounted.destroy();
  }
});

test("mount focuses accepted screen renders but not rejected duplicate actions", () => {
  const root = createEventRoot();
  const controlsRoot = createEventRoot();
  const timer = createScheduler();
  const mounted = mountInspectable(root, controlsRoot, {
    initialState: stateApi.createInitialState({ firstUse: false }),
    schedule: timer.schedule,
    cancel: timer.cancel,
    FormData: FixtureFormData,
  });
  const form = {
    values: {
      category: "restaurant",
      maxWalkMinutes: "20",
      disclosure: "standard",
    },
  };
  const startButton = productButton("start", { form });

  assert.equal(root.focusCount(), 1);
  root.click(startButton);
  assert.equal(root.focusCount(), 2);
  root.click(startButton);
  assert.equal(root.focusCount(), 2);

  mounted.destroy();
});

test("advanced input updates its collapsed summary without rerendering or moving focus", () => {
  const root = createEventRoot();
  const controlsRoot = createEventRoot();
  const summary = { textContent: "추가 조건 1개 적용 중 — 목적지 공개 수준" };
  const details = {
    querySelector(selector) {
      return selector === "summary" ? summary : null;
    },
  };
  const form = {
    values: {
      category: "restaurant",
      maxWalkMinutes: "20",
      budget: "20000",
      dietary: "채식",
      allergies: "견과류",
      accessibility: "계단 없는 입구",
      disclosure: "minimal",
    },
  };
  const input = {
    closest(selector) {
      if (selector === '[data-form="constraints"]') return form;
      if (selector === "[data-advanced-conditions]") return details;
      return null;
    },
  };
  const mounted = mountInspectable(root, controlsRoot, {
    initialState: stateApi.createInitialState({ firstUse: false }),
    FormData: FixtureFormData,
  });
  const focusBeforeInput = root.focusCount();

  root.input(input);

  assert.equal(
    summary.textContent,
    "추가 조건 5개 적용 중 — 예산 · 식이 조건 · 알레르기 · 접근성 조건 · 목적지 공개 수준",
  );
  assert.equal(root.focusCount(), focusBeforeInput);
  mounted.destroy();
});

test("CommonJS test inspection is separate from browser and mounted production APIs", () => {
  assert.equal(typeof createTestController, "function");
  assert.equal(typeof mountForTest, "function");

  const rendered = [];
  const scheduled = [];
  let interceptedDestination = null;
  const browserController = globalThis.SomewhereVNextController.createController({
    initialState: stateApi.createInitialState({ firstUse: false }),
    render: (publicView) => rendered.push(publicView),
    schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
    stateApi: {
      ...stateApi,
      reduce(state, action) {
        if (action.destination) interceptedDestination = action.destination;
        return stateApi.reduce(state, action);
      },
    },
  });
  assert.equal(browserController.getState, undefined);
  browserController.start(validConstraints());
  scheduled[0]();
  assert.equal(interceptedDestination, null);
  assert.equal(rendered.at(-1).destination, null);

  const root = createEventRoot();
  const controlsRoot = createEventRoot();
  const mounted = globalThis.SomewhereVNextController.mount(root, controlsRoot, {
    initialState: stateApi.createInitialState({ firstUse: false }),
  });
  assert.equal(mounted.controller.getState, undefined);

  const inspected = createTestController({
    initialState: stateApi.createInitialState({ firstUse: false }),
    render: () => {},
  });
  assert.equal(typeof inspected.getState, "function");
  mounted.destroy();
  browserController.destroy();
});

test("app boot return value cannot inspect private controller state", () => {
  const previousDocument = globalThis.document;
  const root = createEventRoot();
  const controlsRoot = createEventRoot();
  try {
    delete globalThis.document;
    delete require.cache[require.resolve("./app.js")];
    const { boot } = require("./app.js");
    globalThis.document = {
      querySelector(selector) {
        if (selector === "#app") return root;
        if (selector === "#prototype-controls") return controlsRoot;
        return null;
      },
    };
    const mounted = boot();
    assert.equal(mounted.controller.getState, undefined);
    mounted.destroy();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

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
    { action: { type: "FIND_NO_FIT" }, expectedError: "finding" },
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

function createEventRoot() {
  const listeners = new Set();
  return {
    innerHTML: "",
    addEventListener(type, listener) {
      if (type === "click") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "click") listeners.delete(listener);
    },
    contains() {
      return true;
    },
    click(target) {
      for (const listener of listeners) listener({ target, preventDefault() {} });
    },
    listenerCount() {
      return listeners.size;
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
  let currentNow = 10_000;
  const mounted = mountInspectable(root, controlsRoot, {
    initialState: stateApi.createInitialState({ firstUse: false }),
    schedule: timer.schedule,
    cancel: timer.cancel,
    now: () => currentNow,
    FormData: FixtureFormData,
  });
  const form = {
    values: {
      category: "cafe",
      maxWalkMinutes: "15",
      budget: "10000",
      dietary: "vegan, shellfish-free",
      accessibility: "step-free",
    },
  };

  root.click(productButton("start", { form }));
  assert.equal(mounted.controller.getState().phase, "finding");
  assert.deepEqual(mounted.controller.getState().constraints.dietary, ["vegan", "shellfish-free"]);
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
  assert.equal(mounted.controller.getState().destination.floorUnit, undefined);

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

"use strict";

(function initController(globalScope) {
  const stateApi =
    globalScope.BlindCompassState ||
    (typeof require === "function" ? require("./state.js") : undefined);
  const screens =
    globalScope.BlindCompassScreens ||
    (typeof require === "function" ? require("./screens.js") : undefined);

  const DATA_PATH = "../data/mock_destinations.json";
  const fallbackDestinations = [
    {
      id: "d001",
      name: "Small Independent Bookstore",
      category: "shop",
      mood: "quiet discovery",
      initialDistanceM: 720,
      estimatedMinutes: 12,
      safetyLevel: "safe",
      hint: "A quiet place with paper and light",
      description:
        "A small local bookstore tucked away from the main street. Good for a short, quiet discovery.",
    },
    {
      id: "d002",
      name: "Alley Cafe",
      category: "cafe",
      mood: "casual pause",
      initialDistanceM: 480,
      estimatedMinutes: 8,
      safetyLevel: "safe",
      hint: "A small warm pause nearby",
      description:
        "A calm neighborhood cafe hidden in a narrow alley. Good for a light stop during a walk.",
    },
    {
      id: "d003",
      name: "Tiny Local Gallery",
      category: "culture",
      mood: "curious",
      initialDistanceM: 950,
      estimatedMinutes: 16,
      safetyLevel: "safe",
      hint: "Something quiet to look at",
      description:
        "A compact cultural space with a small exhibition. Good for a short local discovery.",
    },
    {
      id: "d004",
      name: "Pocket Park Viewpoint",
      category: "walk",
      mood: "open air",
      initialDistanceM: 630,
      estimatedMinutes: 10,
      safetyLevel: "safe",
      hint: "A small opening in the city",
      description:
        "A small public spot where the street opens up. Good for a quick pause and a change of pace.",
    },
    {
      id: "d005",
      name: "Local Craft Shop",
      category: "shop",
      mood: "handmade",
      initialDistanceM: 860,
      estimatedMinutes: 14,
      safetyLevel: "safe",
      hint: "Something made by hand",
      description:
        "A small shop featuring local objects and handmade goods. Good for a slow browse.",
    },
  ];

  async function loadDestinations() {
    if (typeof globalScope.fetch !== "function") return fallbackDestinations;
    try {
      const response = await globalScope.fetch(DATA_PATH, { cache: "no-store" });
      if (!response.ok) throw new Error(`Mock data request failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      return fallbackDestinations;
    }
  }

  function createController(root, destinations) {
    const model = {
      destinations,
      loading: false,
      state: undefined,
    };

    function update(nextState) {
      model.state = nextState;
      model.loading = false;
      screens.renderApp(root, model);
    }

    function selectAdventure(options = {}) {
      model.loading = true;
      screens.renderApp(root, model);
      globalScope.setTimeout(() => {
        update(stateApi.startAdventure(model.destinations, options));
      }, 700);
    }

    root.addEventListener("click", (event) => {
      const control = event.target.closest("[data-action]");
      if (!control) return;

      const action = control.dataset.action;
      if (action === "start") {
        selectAdventure();
        return;
      }
      if (!model.state) return;

      if (action === "follow") update(stateApi.beginFollowing(model.state));
      if (action === "move") update(stateApi.moveCloser(model.state));
      if (action === "reveal") update(stateApi.revealDestination(model.state));
      if (action === "give-up") update(stateApi.giveUp(model.state));
      if (action === "reroll") {
        update(stateApi.rerollAdventure(model.state, model.destinations));
      }
    });

    screens.renderApp(root, model);
    return { model, update, selectAdventure };
  }

  async function init() {
    const root = globalScope.document?.querySelector("#app");
    if (!root) return;
    const destinations = await loadDestinations();
    createController(root, destinations);
  }

  const api = {
    DATA_PATH,
    fallbackDestinations,
    loadDestinations,
    createController,
    init,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.BlindCompassController = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

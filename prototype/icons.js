"use strict";

(function initIcons(globalScope) {
  const icons = {
    arrow:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 21l-7-4-7 4 7-18Z" fill="currentColor"/></svg>',
    reveal:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c4.8 0 8.2 4.2 9.2 6.5a1.2 1.2 0 0 1 0 1C20.2 14.8 16.8 19 12 19s-8.2-4.2-9.2-6.5a1.2 1.2 0 0 1 0-1C3.8 9.2 7.2 5 12 5Zm0 3.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" fill="currentColor"/></svg>',
    stop:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10l3 3v10l-3 3H7l-3-3V7l3-3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    reroll:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 6.2A8 8 0 0 0 4.3 10M18 4v5h-5M6.2 17.8A8 8 0 0 0 19.7 14M6 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    step:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c3.2-1.1 5.3-3.4 6.2-6.8L14 5l4 2-2.2 6.8C14.5 18 11.6 20.4 7 21l-1-2Z" fill="currentColor"/></svg>',
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = icons;
  }
  globalScope.BlindCompassIcons = icons;
})(typeof globalThis !== "undefined" ? globalThis : window);

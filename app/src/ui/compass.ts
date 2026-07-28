import { normalizeDegrees, shortestAngularDelta } from "../domain/geo";

export interface CompassAnimator {
  update(targetDegrees: number | null): void;
  applyCurrent(): void;
  destroy(): void;
}

export function createCompassAnimator(root: HTMLElement): CompassAnimator {
  let displayedDegrees: number | null = null;
  let targetDegrees: number | null = null;
  let animationFrame: number | null = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function needle(): HTMLElement | null {
    return root.querySelector<HTMLElement>("[data-compass-needle]");
  }

  function apply(): void {
    animationFrame = null;
    if (targetDegrees === null) {
      return;
    }
    const normalizedTarget = normalizeDegrees(targetDegrees);
    if (normalizedTarget === null) {
      return;
    }
    if (displayedDegrees === null || reduceMotion.matches) {
      displayedDegrees = normalizedTarget;
    } else {
      const delta = shortestAngularDelta(displayedDegrees, normalizedTarget);
      if (delta !== null) {
        displayedDegrees += delta;
      }
    }
    needle()?.style.setProperty("--needle-angle", `${displayedDegrees}deg`);
  }

  return {
    update(nextTarget) {
      targetDegrees = nextTarget;
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(apply);
      }
    },
    applyCurrent() {
      if (displayedDegrees !== null) {
        needle()?.style.setProperty("--needle-angle", `${displayedDegrees}deg`);
      }
    },
    destroy() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    },
  };
}

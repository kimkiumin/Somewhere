# Main Compass Launch Design

Status: user-approved implementation direction (2026-08-17)

## Goal

Make the compass the primary action and continuous visual identity of the Roll the compass! journey. The same compass face must serve as the launch button, the searching indicator, and the route-direction instrument.

## Visual Thesis

One restrained monochrome compass changes responsibility without changing identity: ready to launch, rotating while searching, and pointing while guiding.

## Considered Approaches

### A. Shared compass renderer with state variants — selected

Render one compass shell and needle structure through a single function. The constraints, finding, and guidance screens choose only the semantic element and needle state. This prevents visual drift and fits the existing plain HTML renderer.

### B. Three separately styled compass elements

This is locally simple but would duplicate markup and let the launch, search, and guidance visuals diverge. It is rejected because consistency is the primary requirement.

### C. Keep one persistent DOM compass and morph the surrounding screen

This could create a literal shared-element transition, but the current renderer replaces the whole screen on every state change. Introducing persistent DOM ownership would add substantial controller complexity without testing a necessary product behavior, so it is deferred.

## Screen Structure

### Constraints home

The first viewport contains:

- Roll the compass! as the screen heading.
- The existing profile menu in the top-right corner.
- A large circular compass button centered in the available space.
- A short cue that the compass starts the journey.
- A small scroll cue linking to the condition settings below.

`지금 필요한 조건` is not shown in the first viewport. It becomes the heading of a condition-settings section below the fold. The existing party, walking-time, budget, disclosure, error, affected-condition, and guarded-recovery controls remain in the same constraints form. There is exactly one `start` action: the compass button.

The form structure lets the top compass button submit the values currently shown below without duplicating state or controller behavior.

### Finding

The finding screen renders the same compass shell at the same nominal size. Its needle uses the existing searching rotation, accompanied by live text that a destination and walking route are being checked. No direction claim or destination identity is shown.

### Guidance

Following, near, paused, and recovery screens continue to use the same compass shell. Trusted guidance rotates the needle to the route bearing; searching and recovery rotate it; paused guidance holds a neutral mark. Navigation instructions and distance remain outside the compass.

## Compass Component Contract

The shared renderer supports two semantic forms:

- Interactive launch: a `button` with `data-action="start"`, an accessible label of `이 조건으로 바로 출발`, and a visible `출발` label.
- Status instrument: a non-interactive `div` with the existing role and state-dependent accessible description.

Every form uses the same `compass-shell` and `compass-needle` structure. Needle variants are:

- `is-ready`: fixed neutral launch pose that does not claim a route direction.
- `is-searching`: continuous rotation.
- `is-pointing`: route-bearing rotation using `--bearing`.
- `is-paused`: neutral stationary line.

## Layout and Motion

The launch section consumes the initial mobile viewport after accounting for page padding. The settings section starts below it, so it is reached by scrolling rather than appearing beside the primary action. The 440px prototype width and monochrome wireframe style remain unchanged.

The launch compass has a restrained hover/press response. Search rotation remains the only continuous animation. Under `prefers-reduced-motion: reduce`, rotation stops while the accompanying text continues to communicate search status.

## Controller and State Impact

No reducer state or transition changes are required. The existing `start` action still reads the one constraints form, validates guarded recovery when present, enters `finding`, and automatically enters guidance when the mock destination and route are ready.

## Accessibility

- The compass launch control remains a native button with a 44px-or-larger target.
- The visible `출발` label and full accessible name both describe the action.
- The settings section has a stable anchor target for the scroll cue.
- Search and route status remain available as text, so meaning does not depend on animation.
- Keyboard focus and reduced-motion behavior remain supported.

## Verification

Automated tests must prove:

- Constraints render exactly one `start` action and it is the compass button.
- The first-view launch structure precedes the `지금 필요한 조건` settings section.
- Constraints, finding, and guidance all render the shared compass shell.
- Finding uses the searching needle and never a pointing needle.
- Guidance still uses the pointing needle and route bearing.
- Existing form reading, party, slider, profile, Stop, recovery, and disclosure tests remain green.

Manual browser verification must cover common mobile widths, desktop width, scrolling into settings, launch-to-search-to-guidance continuity, keyboard activation, reduced motion, and console errors.

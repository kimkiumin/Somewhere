# Roll the compass! Brand Rename Design

Status: user-approved project name

Date: 2026-08-17

## Goal

Replace the active `Somewhere` product name with the exact public brand `Roll the compass!` across the vNext product, documentation, prototype, test contracts, package metadata, sensor-spike copy, and internal JavaScript namespaces without changing the approved product sequence.

## Naming Contract

- Public product name: `Roll the compass!`
- Public Korean/English headings use the exact capitalization and exclamation mark above.
- JavaScript namespace stem: `RollTheCompass`
- vNext JavaScript globals: `RollTheCompassVNextState`, `RollTheCompassVNextScreens`, `RollTheCompassVNextController`, `RollTheCompassVNextApp`
- Navigation geometry global: `RollTheCompassGeometry`
- npm package name: `roll-the-compass-vnext`
- iOS sensor-spike bundle identifier: `com.rollthecompass.sensorspike`
- Test and temporary-directory prefixes: `roll-the-compass-*`

## Scope

The rename covers:

- vNext browser title and onboarding heading;
- active blueprint and sequence documentation;
- prototype README and current design/spec documentation;
- user-facing research and validation wording;
- runtime error messages and browser globals;
- package metadata;
- sensor-spike title, permission copy, and bundle-identifier instructions;
- automated tests that enforce the product name or renamed namespaces;
- public prototype repository description and deployed content after the source branch is verified.

## Stable Compatibility Boundaries

This change does not rename:

- the local checkout path `C:\Users\kyumin\Documents\somewhere`;
- the existing GitHub repository slugs and their public URLs;
- the active branch name `codex/vnext-sequence-prototype`;
- historical plan/spec filenames that contain `somewhere`;
- historical filesystem paths recorded as evidence in `docs/prototype_notes.md`;
- external URLs whose slug contains `Somewhere`.

Those values are locators, not product copy. Keeping them stable prevents broken worktrees, remotes, Pages links, and historical evidence. Their visible titles and descriptions may use the new brand.

## Documentation Policy

Active prose replaces `Somewhere` with `Roll the compass!`. Historical plan content is updated when it describes the product name, but literal commands, repository locators, file paths, URL slugs, and old commit-era paths remain unchanged when changing them would make the record false or unusable.

After implementation, a case-insensitive search for `Somewhere` must return only approved compatibility-boundary occurrences.

## Behavior and Visual Impact

The rename changes no state transition, input rule, recommendation behavior, navigation behavior, disclosure timing, or safety flow. Existing layouts must accommodate the longer `Roll the compass!` heading at 360–440 px widths without overflow. This is a naming pass, not the visual-design implementation.

## Testing

- Update the browser-title contract before production copy.
- Add an onboarding renderer assertion for the exact public name.
- Update namespace tests to require `RollTheCompass*` globals and reject the old public globals.
- Update package and sensor-spike contract assertions where present.
- Run the focused prototype tests, repository contract tests, and full `npm.cmd run verify`.
- Search tracked files for unapproved old-name occurrences.
- Deploy the isolated wireframe and verify the public browser title and onboarding heading.


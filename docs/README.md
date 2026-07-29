# Somewhere documentation authority

Use this index before applying a document to current work.

## Current V2 authority

For V2 product and backend work, use this exact order when sources disagree:

1. The project owner's latest explicit direction.
2. Root [`BLUEPRINT.md`](../BLUEPRINT.md) and the linked
   [`blueprint/`](blueprint/) documents. These are the authoritative approved
   V2 product direction.
3. The current
   [V2 mobile-service design](superpowers/specs/2026-07-29-somewhere-v2-mobile-service-design.md)
   for implementation details that do not conflict with the blueprint.
4. Executable V2 contracts, code, and tests as implementation evidence; they
   must not silently override items 1–3.
5. The v0.2 application and frozen v0.1 prototype as historical evidence only.

The approved blueprint files were copied byte-for-byte from their source Git
objects. Their provenance and hashes are recorded in
[`blueprint/SOURCE_RECEIPT.md`](blueprint/SOURCE_RECEIPT.md).

The executable backend operations boundary and its intentionally unresolved
external launch gates are summarized in the
[V2 pilot backend operations runbook](operations/v2-pilot-backend.md).
Exact-tree preparation, F1–F4 evidence, cleanup, and public-release blockers
are defined in the [V2 release runbook](operations/v2-release.md). The
[machine-readable authority map](authority-map-v2.json) is the release scope
source of truth.

V2 has no active Reroll control. Its recovery model is immediate Stop pause,
explicit stop confirmation, and a guarded new recommendation only after the
journey has ended. Reroll requirements in older files apply only to their
historical version.

## Historical v0.2 application

To understand the preserved v0.2 `/app` behavior, use the following historical
order:

1. The latest explicit product decision from the project owner.
2. Root [`README.md`](../README.md), [`AGENTS.md`](../AGENTS.md), and
   [`DESIGN.md`](../DESIGN.md).
3. Current `/app` code and automated tests, plus the
   [iPhone field gate](../app/qa/field/README.md) for physical sensor quality.
4. The dated
   [v0.2 sensor-webapp design](superpowers/specs/2026-07-28-somewhere-v0.2-sensor-webapp-design.md)
   as implementation-plan history.

The dated v0.2 design records why the current architecture exists, but current
v0.2 code and tests supersede details changed during verification, including
heading-silence handling and lifecycle cleanup. This historical order does not
override the V2 authority order above.

## Frozen v0.1 prototype

`/prototype` and these documents describe the dependency-free simulated v0.1:

- [`project_brief.md`](project_brief.md)
- [`core_ux.md`](core_ux.md)
- [`prototype_spec.md`](prototype_spec.md)
- [`prototype_notes.md`](prototype_notes.md)
- [`source_basis.md`](source_basis.md)

Preserve the prototype and its 11 regression tests. Its simulated movement and
“no real GPS” constraints do not apply to `/app`.

## Research and working history

The remaining files in this directory are research, decision logs, prompt
material, handoffs, or earlier setup guidance. Keep them for provenance, but do
not treat them as executable `/app` requirements when they conflict with the
current authority order above.

# Somewhere V2 wire contract v1

All JSON is strict UTF-8 with `contractVersion: 1`; duplicate and unknown keys, non-finite numbers, unsafe integers, invalid versions, and non-canonical identifiers are rejected. Responses are `application/json; charset=utf-8` and `Cache-Control: no-store, private`; `204` is bodyless.

The runtime source of truth is `contracts/src/`. [wire-contract-v1.json](wire-contract-v1.json) materializes the phase/action tuples, limits, sequence, replay, and race constants.

Finding has exactly `["poll","cancel"]`; Cancel is authenticated `DELETE /api/v1/journeys/:journeyId`. Arrived has only server Reveal when unrevealed and no action when revealed. Done is local dismissal only. Before Reveal, identity and standalone endpoint are unavailable. Before Commit, route geometry is unavailable; after Commit it may exist only as the short-lived route projection in current-tab volatile memory.

Every POST and DELETE requires a canonical 256-bit idempotency key. Every journey mutation after creation requires the exact current canonical decimal sequence. Exact completed replay returns the original status and body bytes for a non-extending 24-hour TTL before sequence evaluation; changed scope, route, body, or sequence is an idempotency conflict.

Request controls execute in this order: route/method allowlist, canonical Host/Origin/Fetch Metadata, pre-buffer body ceiling, media type, session, CSRF, strict schema, admission, authorization, idempotency, sequence, transition/policy. Delete/expiry beats confirmed Stop, Stop request, Arrived latch, revalidated ordinary work, and Reveal.

Capabilities are purpose-, session-, object-, constraint-, and policy-bound, HMAC-digest-only at rest, non-canonical forms fail closed, and raw values never enter URLs, logs, traces, screenshots, analytics, D1 audit, or public evidence. Recovery values remain volatile and one-time. The sole persistent bearer exception is the one-prompt feedback capability in IndexedDB for at most seven days under deletion/revocation rules.

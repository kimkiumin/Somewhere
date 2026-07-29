# Somewhere V2 operations policy v1

The canonical object is [operations-policy-v1.json](operations-policy-v1.json), frozen as of 2026-07-29.

For every independent meter, effective use is the greater of platform-observed and locally finalized use, each including unrelated account baseline, plus outstanding reservations and uncertainty reserve. The first seven windows reserve 20%; later windows reserve at least 10% or the greatest seven-window reconciliation error. Warn at 50% and close new work at 80%. A delayed lower sample never reopens admission, and a wall-clock reset alone never reopens it.

The state machine is exactly `BOOT_BLOCKED`, `OPEN`, `WARN`, `METER_BLOCK`, `EXTERNAL_BLOCK`, `WRITE_FENCED`, `DEGRADED`, `EMERGENCY_FROZEN`, and `RECOVERY_VERIFY`. Reopening requires two fresh samples five minutes apart plus invariant and smoke success. Local Stop is immediate. Server Reveal, Stop, and Delete remain safety-lane operations only while their required platform and stores are reachable.

Race priority is Delete/expiry, confirmed Stop, Stop request, arrival, Reveal, route work, Commit, Continue, then reaction. Release order is admission close, reservation and producer drain/fence, Queue/outbox/inbox drain, Queue pause, backup/bookmark, expand migration, compatible code, terminal smoke, then ordered resume.

Retention maxima are encoded in the JSON. Exact location, heading, sensor windows, and route geometry never enter D1, Queue, logs, analytics, caches, Web Storage, IndexedDB, or release evidence. Active route/origin exists only in the owning Journey Durable Object and current tab memory. Provider-rights and independent Korean review are strict machine records; missing, expired, synthetic, scope-mismatched, or digest-mismatched evidence is `BLOCK`.

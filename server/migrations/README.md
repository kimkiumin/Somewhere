# D1 migration and recovery runbook

`0001_v2.sql` is forward-only. Apply it locally through the repository command:

```sh
bun run db:migrate:local
```

Before a staging or production expand migration, capture a governed portable
export and a Time Travel bookmark:

```sh
bunx wrangler d1 export DB --remote --env staging \
  --config server/wrangler.jsonc --output /governed/path/pre-migration.sql
bunx wrangler d1 time-travel info DB --env staging \
  --config server/wrangler.jsonc --json
```

Rehearse restore against isolated local persistence, never the active local,
staging, or production database:

```sh
bunx wrangler d1 execute DB --local --config server/wrangler.jsonc \
  --persist-to /tmp/somewhere-d1-restore --file /governed/path/pre-migration.sql
```

Compare canonical allowed-record digests before approving a release. A
destructive remote Time Travel restore requires the separate recovery path:
admission closed, producers fenced, queues drained and paused, higher write
epoch established, deletion tombstones reapplied, and terminal smoke checks
passed before traffic resumes.

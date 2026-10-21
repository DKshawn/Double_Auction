# Database transfer optimization — 2026-10-21

## Change

Room authentication/routing, command transactions, HTTP snapshots and SSE feeds used to download the whole room JSON repeatedly. Each new SSE subscriber also triggered a full classroom read, including previously loaded order history.

Reads now send the revisions already present in the application process to PostgreSQL. The same SQL statement checks the current rows and returns only a revision for unchanged data. Changed markets return their current state and the missing suffix of archived orders. Root and market data in a snapshot are still read atomically in one statement.

The equality token combines PostgreSQL `xmin` with the existing application version, and the root token also includes the room's creation timestamp. `xmin` catches row updates during storage transitions even when the public version does not change. Tokens are opaque equality checks, never timestamps or sortable transaction IDs. A recreated room cannot reuse the old room's history cursors.

Each database handle has an LRU read cache limited to 32 rooms and 32 MiB of serialized snapshots. The cache only contains successful committed reads. Eviction or cold starts cause a full database read. Existing active SSE feeds can supply their own previous snapshot if the shared cache evicts it.

## Correctness boundaries

- Every read still checks PostgreSQL; there is no TTL during which a stale room can be served without validation.
- Commands retain the room SHARE/UPDATE lock, market UPDATE lock, database clock, commit-before-response, idempotency receipts, audit records and transactional notifications.
- Even when a cached root matches before waiting, its row revision is checked again by PostgreSQL after the lock is acquired. Transaction roots are cloned and never put into the shared read cache.
- The existing notification path, one-second fallback revision polling, five-second heartbeats and SSE rotation are unchanged.
- Authentication is rechecked against current data. Database failures propagate; cached data is never substituted for a failed query. Missing rooms remain 404 and revoked sessions remain 401.
- No schema migration, new index, trading-rule change, client protocol change or data truncation is required. Export continues to load all committed history.

## Local transfer measurements

Baseline source: `c09be67`. Same deterministic scenario before and after: 192 participants, 12 markets, one CDA period, and 99 archived quote replacements before sampling. The scenario uses the existing saved-room format without lobby randomization so seats stay deterministic.

| Scenario                                                                | Before, bytes | After, bytes | Reduction |
| ----------------------------------------------------------------------- | ------------: | -----------: | --------: |
| 192 unchanged student snapshots                                         |    31,140,080 |       36,384 |    99.88% |
| 30 quote replacements, including pre/post reads and transaction results |    17,167,950 |      756,930 |    95.59% |
| 20 teacher snapshots                                                    |     4,244,360 |       14,240 |    99.66% |
| 32 successive SSE connections in one process                            |     4,253,440 |       21,024 |    99.51% |

Measurement is the UTF-8 JSON size of SQL result rows returned to the application, including reads inside transactions. This is a reproducible local PGlite comparison, **not Neon billed traffic or a production latency benchmark**. Protocol/TLS overhead, cold-start frequency, serverless instance distribution, participant count and experiment history affect production results. Query counts are unchanged: 384, 360, 40 and 32 respectively.

Reproduce without contacting Neon or Vercel:

```powershell
$env:TEACHER_ACCESS_KEY=''
$env:LOCAL_TRANSFER_REPORT='work/db-transfer-after.json'
npm.cmd run test:transfer-local
```

The script constructs its own in-memory PGlite database and does not read a database connection URL. Only aggregate sizes/counts/timings are written to its report, never credentials or participant data.

## Verification

- Unit/integration suite: 331 passed; two opt-in PostgreSQL tests skipped in the default run.
- Dedicated local PostgreSQL run: both tests passed, including real concurrent row locks, a cached read waiting behind an external writer, exactly one fill for competing accepts, cross-connection push, pause/resume, retries, Call clearing, full-history export and reconnect recovery.
- Five new transfer/cache regressions cover changed physical rows without logical version changes, market replacement/removal, rollback isolation, credential revocation, database failures, deleted rooms and SSE payload privacy.
- Two Chrome browser regressions passed against the built app and local PostgreSQL: 12 independent students trading/recovering/exporting, and CDA stream rotation through feedback, pause/resume and a real offline/reconnect cycle.
- TypeScript, ESLint and optimized Next.js production build passed.

The local PostgreSQL test was updated to respect the existing feedback interval between periods and the existing public Call price display. Browser tests were corrected to match the existing CSV download button and to recognize SSE URLs containing the session query parameter. Production trading behavior was not changed to satisfy these tests.

No production migration, deployment or cloud load test was performed. These savings take effect online only after this source change is deployed.

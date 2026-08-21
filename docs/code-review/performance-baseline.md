# Performance Baseline

Measured on 2026-08-21 using PostgreSQL 17.10 in the local Docker test service on an Apple M3
host. The isolated fixture contains exactly 100,000 active ledger entries, 10,000 active source
documents, and 100 categories. It uses the production numeric scales and the relevant active-row
date, projection, and category indexes.

Each query was warmed three times and then measured 20 times through a single PostgreSQL
connection. Run `npm run benchmark:stats` to recreate the fixture in the dedicated
`cashier_perf_benchmark` schema, print the measurements, and remove the schema.

| Query | p50 | p95 | Min | Max |
| --- | ---: | ---: | ---: | ---: |
| Enhanced stats | 121.16 ms | 124.72 ms | 118.89 ms | 126.02 ms |
| Ledger summary | 21.12 ms | 21.74 ms | 20.60 ms | 22.09 ms |

The materialization threshold is p95 greater than 500 ms. Neither query crosses it, so
`ledger_daily_stats` and migration `0029_performance_convergence.sql` are intentionally not
created. Stats query changes are debounced by 250 ms and existing ledger-scoped mutation
predicates provide targeted cache invalidation.

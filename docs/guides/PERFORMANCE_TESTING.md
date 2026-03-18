# Performance Testing Guide

This guide covers the lightweight single-node load testing workflow for Cashier.

## What It Measures

- Single-instance capacity for the current `Next.js + SQLite` deployment shape
- Stable concurrency under a simple SLO target
- Read-heavy API behavior for:
  - `GET /api/v1/entries`
  - `GET /api/v1/stats`
  - `GET /api/v1/source-documents`
  - `GET /api/v1/task/stats`
  - `GET /api/v1/task/items`
- Auxiliary write behavior for:
  - `POST /api/v1/source-documents`

The baseline result is intentionally read-focused. The write scenario is available as an auxiliary profile because it can be influenced by background AI task execution.

## Prerequisites

- `k6` installed locally and available in `PATH`
- The usual app dependencies installed with `npm install`

## Quick Start

1. Seed the dedicated performance database:

```bash
npm run perf:seed
```

This creates:

- `data/perf.sqlite.db`
- `perf/.seed.json`

2. Build the app in production mode:

```bash
npm run perf:build
```

3. Start the app against the perf database:

```bash
npm run perf:start
```

4. In another terminal, run the read smoke test:

```bash
npm run perf:smoke
```

5. Run the read baseline test:

```bash
npm run perf:baseline
```

If `k6` is not in your `PATH`, point the script to it explicitly:

```bash
K6_BIN=/absolute/path/to/k6 npm run perf:smoke
```

## Write Scenario

To measure enqueue/write behavior instead of the read mix:

```bash
PERF_SCENARIO=write_enqueue npm run perf:smoke
PERF_SCENARIO=write_enqueue npm run perf:baseline
```

This scenario only measures request completion for `POST /api/v1/source-documents`. It does not treat downstream AI completion time as part of the performance target.

## Defaults

Seed defaults:

- `PERF_CATEGORY_COUNT=30`
- `PERF_SOURCE_DOCUMENT_COUNT=10000`
- `PERF_ENTRY_COUNT=30000`
- `PERF_TASK_RUN_COUNT=2000`
- `PERF_DAYS_BACK=365`

Runtime defaults:

- `DATABASE_URL=file:./data/perf.sqlite.db`
- `API_RATE_LIMIT_PER_MINUTE=100000`
- `PERF_BASE_URL=http://127.0.0.1:3000`
- `PERF_SCENARIO=read_mix`

## SLO Targets

- Read baseline: `p95 < 500ms`, error rate `< 1%`
- Write enqueue: `p95 < 1000ms`, error rate `< 1%`

## Result Files

The npm wrappers export k6 summaries to:

- `data/perf-smoke-summary.json`
- `data/perf-baseline-summary.json`

Use these together with the k6 console output to identify the highest stable concurrency tier.

import { performance } from "node:perf_hooks";
import pg from "pg";

const { Pool } = pg;
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test";
const SCHEMA = "cashier_perf_benchmark";
const WARMUP_RUNS = 3;
const MEASURED_RUNS = 20;

const enhancedStatsSql = `
  WITH ranges(period, from_date, to_date) AS (
    VALUES
      ('current'::text, '2025-01-01'::date, '2025-12-31'::date),
      ('previous'::text, '2024-01-01'::date, '2024-12-31'::date)
  )
  SELECT ranges.period, documents.effective_date, entries.currency, entries.category_id,
    categories.name, categories.icon, sum(entries.converted_amount)::text AS total_amount,
    count(*) FILTER (WHERE entries.converted_amount IS NOT NULL)::int AS entry_count,
    ledgers.main_currency,
    count(*) FILTER (WHERE entries.converted_amount IS NULL)::int AS unconverted_count
  FROM ranges
  JOIN source_documents documents
    ON documents.ledger_id = 'ledger-benchmark'
    AND documents.effective_date BETWEEN ranges.from_date AND ranges.to_date
    AND documents.deleted_at IS NULL
  JOIN ledger_entries entries
    ON entries.ledger_id = documents.ledger_id
    AND entries.source_document_id = documents.id
    AND entries.source_document_revision_id = documents.active_revision_id
    AND entries.deleted_at IS NULL
  JOIN ledgers ON ledgers.id = documents.ledger_id AND ledgers.deleted_at IS NULL
  LEFT JOIN entry_categories categories ON categories.id = entries.category_id
  GROUP BY ranges.period, documents.effective_date, entries.currency, entries.category_id,
    categories.name, categories.icon, ledgers.main_currency
`;

const ledgerSummarySql = `
  WITH visible_entries AS (
    SELECT entries.currency, entries.amount, entries.converted_amount, documents.effective_date
    FROM ledger_entries entries
    JOIN source_documents documents
      ON documents.ledger_id = entries.ledger_id
      AND documents.id = entries.source_document_id
      AND documents.deleted_at IS NULL
      AND documents.active_revision_id = entries.source_document_revision_id
    WHERE entries.ledger_id = 'ledger-benchmark'
      AND entries.deleted_at IS NULL
      AND documents.effective_date BETWEEN '2025-01-01'::date AND '2025-12-31'::date
  ),
  currency_totals AS (
    SELECT currency, sum(amount)::text AS total, count(*)::int AS count
    FROM visible_entries GROUP BY currency
  ),
  trend AS (
    SELECT effective_date::text AS date, sum(converted_amount)::text AS total
    FROM visible_entries GROUP BY effective_date
  ),
  converted_total AS (
    SELECT coalesce(sum(converted_amount), 0)::text AS total FROM visible_entries
  ),
  unconverted AS (
    SELECT count(*) FILTER (WHERE converted_amount IS NULL)::int AS count FROM visible_entries
  )
  SELECT count(*) FROM (
    SELECT currency FROM currency_totals
    UNION ALL SELECT date FROM trend
    UNION ALL SELECT total FROM converted_total
    UNION ALL SELECT count::text FROM unconverted
  ) result
`;

function percentile(values, fraction) {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function measure(client, name, query) {
  for (let index = 0; index < WARMUP_RUNS; index += 1) await client.query(query);
  const durations = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const startedAt = performance.now();
    await client.query(query);
    durations.push(performance.now() - startedAt);
  }
  return {
    name,
    p50Ms: Number(percentile(durations, 0.5).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    minMs: Number(Math.min(...durations).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
  };
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await client.query(`CREATE SCHEMA ${SCHEMA}`);
  await client.query(`SET search_path TO ${SCHEMA}`);
  await client.query("SET synchronous_commit TO off");
  await client.query(`
    CREATE TABLE ledgers (
      id text PRIMARY KEY,
      main_currency text NOT NULL,
      deleted_at timestamptz
    );
    CREATE TABLE entry_categories (
      id integer PRIMARY KEY,
      name text NOT NULL,
      icon text
    );
    CREATE TABLE source_documents (
      id integer PRIMARY KEY,
      ledger_id text NOT NULL,
      active_revision_id integer NOT NULL,
      effective_date date NOT NULL,
      deleted_at timestamptz
    );
    CREATE TABLE ledger_entries (
      id integer PRIMARY KEY,
      ledger_id text NOT NULL,
      source_document_id integer NOT NULL,
      source_document_revision_id integer NOT NULL,
      category_id integer,
      currency text NOT NULL,
      amount numeric(21,3) NOT NULL,
      converted_amount numeric(21,3),
      deleted_at timestamptz
    );
  `);
  await client.query(`
    INSERT INTO ledgers VALUES ('ledger-benchmark', 'CNY', NULL);
    INSERT INTO entry_categories (id, name, icon)
    SELECT value, 'Category ' || value, 'Package' FROM generate_series(1, 100) value;
    INSERT INTO source_documents (id, ledger_id, active_revision_id, effective_date)
    SELECT value, 'ledger-benchmark', value,
      date '2023-01-01' + ((value * 37) % 1095)
    FROM generate_series(1, 10000) value;
    INSERT INTO ledger_entries (
      id, ledger_id, source_document_id, source_document_revision_id,
      category_id, currency, amount, converted_amount
    )
    SELECT value, 'ledger-benchmark', ((value - 1) / 10) + 1, ((value - 1) / 10) + 1,
      ((value - 1) % 100) + 1,
      (ARRAY['CNY', 'USD', 'EUR', 'JPY'])[((value - 1) % 4) + 1],
      ((value % 100000) + 1)::numeric / 100,
      CASE WHEN value % 97 = 0 THEN NULL ELSE ((value % 100000) + 1)::numeric / 100 END
    FROM generate_series(1, 100000) value;
    CREATE INDEX idx_benchmark_documents_date
      ON source_documents (ledger_id, effective_date, id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_benchmark_entries_projection
      ON ledger_entries (ledger_id, source_document_id, source_document_revision_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX idx_benchmark_entries_category
      ON ledger_entries (ledger_id, category_id) WHERE deleted_at IS NULL;
    ANALYZE source_documents;
    ANALYZE ledger_entries;
    ANALYZE entry_categories;
  `);

  const queries = [
    await measure(client, "enhanced-stats", enhancedStatsSql),
    await measure(client, "ledger-summary", ledgerSummarySql),
  ];
  process.stdout.write(
    `${JSON.stringify(
      {
        fixture: { entries: 100000, documents: 10000, categories: 100 },
        warmupRuns: WARMUP_RUNS,
        measuredRuns: MEASURED_RUNS,
        queries,
        materializationThresholdMs: 500,
        materializationRequired: queries.some((query) => query.p95Ms > 500),
      },
      null,
      2
    )}\n`
  );
} finally {
  await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
  client.release();
  await pool.end();
}

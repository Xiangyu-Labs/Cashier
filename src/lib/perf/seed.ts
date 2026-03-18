import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "@/lib/db/schema";

const DEFAULT_MANIFEST_PATH = "perf/.seed.json";
const DEFAULT_DATABASE_URL = "file:./data/perf.sqlite.db";
const DEFAULT_CHUNK_SIZE = 500;

const DEFAULT_COUNTS = {
  categoryCount: 30,
  sourceDocumentCount: 10_000,
  entryCount: 30_000,
  taskRunCount: 2_000,
  daysBack: 365,
} as const;

const CURRENCIES = ["CNY", "USD", "EUR"] as const;
const CATEGORY_NAMES = [
  "餐饮",
  "交通",
  "购物",
  "住房",
  "医疗",
  "教育",
  "娱乐",
  "数码",
  "旅行",
  "订阅",
] as const;

const DOCUMENT_STATUSES = [
  "completed",
  "completed",
  "completed",
  "completed",
  "completed",
  "completed",
  "completed",
  "anomaly",
  "failed",
  "queued",
  "processing",
] as const;
const TASK_STATUSES = [
  "completed",
  "completed",
  "completed",
  "pending",
  "pending",
  "failed",
  "running",
] as const;

export interface PerfSeedConfig {
  databaseUrl: string;
  manifestPath: string;
  categoryCount: number;
  sourceDocumentCount: number;
  entryCount: number;
  taskRunCount: number;
  daysBack: number;
  chunkSize: number;
}

export interface PerfSeedManifest {
  generatedAt: string;
  databaseUrl: string;
  sqlitePath: string;
  ledgerId: string;
  apiKey: string;
  categoryCount: number;
  sourceDocumentCount: number;
  entryCount: number;
  taskRunCount: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

function readPositiveInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw == null || raw === "") return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

export function resolveSqlitePath(databaseUrl: string): string {
  return databaseUrl.replace(/^file:/, "");
}

export function loadPerfSeedConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PerfSeedConfig {
  return {
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    manifestPath: env.PERF_SEED_MANIFEST ?? DEFAULT_MANIFEST_PATH,
    categoryCount: readPositiveInt(env, "PERF_CATEGORY_COUNT", DEFAULT_COUNTS.categoryCount),
    sourceDocumentCount: readPositiveInt(
      env,
      "PERF_SOURCE_DOCUMENT_COUNT",
      DEFAULT_COUNTS.sourceDocumentCount
    ),
    entryCount: readPositiveInt(env, "PERF_ENTRY_COUNT", DEFAULT_COUNTS.entryCount),
    taskRunCount: readPositiveInt(env, "PERF_TASK_RUN_COUNT", DEFAULT_COUNTS.taskRunCount),
    daysBack: readPositiveInt(env, "PERF_DAYS_BACK", DEFAULT_COUNTS.daysBack),
    chunkSize: readPositiveInt(env, "PERF_INSERT_CHUNK_SIZE", DEFAULT_CHUNK_SIZE),
  };
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createEntryDate(index: number, daysBack: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (index % daysBack));
  return formatDateUtc(date);
}

function createTimestamp(index: number): Date {
  return new Date(Date.now() - index * 60_000);
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function resetSqliteFile(sqlitePath: string): Promise<void> {
  await ensureParentDir(sqlitePath);
  await rm(sqlitePath, { force: true });
  await rm(`${sqlitePath}-wal`, { force: true });
  await rm(`${sqlitePath}-shm`, { force: true });
}

async function insertChunked(
  db: ReturnType<typeof drizzle<typeof schema>>,
  table: Parameters<typeof db.insert>[0],
  rows: unknown[],
  chunkSize: number
): Promise<void> {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;
    await db.insert(table).values(chunk as never);
  }
}

export async function seedPerfDatabase(config: PerfSeedConfig): Promise<PerfSeedManifest> {
  const sqlitePath = resolveSqlitePath(config.databaseUrl);
  const manifestPath = path.resolve(config.manifestPath);

  await resetSqliteFile(sqlitePath);
  await ensureParentDir(manifestPath);

  const client = new Database(sqlitePath);
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  client.pragma("synchronous = NORMAL");
  client.pragma("busy_timeout = 5000");

  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "src/lib/db/migrations" });

    const userId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const apiKey = `sk_perf_${crypto.randomBytes(18).toString("hex")}`;
    const startDate = createEntryDate(config.daysBack - 1, config.daysBack);
    const endDate = createEntryDate(0, config.daysBack);

    await db.insert(schema.users).values({
      id: userId,
      email: `perf-${Date.now()}@example.com`,
      name: "Performance Test User",
      emailVerified: new Date(),
      defaultLedgerId: ledgerId,
    });

    await db.insert(schema.ledgers).values({
      id: ledgerId,
      userId,
      metadata: {
        settings: {
          mainCurrency: "CNY",
          currencies: [...CURRENCIES],
          aiLanguage: "zh-CN",
        },
      },
    });

    await db.insert(schema.serviceCredentials).values({
      ledgerId,
      name: "Performance Test Key",
      key: apiKey,
    });

    const categories = Array.from({ length: config.categoryCount }, (_, index) => ({
      id: crypto.randomUUID(),
      ledgerId,
      name: `${CATEGORY_NAMES[index % CATEGORY_NAMES.length]}-${String(index + 1).padStart(2, "0")}`,
      description: `Performance seed category ${index + 1}`,
      icon: "tag",
      sortOrder: index,
      createdAt: createTimestamp(index),
      updatedAt: createTimestamp(index),
    }));
    await insertChunked(db, schema.entryCategories, categories, config.chunkSize);

    const sourceDocuments = Array.from({ length: config.sourceDocumentCount }, (_, index) => {
      const status = DOCUMENT_STATUSES[index % DOCUMENT_STATUSES.length];
      const entryDate = createEntryDate(index, config.daysBack);
      return {
        id: crypto.randomUUID(),
        ledgerId,
        title: `Seeded document ${index + 1}`,
        text: `Performance seed document ${index + 1} amount ${(index % 200) + 1}`,
        imageUrls: [],
        status,
        type: "ai_parsed" as const,
        anomalyReason:
          status === "anomaly"
            ? "Seeded anomaly document"
            : status === "failed"
              ? "Seeded failed document"
              : null,
        entryDate,
        createdAt: createTimestamp(index),
        updatedAt: createTimestamp(index),
      };
    });
    await insertChunked(db, schema.sourceDocuments, sourceDocuments, config.chunkSize);

    const completedDocIds = sourceDocuments
      .filter((document) => document.status === "completed")
      .map((document) => document.id);

    const ledgerEntries = Array.from({ length: config.entryCount }, (_, index) => {
      const amount = ((index % 500) + 1) * 3.17;
      const currency = CURRENCIES[index % CURRENCIES.length];
      const convertedAmount =
        currency === "CNY" ? amount : currency === "USD" ? amount * 7.1 : amount * 7.7;

      return {
        id: crypto.randomUUID(),
        ledgerId,
        sourceDocumentId: completedDocIds[index % completedDocIds.length],
        categoryId: categories[index % categories.length].id,
        amount: amount.toFixed(2),
        currency,
        itemName: `Seeded item ${index + 1}`,
        description: `Performance seed entry ${index + 1}`,
        convertedAmount: convertedAmount.toFixed(2),
        exchangeRate: currency === "CNY" ? "1.00" : currency === "USD" ? "7.10" : "7.70",
        createdAt: createTimestamp(index),
        updatedAt: createTimestamp(index),
      };
    });
    await insertChunked(db, schema.ledgerEntries, ledgerEntries, config.chunkSize);

    const taskRuns = Array.from({ length: config.taskRunCount }, (_, index) => {
      const status = TASK_STATUSES[index % TASK_STATUSES.length];
      const sourceDocumentId = sourceDocuments[index % sourceDocuments.length].id;
      const createdAt = createTimestamp(index);
      const isCompleted = status === "completed";

      return {
        id: crypto.randomUUID(),
        type: "parse_source_document",
        title: `Seeded task ${index + 1}`,
        status,
        input: {
          sourceDocumentId,
        },
        scopeId: ledgerId,
        entityType: "source_document",
        entityId: sourceDocumentId,
        error: status === "failed" ? "Seeded task failure" : null,
        progress:
          status === "running"
            ? "Seeded task is running"
            : status === "pending"
              ? "Seeded task is waiting"
              : null,
        tokenUsage: isCompleted
          ? {
              total: {
                input: 500 + (index % 200),
                output: 150 + (index % 50),
              },
            }
          : null,
        createdAt,
        updatedAt: createdAt,
        startedAt: status === "pending" ? null : new Date(createdAt.getTime() + 5_000),
        completedAt: isCompleted ? new Date(createdAt.getTime() + 30_000) : null,
      };
    });
    await insertChunked(db, schema.taskRuns, taskRuns, config.chunkSize);

    const manifest: PerfSeedManifest = {
      generatedAt: new Date().toISOString(),
      databaseUrl: config.databaseUrl,
      sqlitePath,
      ledgerId,
      apiKey,
      categoryCount: categories.length,
      sourceDocumentCount: sourceDocuments.length,
      entryCount: ledgerEntries.length,
      taskRunCount: taskRuns.length,
      dateRange: {
        startDate,
        endDate,
      },
    };

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    return manifest;
  } finally {
    client.close();
  }
}

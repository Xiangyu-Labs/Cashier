import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateDemoEnvironment } from "../../../scripts/demo-data.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("../../../scripts/fixtures/demo-workspace.json", import.meta.url), "utf8")
);

const safeEnvironment = {
  NODE_ENV: "development",
  CASHIER_DEMO_MODE: "true",
  DATABASE_URL: "postgresql://cashier:cashier@127.0.0.1:55433/cashier_demo",
  S3_ENDPOINT: "http://127.0.0.1:59000",
} satisfies NodeJS.ProcessEnv;

afterEach(() => vi.restoreAllMocks());

describe("demo data environment guard", () => {
  it("accepts only the dedicated loopback resources", () => {
    expect(validateDemoEnvironment(safeEnvironment)).toEqual({
      databaseUrl: safeEnvironment.DATABASE_URL,
      storageUrl: `${safeEnvironment.S3_ENDPOINT}/`,
    });
  });

  it.each([
    [{ ...safeEnvironment, CASHIER_DEMO_MODE: "false" }, /CASHIER_DEMO_MODE/],
    [{ ...safeEnvironment, DATABASE_URL: "postgresql://db.example.com/cashier_demo" }, /loopback/],
    [
      { ...safeEnvironment, DATABASE_URL: "postgresql://cashier@127.0.0.1/cashier" },
      /cashier_demo/,
    ],
    [{ ...safeEnvironment, S3_ENDPOINT: "https://storage.example.com" }, /loopback/],
  ])("rejects unsafe resources", (environment, message) => {
    expect(() => validateDemoEnvironment(environment)).toThrow(message);
  });
});

describe("demo workspace fixture", () => {
  it("covers representative display and accounting edge cases", () => {
    const documents = fixture.documents as Array<{
      title: string | null;
      status: string;
      entries: Array<{ category: string | null; amount: string; currency: string }>;
    }>;
    const entries = documents.flatMap((document) => document.entries);

    expect(documents).toHaveLength(17);
    expect(entries).toHaveLength(24);
    expect(documents.some((document) => document.title == null)).toBe(true);
    expect(documents.some((document) => document.status === "cancelled")).toBe(true);
    expect(entries.some((entry) => entry.category == null)).toBe(true);
    expect(entries.some((entry) => Number(entry.amount) < 0)).toBe(true);
    expect(entries.some((entry) => Number(entry.amount) >= 100_000)).toBe(true);
    expect(new Set(entries.map((entry) => entry.currency))).toEqual(
      new Set(["CNY", "USD", "MYR", "SGD", "JPY", "KWD"])
    );
  });
});

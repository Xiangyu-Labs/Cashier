import { afterEach, describe, expect, it, vi } from "vitest";
import { validateDemoEnvironment } from "../../../scripts/demo-data.mjs";

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

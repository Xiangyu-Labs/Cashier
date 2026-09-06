import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../../scripts/bootstrap-initial-user.mjs";

const client = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn() }));
const hash = vi.hoisted(() => vi.fn());
vi.mock("pg", () => ({
  default: {
    Client: class {
      constructor() {
        return client;
      }
    },
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://fixture/fixture_test");
  vi.stubEnv("INITIAL_USER_EMAIL", "Fixture@Example.com");
  vi.stubEnv("INITIAL_USER_PASSWORD", "fixture123");
  client.query.mockResolvedValue({ rowCount: 0 });
  hash.mockResolvedValue("hashed-password");
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("initial user bootstrap", () => {
  it("creates a registration-complete account without logging credentials", async () => {
    await main();
    expect(hash).toHaveBeenCalledWith("fixture123", 12);
    const insert = client.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO"));
    expect(insert?.[0]).toContain('"registration_completed_at"');
    expect(insert?.[1]).toEqual([
      expect.any(String),
      "fixture@example.com",
      expect.any(Date),
      "hashed-password",
    ]);
    expect(console.log).toHaveBeenCalledExactlyOnceWith("[bootstrap] Initial user created");
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("skips an existing user before requiring bootstrap credentials", async () => {
    vi.stubEnv("INITIAL_USER_EMAIL", "");
    client.query.mockImplementation(async (sql: string) => ({
      rowCount: sql.startsWith("SELECT 1") ? 1 : 0,
    }));
    await main();
    expect(hash).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
    expect(client.end).toHaveBeenCalledOnce();
  });

  it.each(["INITIAL_USER_EMAIL", "INITIAL_USER_PASSWORD"])(
    "rolls back invalid %s",
    async (field) => {
      vi.stubEnv(field, "invalid");
      await expect(main()).rejects.toThrow(field);
      expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
      expect(client.end).toHaveBeenCalledOnce();
      expect(console.log).not.toHaveBeenCalled();
    }
  );

  it("rolls back an insert failure and releases the client", async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("INSERT INTO")) throw new Error("insert failed");
      return { rowCount: 0 };
    });
    await expect(main()).rejects.toThrow("insert failed");
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.end).toHaveBeenCalledOnce();
  });
});

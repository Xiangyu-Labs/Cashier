import crypto from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_PEPPER = "test-pepper-for-migration-script";
const LEGACY_TOKEN = "sk_live_legacy_key_one_123456789012345678901234567890";

async function loadScript() {
  return import("../../../scripts/migrations/hash-service-credentials.mjs");
}

function createVerifyClient(activeRows: unknown[], plaintextCount: number) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: activeRows })
      .mockResolvedValueOnce({ rows: [{ cnt: String(plaintextCount) }] }),
  };
}

describe("hash-service-credentials migration", () => {
  beforeAll(() => {
    process.env.API_KEY_PEPPER = TEST_PEPPER;
  });

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes the domain-separated credential hash", async () => {
    const { computeHash } = await loadScript();
    const expected = crypto
      .createHmac("sha256", TEST_PEPPER)
      .update("credential:v1:")
      .update(LEGACY_TOKEN)
      .digest("hex");

    expect(computeHash(LEGACY_TOKEN)).toBe(expected);
  });

  it("stores only the display prefix and suffix", async () => {
    const { prefixSuffix } = await loadScript();

    expect(prefixSuffix(LEGACY_TOKEN)).toEqual({ prefix: "sk_live_", suffix: "7890" });
  });

  it("passes final verification for valid hash-only credentials", async () => {
    const { computeHash, verify } = await loadScript();
    const client = createVerifyClient(
      [
        {
          id: "valid",
          key: null,
          token_hash: computeHash(LEGACY_TOKEN),
          token_prefix: "sk_live_",
          token_suffix: "7890",
        },
      ],
      0
    );

    await expect(verify(client)).resolves.toBeUndefined();
  });

  it("allows matching plaintext only during explicit pre-clear verification", async () => {
    const { computeHash, verify } = await loadScript();
    const client = createVerifyClient(
      [
        {
          id: "pre-clear",
          key: LEGACY_TOKEN,
          token_hash: computeHash(LEGACY_TOKEN),
          token_prefix: "sk_live_",
          token_suffix: "7890",
        },
      ],
      1
    );

    await expect(verify(client, { allowPlaintext: true })).resolves.toBeUndefined();
  });

  it("rejects remaining plaintext during final verification", async () => {
    const { computeHash, verify } = await loadScript();
    const client = createVerifyClient(
      [
        {
          id: "not-cleared",
          key: LEGACY_TOKEN,
          token_hash: computeHash(LEGACY_TOKEN),
          token_prefix: "sk_live_",
          token_suffix: "7890",
        },
      ],
      1
    );

    await expect(verify(client)).rejects.toThrow("1 row(s) still have plaintext key");
  });

  it.each([
    {
      name: "missing prefix",
      row: {
        id: "missing-prefix",
        key: null,
        token_hash: "a".repeat(64),
        token_prefix: null,
        token_suffix: "7890",
      },
    },
    {
      name: "hash mismatch",
      row: {
        id: "hash-mismatch",
        key: LEGACY_TOKEN,
        token_hash: "a".repeat(64),
        token_prefix: "sk_live_",
        token_suffix: "7890",
      },
    },
  ])("rejects an active credential with $name", async ({ row }) => {
    const { verify } = await loadScript();
    const client = createVerifyClient([row], row.key == null ? 0 : 1);

    await expect(verify(client, { allowPlaintext: true })).rejects.toThrow(
      "1 active credential(s) invalid"
    );
  });

  it("backfills active rows and clears deleted plaintext in one transaction", async () => {
    const { backfill, computeHash } = await loadScript();
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "legacy", key: LEGACY_TOKEN }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({});

    await backfill({ query });

    expect(query.mock.calls[1]?.[0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[2]?.[0]).toContain("FOR UPDATE");
    expect(query.mock.calls[3]?.[1]).toEqual([
      computeHash(LEGACY_TOKEN),
      "sk_live_",
      "7890",
      "legacy",
    ]);
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("rolls back backfill when a credential update fails", async () => {
    const { backfill } = await loadScript();
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "legacy", key: LEGACY_TOKEN }] })
      .mockRejectedValueOnce(new Error("update failed"))
      .mockResolvedValueOnce({});

    await expect(backfill({ query })).rejects.toThrow("update failed");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("clears validated active and deleted plaintext in one transaction", async () => {
    const { clearPlaintext, computeHash } = await loadScript();
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: "legacy",
            key: LEGACY_TOKEN,
            token_hash: computeHash(LEGACY_TOKEN),
            token_prefix: "sk_live_",
            token_suffix: "7890",
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});

    await clearPlaintext({ query });

    expect(query.mock.calls[1]?.[0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[2]?.[0]).toContain("FOR UPDATE");
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("refuses clear and rolls back when an active hash is missing", async () => {
    const { clearPlaintext } = await loadScript();
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: "unmigrated",
            key: LEGACY_TOKEN,
            token_hash: null,
            token_prefix: null,
            token_suffix: null,
          },
        ],
      })
      .mockResolvedValueOnce({});

    await expect(clearPlaintext({ query })).rejects.toThrow("has no token_hash");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("refuses clear and rolls back when the stored hash mismatches", async () => {
    const { clearPlaintext } = await loadScript();
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: "mismatch",
            key: LEGACY_TOKEN,
            token_hash: "a".repeat(64),
            token_prefix: "sk_live_",
            token_suffix: "7890",
          },
        ],
      })
      .mockResolvedValueOnce({});

    await expect(clearPlaintext({ query })).rejects.toThrow("hash mismatch");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("retries transient connection failures with a bounded attempt count", async () => {
    const { runWithTransientConnectionRetries } = await loadScript();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .mockResolvedValue("ok");

    await expect(runWithTransientConnectionRetries(operation, 2)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry validation or SQL errors", async () => {
    const { runWithTransientConnectionRetries } = await loadScript();
    const operation = vi.fn().mockRejectedValue(new Error("hash mismatch"));

    await expect(runWithTransientConnectionRetries(operation, 5)).rejects.toThrow("hash mismatch");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

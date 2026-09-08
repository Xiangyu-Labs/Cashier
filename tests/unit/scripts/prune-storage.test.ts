import { describe, expect, it, vi } from "vitest";
import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  pruneExpiredRecords,
  scanTemporaryOrphans,
  scanUnreferencedFiles,
} from "../../../scripts/prune-storage.mjs";

function counts() {
  return {
    count: 0,
    bytes: 0,
    deleted: 0,
    deletedBytes: 0,
    failed: 0,
    missing: 0,
    missingBytes: 0,
  };
}
function summary() {
  return {
    unreferencedFiles: counts(),
    temporaryOrphans: counts(),
    missingObjects: counts(),
    errors: [] as string[],
  };
}

describe("storage prune", () => {
  it("uses a fixed-size keyset cursor and never deletes in dry-run", async () => {
    const pages = [
      [
        {
          id: "00000000-0000-0000-0000-000000000001",
          storage_key: "fixture/stored/one",
          byte_size: 3,
        },
      ],
      [
        {
          id: "00000000-0000-0000-0000-000000000002",
          storage_key: "fixture/stored/two",
          byte_size: 4,
        },
      ],
      [],
    ];
    const client = { query: vi.fn(async () => ({ rows: pages.shift()! })) };
    const s3 = {
      send: vi.fn(async (command: unknown) => {
        expect(command).toBeInstanceOf(HeadObjectCommand);
        return { ContentLength: 4 };
      }),
    };
    const result = summary();
    const cutoff = new Date("2020-01-01");
    await scanUnreferencedFiles(client, s3, "fixture", cutoff, 1, false, result);
    expect(client.query.mock.calls).toHaveLength(3);
    const calls = client.query.mock.calls as unknown as Array<[string, unknown[]]>;
    expect(calls.map(([, params]) => params)).toEqual([
      [cutoff, 1, null],
      [cutoff, 1, "00000000-0000-0000-0000-000000000001"],
      [cutoff, 1, "00000000-0000-0000-0000-000000000002"],
    ]);
    expect(calls.every(([sql]) => sql.includes("ORDER BY id") && !sql.includes("DELETE"))).toBe(
      true
    );
    expect(result.unreferencedFiles).toMatchObject({ count: 2, bytes: 7, deleted: 0 });
  });

  it.each([false, true])(
    "looks up live temporary sessions with the DB client (apply=%s)",
    async (apply) => {
      const now = new Date("2020-02-01");
      const client = {
        query: vi.fn(async () => ({ rows: [{ id: "live", status: "finalizing" }] })),
      };
      const s3 = {
        send: vi.fn(async (command: unknown) => {
          if (command instanceof ListObjectsV2Command)
            return {
              Contents: ["live", "orphan"].map((id) => ({
                Key: `temporary/ledger/${id}/target`,
                Size: 3,
                LastModified: new Date("2020-01-01"),
              })),
            };
          expect(command).toBeInstanceOf(DeleteObjectCommand);
          return {};
        }),
      };
      const result = summary();
      await scanTemporaryOrphans(client, s3, "fixture", now, now, 10, apply, result);
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining("upload_sessions"), [
        ["live", "orphan"],
      ]);
      expect(result.temporaryOrphans).toMatchObject({ count: 1, deleted: apply ? 1 : 0 });
      expect(s3.send).toHaveBeenCalledTimes(apply ? 2 : 1);
    }
  );

  it("uses the current composite idempotency principal when applying record cleanup", async () => {
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    await pruneExpiredRecords(client, new Date("2020-02-01"), 10, true);
    const calls = client.query.mock.calls as unknown as Array<[string]>;
    const sql = calls.find(([sql]) => sql.includes("idempotency_records"))?.[0];
    expect(sql).toContain("(principal_type, principal_id, key)");
    expect(sql).not.toContain("credential_id");
  });
});

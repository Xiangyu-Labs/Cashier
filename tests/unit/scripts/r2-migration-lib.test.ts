import { describe, expect, it } from "vitest";
import {
  assertSafeObjectKey,
  parseMode,
  requireMaintenanceConfirmation,
  sha256,
  verifyFileContents,
  verifyLocalContents,
} from "../../../scripts/r2-migration-lib.mjs";

describe("R2 migration validation", () => {
  it("accepts only relative canonical object keys", () => {
    expect(assertSafeObjectKey("ledger/stored/file")).toBe("ledger/stored/file");
    for (const key of ["/absolute", "../escape", "a/../b", "a\\b", "a//b", "a/./b"]) {
      expect(() => assertSafeObjectKey(key)).toThrow("Unsafe storage key");
    }
  });

  it("compares database size/checksum and both copies", () => {
    const bytes = Buffer.from("receipt");
    const matching = verifyFileContents(
      { byte_size: bytes.length, checksum: sha256(bytes) },
      bytes,
      Buffer.from(bytes)
    );
    expect(matching.failures).toEqual([]);

    const corrupt = verifyFileContents(
      { byte_size: bytes.length, checksum: sha256(bytes) },
      bytes,
      Buffer.from("corrupt")
    );
    expect(corrupt.failures).toContain("R2 checksum differs from database");
    expect(corrupt.failures).toContain("local and R2 content differ");
  });

  it("validates a local source before any R2 upload", () => {
    const bytes = Buffer.from("receipt");
    expect(
      verifyLocalContents({ byte_size: bytes.length, checksum: sha256(bytes) }, bytes).failures
    ).toEqual([]);
    expect(
      verifyLocalContents({ byte_size: bytes.length + 1, checksum: sha256(bytes) }, bytes).failures
    ).toContain("local size differs from database");
  });

  it("defaults to dry-run and requires explicit maintenance confirmation for writes", () => {
    expect(parseMode([])).toBe("dry-run");
    expect(parseMode(["--apply"])).toBe("apply");
    expect(parseMode(["--upload"])).toBe("upload");
    expect(() => parseMode(["--apply", "--rollback"])).toThrow("Choose only one");
    expect(() => requireMaintenanceConfirmation("apply", ["--apply"])).toThrow(
      "--maintenance-window-confirmed"
    );
    expect(() =>
      requireMaintenanceConfirmation("apply", ["--apply", "--maintenance-window-confirmed"])
    ).not.toThrow();
  });
});

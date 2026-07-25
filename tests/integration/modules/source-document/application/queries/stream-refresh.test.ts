import { describe, expect, it, vi } from "vitest";
import type { StreamRefreshRequest } from "@/modules/source-document/contract-refresh";
import {
  STREAM_REFRESH_PROTOCOL_VERSION,
} from "@/modules/source-document/contract-refresh";

// ---------------------------------------------------------------------------
// These integration tests validate the bounded refresh contract.
// They use in-memory SQLite via the test DB setup (same as other integration
// tests in this directory).
// ---------------------------------------------------------------------------

// Note: Full integration tests require test DB setup (migrations, seed data).
// These tests validate the core contract logic that doesn't depend on DB state,
// and use mocks for the DB-dependent layers.
// For a full DB-backed integration test, extend this file with actual
// seed data and test queries against the in-memory SQLite database.

import { getStreamRefresh } from "@/modules/source-document/application/queries/get-stream-refresh";
import { encodeFilterSignature } from "@/modules/source-document/application/queries/get-stream-refresh";

// ---------------------------------------------------------------------------
// Mock the data layer for contract-level tests
// ---------------------------------------------------------------------------

vi.mock("@/application/current", () => ({
  currentApplication: {
    sourceDocumentReads: {
      list: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
      counts: vi.fn().mockResolvedValue({
        processingCount: 0,
        attentionCount: 0,
      }),
      get: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

// Re-import with mocks applied
import { currentApplication } from "@/application/current";

describe("getStreamRefresh", () => {
  // -----------------------------------------------------------------------
  // Basic request/response flow
  // -----------------------------------------------------------------------

  it("returns a non-changed result for empty refresh request", async () => {
    const request: StreamRefreshRequest = {
      ledgerId: "ledger-1",
      protocolVersion: STREAM_REFRESH_PROTOCOL_VERSION,
      signatures: [],
      watchedIds: [],
      countFingerprint: null,
    };

    const result = await getStreamRefresh(request);

    expect(result.protocolVersion).toBe(STREAM_REFRESH_PROTOCOL_VERSION);
    expect(result.generation).toBe(1);
    expect(result.firstPages).toEqual([]);
    expect(result.changedWatched).toEqual([]);
    expect(result.counts).not.toBeNull(); // countFingerprint was null, so always include
  });

  it("omits counts when countFingerprint matches", async () => {
    // Must mock counts to return a known value
    const mockCounts = vi.mocked(currentApplication.sourceDocumentReads.counts);
    mockCounts.mockResolvedValue({ processingCount: 5, attentionCount: 3 });

    const request: StreamRefreshRequest = {
      ledgerId: "ledger-1",
      protocolVersion: STREAM_REFRESH_PROTOCOL_VERSION,
      signatures: [],
      watchedIds: [],
      countFingerprint: null, // Wait, we need to compute this
    };

    const firstResult = await getStreamRefresh(request);
    expect(firstResult.counts).not.toBeNull();

    // Now use the fingerprint from the first result
    const countFingerprint = firstResult.counts!.fingerprint;

    const secondRequest: StreamRefreshRequest = {
      ledgerId: "ledger-1",
      protocolVersion: STREAM_REFRESH_PROTOCOL_VERSION,
      signatures: [],
      watchedIds: [],
      countFingerprint,
    };

    // Mock counts to return the same values
    mockCounts.mockResolvedValue({ processingCount: 5, attentionCount: 3 });

    const secondResult = await getStreamRefresh(secondRequest);
    expect(secondResult.counts).toBeNull(); // Unchanged
  });

  // -----------------------------------------------------------------------
  // Authorization — validation
  // -----------------------------------------------------------------------

  it("handles requests with no signatures gracefully", async () => {
    const request: StreamRefreshRequest = {
      ledgerId: "ledger-1",
      protocolVersion: STREAM_REFRESH_PROTOCOL_VERSION,
      signatures: [],
      watchedIds: [],
      countFingerprint: "some-fingerprint",
    };

    const result = await getStreamRefresh(request);
    expect(result.firstPages).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Filter signature encoding/decoding
  // -----------------------------------------------------------------------

  it("encodes filter signatures correctly", () => {
    const sig = encodeFilterSignature({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      minAmount: 10,
      maxAmount: 100,
      statuses: ["completed", "failed"],
    });

    // Should start with date params followed by sorted statuses
    expect(sig).toContain("2026-07-01");
    expect(sig).toContain("2026-07-31");
    expect(sig).toContain("completed");
    expect(sig).toContain("failed");
  });

  it("handles empty filter signature parts", () => {
    const sig = encodeFilterSignature({});
    // All parts should be empty strings joined by |
    const parts = sig.split("|");
    expect(parts.length).toBeGreaterThanOrEqual(4);
  });

  // -----------------------------------------------------------------------
  // Count fingerprint computation
  // -----------------------------------------------------------------------

  it("returns counts when countFingerprint is null (first fetch)", async () => {
    const mockCounts = vi.mocked(currentApplication.sourceDocumentReads.counts);
    mockCounts.mockResolvedValue({ processingCount: 3, attentionCount: 7 });

    const request: StreamRefreshRequest = {
      ledgerId: "ledger-1",
      protocolVersion: STREAM_REFRESH_PROTOCOL_VERSION,
      signatures: [],
      watchedIds: [],
      countFingerprint: null,
    };

    const result = await getStreamRefresh(request);
    expect(result.counts).not.toBeNull();
    expect(result.counts!.processingCount).toBe(3);
    expect(result.counts!.attentionCount).toBe(7);
    expect(result.counts!.fingerprint).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Protocol/generation
  // -----------------------------------------------------------------------

  it("reports canonical protocol version and generation", async () => {
    const request: StreamRefreshRequest = {
      ledgerId: "ledger-1",
      protocolVersion: STREAM_REFRESH_PROTOCOL_VERSION,
      signatures: [],
      watchedIds: [],
      countFingerprint: null,
    };

    const result = await getStreamRefresh(request);
    expect(result.protocolVersion).toBe(STREAM_REFRESH_PROTOCOL_VERSION);
    expect(result.generation).toBe(1);
  });
});

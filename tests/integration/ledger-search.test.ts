import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../setup";
import { ledgers, ledgerEntries, sourceDocuments } from "@/persistence";
import {
  createLedgerData,
  createLedgerEntryData,
  createSourceDocumentData,
} from "../helpers/factories";
import { listLedgerEntries } from "@/modules/ledger/application/queries/list-ledger-entries";
import { getSourceDocumentCollection } from "@/modules/source-document/application/queries/list-source-document-collection";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("ledger search", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";
  let ledgerId: string;

  beforeEach(async () => {
    vi.mocked(auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: testUserId, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const db = getTestDb();

    // Create ledger
    const ledgerData = createLedgerData({ userId: testUserId });
    await db.insert(ledgers).values(ledgerData);
    ledgerId = ledgerData.id;

    // Create source doc A: title contains "Starbucks"
    const sourceDocA = createSourceDocumentData(ledgerId, { title: "Starbucks receipt" });
    await db.insert(sourceDocuments).values(sourceDocA);

    // Create entry A linked to source doc A: itemName contains "Latte"
    const entryA = createLedgerEntryData(ledgerId, {
      sourceDocumentId: sourceDocA.id,
      itemName: "Latte",
      description: null,
    });
    await db.insert(ledgerEntries).values(entryA);

    // Create source doc B: title contains "Grocery"
    const sourceDocB = createSourceDocumentData(ledgerId, { title: "Grocery store" });
    await db.insert(sourceDocuments).values(sourceDocB);

    // Create entry B linked to source doc B: itemName contains "Milk"
    const entryB = createLedgerEntryData(ledgerId, {
      sourceDocumentId: sourceDocB.id,
      itemName: "Milk",
      description: "Organic whole milk",
    });
    await db.insert(ledgerEntries).values(entryB);

    // Create manual entry (no source doc): itemName contains "Coffee"
    const entryC = createLedgerEntryData(ledgerId, {
      sourceDocumentId: null,
      itemName: "Coffee beans",
      description: "Ethiopian single origin",
    });
    await db.insert(ledgerEntries).values(entryC);
  });

  it("details tab: finds entries by itemName", async () => {
    const result = await listLedgerEntries(ledgerId, { search: "Latte" });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.some((e) => e.itemName === "Latte")).toBe(true);
  });

  it("details tab: finds entries by description", async () => {
    const result = await listLedgerEntries(ledgerId, { search: "Organic" });
    expect(result.items.some((e) => e.itemName === "Milk")).toBe(true);
  });

  it("details tab: cross-table finds entries via source doc title", async () => {
    const result = await listLedgerEntries(ledgerId, { search: "Starbucks" });
    expect(result.items.some((e) => e.itemName === "Latte")).toBe(true);
  });

  it("stream tab: finds source docs by title", async () => {
    const result = await getSourceDocumentCollection(ledgerId, { search: "Grocery", limit: 100 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.some((d) => d.title === "Grocery store")).toBe(true);
  });

  it("stream tab: cross-table finds source docs via entry itemName", async () => {
    const result = await getSourceDocumentCollection(ledgerId, { search: "Latte", limit: 100 });
    expect(result.items.some((d) => d.title === "Starbucks receipt")).toBe(true);
  });

  it("ignores empty search", async () => {
    const all = await listLedgerEntries(ledgerId, {});
    const empty = await listLedgerEntries(ledgerId, { search: "" });
    expect(empty.items.length).toBe(all.items.length);
  });
});

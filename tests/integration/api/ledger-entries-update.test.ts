import { describe, expect, it } from "vitest";
import { updateLedgerEntryAction } from "@/modules/ledger/actions";

describe("ledger entry update transport validation", () => {
  it("rejects a malformed version target before mutation", async () => {
    await expect(
      updateLedgerEntryAction(
        crypto.randomUUID(),
        { sourceDocumentId: "not-a-uuid", expectedVersion: 0 },
        crypto.randomUUID(),
        { itemName: "Updated" }
      )
    ).rejects.toThrow();
  });
});

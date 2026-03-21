import { describe, expect, it } from "vitest";
import { withLedgerAccess } from "@/modules/ledger/access";

describe("ledger access public api", () => {
  it("exposes access helpers from the dedicated access entrypoint", () => {
    expect(typeof withLedgerAccess).toBe("function");
  });
});

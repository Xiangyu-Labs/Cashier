import { describe, expect, it } from "vitest";
import {
  requireLedgerAccess as requireLedgerAccessFromActions,
  withLedgerAccess as withLedgerAccessFromActions,
} from "@/modules/ledger/actions";
import {
  requireLedgerAccess as requireLedgerAccessFromAccessModule,
  withLedgerAccess as withLedgerAccessFromAccessModule,
} from "@/modules/ledger/access";

describe("ledger actions public api", () => {
  it("re-exports ledger access helpers", () => {
    expect(requireLedgerAccessFromActions).toBe(requireLedgerAccessFromAccessModule);
    expect(withLedgerAccessFromActions).toBe(withLedgerAccessFromAccessModule);
  });
});

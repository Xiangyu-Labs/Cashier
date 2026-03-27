import { describe, expect, it } from "vitest";
import zhMessages from "../../../messages/zh.json";
import enMessages from "../../../messages/en.json";

describe("workspace selection translations", () => {
  it("provides the selection toolbar labels needed by the stream and details tabs", () => {
    expect(zhMessages.DetailsTab.selectAll).toBeTruthy();
    expect(enMessages.DetailsTab.selectAll).toBeTruthy();
    expect(zhMessages.DetailsTab.deselectAll).toBeTruthy();
    expect(enMessages.DetailsTab.deselectAll).toBeTruthy();

    expect(zhMessages.LedgerEntriesTab.select).toBeTruthy();
    expect(enMessages.LedgerEntriesTab.select).toBeTruthy();
    expect(zhMessages.LedgerEntriesTab.cancelSelect).toBeTruthy();
    expect(enMessages.LedgerEntriesTab.cancelSelect).toBeTruthy();
    expect(zhMessages.LedgerEntriesTab.selectAll).toBeTruthy();
    expect(enMessages.LedgerEntriesTab.selectAll).toBeTruthy();
    expect(zhMessages.LedgerEntriesTab.deselectAll).toBeTruthy();
    expect(enMessages.LedgerEntriesTab.deselectAll).toBeTruthy();
  });
});

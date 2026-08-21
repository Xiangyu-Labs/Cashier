import { describe, expect, it } from "vitest";
import { reconcileParseOutput } from "@/modules/source-document/application/parse-source-document/reconciliation";
import type {
  NormalizedLedgerEntry,
  NormalizedOrderAdjustment,
  NormalizedParseOutput,
  NormalizedReceiptTotal,
} from "@/modules/source-document/application/parse-source-document/parser-schema";

function entry(overrides: Partial<NormalizedLedgerEntry> = {}): NormalizedLedgerEntry {
  return {
    receipt_index: overrides.receipt_index ?? 0,
    item_name: overrides.item_name ?? "Item",
    amount: overrides.amount ?? "10",
    currency: overrides.currency ?? "CNY",
    category_index: overrides.category_index ?? 1,
    notes: overrides.notes ?? null,
  };
}

function adjustment(overrides: Partial<NormalizedOrderAdjustment> = {}): NormalizedOrderAdjustment {
  return {
    receipt_index: overrides.receipt_index ?? 0,
    item_name: overrides.item_name ?? "Adjustment",
    amount: overrides.amount ?? "-5",
    currency: overrides.currency ?? "CNY",
  };
}

function receiptTotal(overrides: Partial<NormalizedReceiptTotal> = {}): NormalizedReceiptTotal {
  return {
    receipt_index: overrides.receipt_index ?? 0,
    amount: overrides.amount ?? "10",
    currency: overrides.currency ?? "CNY",
  };
}

function successResult(overrides: Partial<NormalizedParseOutput> = {}): NormalizedParseOutput {
  return {
    outcome: "success",
    title: overrides.title ?? "Receipt",
    receipt_count: overrides.receipt_count ?? 1,
    receipt_totals: overrides.receipt_totals ?? [receiptTotal()],
    ledger_entries: overrides.ledger_entries ?? [entry()],
    order_adjustments: overrides.order_adjustments ?? [],
    reasoning: overrides.reasoning ?? "test",
  };
}

describe("reconcileParseOutput", () => {
  it("leaves a balanced receipt unchanged", () => {
    const result = reconcileParseOutput({
      aiLanguage: "zh-CN",
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "30" })],
        ledger_entries: [
          entry({ item_name: "A", amount: "10", category_index: 1 }),
          entry({ item_name: "B", amount: "20", category_index: 1 }),
        ],
        order_adjustments: [],
      }),
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.result.ledger_entries).toHaveLength(2);
      expect(result.result.order_adjustments).toEqual([]);
    }
  });

  it("adds one synthetic ledger entry when explicit items plus adjustments are below the receipt total", () => {
    const result = reconcileParseOutput({
      aiLanguage: "zh-CN",
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "50" })],
        ledger_entries: [entry({ item_name: "Visible Item", amount: "49", category_index: 2 })],
        order_adjustments: [],
      }),
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.result.ledger_entries).toEqual([
        expect.objectContaining({ item_name: "Visible Item", amount: "49", category_index: 2 }),
        expect.objectContaining({ amount: "1.00", category_index: 0 }),
      ]);
      expect(result.result.order_adjustments).toEqual([]);
    }
  });

  it("adds one synthetic order adjustment when extracted values exceed the receipt total", () => {
    const result = reconcileParseOutput({
      aiLanguage: "en-US",
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "50", currency: "USD" })],
        ledger_entries: [
          entry({ item_name: "Meal", amount: "51", currency: "USD", category_index: 1 }),
        ],
        order_adjustments: [],
      }),
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.result.order_adjustments).toEqual([
        expect.objectContaining({ receipt_index: 0, amount: "-1.00", currency: "USD" }),
      ]);
    }
  });

  it("uses native Japanese copy for synthetic reconciliation entries", () => {
    const result = reconcileParseOutput({
      aiLanguage: "ja-JP",
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "50", currency: "JPY" })],
        ledger_entries: [
          entry({ item_name: "コーヒー", amount: "49", currency: "JPY", category_index: 1 }),
        ],
        order_adjustments: [],
      }),
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.result.ledger_entries[1]).toMatchObject({
        item_name: "その他の商品",
        notes: "レシート合計との差額を調整するために自動作成されました。",
      });
    }
  });

  it("keeps synthetic entries uncategorized", () => {
    const result = reconcileParseOutput({
      aiLanguage: "zh-CN",
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "61" })],
        ledger_entries: [
          entry({ item_name: "Food 1", amount: "40", category_index: 3 }),
          entry({ item_name: "Shop 1", amount: "20", category_index: 2 }),
        ],
        order_adjustments: [],
      }),
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.result.ledger_entries[2]).toMatchObject({ amount: "1.00", category_index: 0 });
    }
  });

  it("returns anomaly when a successful parse has no usable receipt total for a receipt", () => {
    const result = reconcileParseOutput({
      aiLanguage: "en-US",
      result: successResult({
        receipt_totals: [],
        ledger_entries: [entry({ item_name: "A", amount: "10", category_index: 1 })],
        order_adjustments: [],
      }),
    });

    expect(result).toEqual({
      kind: "anomaly",
      reason: expect.stringContaining("receipt total"),
    });
  });

  it("returns anomaly when the same receipt_index has conflicting receipt totals", () => {
    const result = reconcileParseOutput({
      aiLanguage: "en-US",
      result: successResult({
        receipt_totals: [
          receiptTotal({ receipt_index: 0, amount: "10", currency: "USD" }),
          receiptTotal({ receipt_index: 0, amount: "12", currency: "USD" }),
        ],
        ledger_entries: [
          entry({ item_name: "A", amount: "10", currency: "USD", category_index: 1 }),
        ],
        order_adjustments: [],
      }),
    });

    expect(result).toEqual({
      kind: "anomaly",
      reason: expect.stringContaining("conflicting receipt totals"),
    });
  });

  it("keeps explicit adjustments and only reconciles the remaining difference", () => {
    const result = reconcileParseOutput({
      aiLanguage: "en-US",
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "104", currency: "USD" })],
        ledger_entries: [
          entry({ item_name: "Item", amount: "100", currency: "USD", category_index: 4 }),
        ],
        order_adjustments: [adjustment({ item_name: "Shipping", amount: "3", currency: "USD" })],
      }),
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.result.order_adjustments).toEqual([
        expect.objectContaining({ item_name: "Shipping", amount: "3", currency: "USD" }),
      ]);
      expect(result.result.ledger_entries[1]).toMatchObject({ amount: "1.00", category_index: 0 });
    }
  });

  it("returns amount_conflict when either reconciliation threshold is exceeded", () => {
    const absoluteConflict = reconcileParseOutput({
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "102" })],
        ledger_entries: [entry({ amount: "100" })],
      }),
    });
    const relativeConflict = reconcileParseOutput({
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "10" })],
        ledger_entries: [entry({ amount: "9.50" })],
      }),
    });

    expect(absoluteConflict).toEqual({
      kind: "anomaly",
      reason: expect.stringContaining("amount_conflict"),
    });
    expect(relativeConflict).toEqual({
      kind: "anomaly",
      reason: expect.stringContaining("amount_conflict"),
    });
  });

  it("only accepts an exact match when the receipt total is zero", () => {
    const result = reconcileParseOutput({
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "0" })],
        ledger_entries: [entry({ amount: "0.50" })],
      }),
    });

    expect(result).toEqual({
      kind: "anomaly",
      reason: expect.stringContaining("amount_conflict"),
    });
  });

  it("returns anomaly instead of summing ledger entries across currencies", () => {
    const result = reconcileParseOutput({
      aiLanguage: "en-US",
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "100", currency: "USD" })],
        ledger_entries: [
          entry({ item_name: "Meal", amount: "80", currency: "USD" }),
          entry({ item_name: "Taxi", amount: "20", currency: "CNY" }),
        ],
      }),
    });

    expect(result).toEqual({
      kind: "anomaly",
      reason: expect.stringContaining("mixed currencies"),
    });
  });

  it("returns anomaly instead of summing adjustments across currencies", () => {
    const result = reconcileParseOutput({
      aiLanguage: "en-US",
      result: successResult({
        receipt_totals: [receiptTotal({ amount: "95", currency: "USD" })],
        ledger_entries: [entry({ amount: "100", currency: "USD" })],
        order_adjustments: [adjustment({ amount: "-5", currency: "EUR" })],
      }),
    });

    expect(result).toEqual({
      kind: "anomaly",
      reason: expect.stringContaining("mixed currencies"),
    });
  });
});

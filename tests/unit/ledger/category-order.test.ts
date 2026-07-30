import { describe, expect, it } from "vitest";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { resolveCategoryOrder } from "@/modules/ledger/hooks/useCategorySectionController";

const category = (id: string) => ({ id }) as EntryCategory;

describe("resolveCategoryOrder", () => {
  it("submits the final drag preview order", () => {
    const original = [category("a"), category("b"), category("c")];
    const preview = [category("b"), category("c"), category("a")];
    expect(resolveCategoryOrder(original, preview, "a", "a")).toEqual(["b", "c", "a"]);
  });

  it("guards invalid drag identifiers", () => {
    expect(resolveCategoryOrder([category("a")], null, "missing", "a")).toBeNull();
  });
});

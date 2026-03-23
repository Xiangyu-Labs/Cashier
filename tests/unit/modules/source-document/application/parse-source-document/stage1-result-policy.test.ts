import { describe, expect, it } from "vitest";
import {
  finalizeStage1Execution,
  haveSameStringMembers,
} from "@/modules/source-document/application/parse-source-document/stage1-result-policy";

describe("stage1-result-policy", () => {
  it("returns an incomplete result without incompleteReason when the issue is blank", () => {
    const result = finalizeStage1Execution({
      validity: { is_valid: true, reasoning: "valid" },
      completeness: { is_complete: false, issue: "" },
      currency: { currencies: ["CNY"], reasoning: "symbol" },
      category: { categories: ["餐饮"], reasoning: "meal" },
      title: { title: "午餐" },
      userRequirements: undefined,
    });

    expect(result).toEqual({
      isValid: true,
      isIncomplete: true,
      title: "午餐",
    });
  });

  it("treats string lists with the same members in different order as equal", () => {
    expect(haveSameStringMembers(["USD", "CNY"], ["CNY", "USD"])).toBe(true);
    expect(haveSameStringMembers(["USD"], ["USD", "CNY"])).toBe(false);
  });
});

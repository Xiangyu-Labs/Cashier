import { describe, expect, it, vi } from "vitest";
import {
  detectDuplicateBill,
  normalizeDuplicateReason,
  type DuplicateCandidateContract,
  type DuplicateDetectionInput,
} from "@/modules/source-document/application/duplicate-detection";

function candidate(
  overrides: Partial<DuplicateCandidateContract> = {}
): DuplicateCandidateContract {
  return {
    sourceDocumentId: "candidate-1",
    title: "Coffee Shop",
    entryDate: "2026-08-05",
    createdAt: "2026-08-05T08:00:00.000Z",
    revisionId: "revision-1",
    entries: [
      {
        itemName: "Latte",
        amount: "38.00",
        currency: "CNY",
        categoryId: "cat-food",
        convertedAmount: "38.00",
      },
    ],
    storedFileIds: ["file-1"],
    ...overrides,
  };
}

function buildInput(overrides: Partial<DuplicateDetectionInput> = {}): DuplicateDetectionInput {
  return {
    ledgerId: "ledger-1",
    mainCurrency: "CNY",
    sourceDocumentId: "current-1",
    currentCreatedAt: "2026-08-05T09:00:00.000Z",
    currentTitle: "Coffee Shop",
    currentEntries: [
      {
        itemName: "Latte",
        amount: "38.00",
        currency: "CNY",
        categoryId: "cat-food",
        convertedAmount: "38.00",
      },
    ],
    currentStoredFileIds: ["file-current"],
    candidates: [candidate()],
    loadImages: async (ids) =>
      [...ids].map((id) => ({ url: id, dataUrl: `data:image/jpeg;base64,${id}` })),
    ai: {
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          duplicate: true,
          matchedSourceDocumentId: "candidate-1",
          confidence: 0.95,
          reason: "Same merchant and total",
        }),
      }),
    },
    ...overrides,
  };
}

describe("detectDuplicateBill", () => {
  it("skips AI entirely when there are no candidates", async () => {
    const input = buildInput({ candidates: [] });
    const result = await detectDuplicateBill(input);
    expect(result.duplicate).toBe(false);
    expect(input.ai.generate).not.toHaveBeenCalled();
  });

  it("skips AI when category/currency signatures differ", async () => {
    const input = buildInput({
      candidates: [
        candidate({
          sourceDocumentId: "other-category",
          entries: [
            {
              itemName: "Burger",
              amount: "50.00",
              currency: "USD",
              categoryId: "cat-food",
              convertedAmount: "350.00",
            },
          ],
        }),
      ],
    });
    const result = await detectDuplicateBill(input);
    expect(result.duplicate).toBe(false);
    expect(input.ai.generate).not.toHaveBeenCalled();
  });

  it("matches on unordered unique signatures and flags a high-confidence duplicate", async () => {
    const input = buildInput({
      currentEntries: [
        {
          itemName: "Latte",
          amount: "20.00",
          currency: "CNY",
          categoryId: "cat-b",
          convertedAmount: "20.00",
        },
        {
          itemName: "Muffin",
          amount: "18.00",
          currency: "CNY",
          categoryId: "cat-a",
          convertedAmount: "18.00",
        },
      ],
      candidates: [
        candidate({
          sourceDocumentId: "candidate-1",
          entries: [
            {
              itemName: "Muffin",
              amount: "18.00",
              currency: "CNY",
              categoryId: "cat-a",
              convertedAmount: "18.00",
            },
            {
              itemName: "Latte",
              amount: "20.00",
              currency: "CNY",
              categoryId: "cat-b",
              convertedAmount: "20.00",
            },
          ],
        }),
      ],
    });
    const result = await detectDuplicateBill(input);
    expect(result).toMatchObject({
      duplicate: true,
      matchedSourceDocumentId: "candidate-1",
      confidence: 0.95,
    });
  });

  it("uses the text shortlist when more than two candidates match", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(["candidate-3", "candidate-1"]),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          duplicate: true,
          matchedSourceDocumentId: "candidate-3",
          confidence: 0.9,
          reason: "same total",
        }),
      });
    const input = buildInput({
      candidates: [
        candidate({ sourceDocumentId: "candidate-1" }),
        candidate({ sourceDocumentId: "candidate-2" }),
        candidate({ sourceDocumentId: "candidate-3" }),
      ],
      ai: { generate },
    });
    const result = await detectDuplicateBill(input);
    expect(result).toMatchObject({
      duplicate: true,
      matchedSourceDocumentId: "candidate-3",
      candidatesConsidered: 3,
    });
    expect(generate).toHaveBeenCalledTimes(2);
    const shortlistCall = generate.mock.calls[0]?.[0];
    expect(shortlistCall?.model).toBe("text");
    const visualCall = generate.mock.calls[1]?.[0];
    expect(visualCall?.model).toBe("vision");
  });

  it("injects the output language and bounded ledger prompt into every AI stage", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(["candidate-1"]),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          duplicate: false,
          matchedSourceDocumentId: null,
          confidence: 0,
          reason: "not the same bill",
        }),
      });
    const input = buildInput({
      aiLanguage: "ja-JP",
      aiCustomPrompt: "Prefer merchant and total when comparing bills.",
      candidates: [
        candidate({ sourceDocumentId: "candidate-1" }),
        candidate({ sourceDocumentId: "candidate-2" }),
        candidate({ sourceDocumentId: "candidate-3" }),
      ],
      ai: { generate },
    });

    await detectDuplicateBill(input);

    expect(generate).toHaveBeenCalledTimes(2);
    for (const call of generate.mock.calls) {
      const request = call[0];
      expect(request?.prompt).toContain("Natural-language output language: ja-JP.");
      expect(request?.prompt).toContain("Prefer merchant and total when comparing bills.");
      expect(request?.prompt).toContain("untrusted supplemental guidance");
      expect(request?.prompt).toContain("strict JSON");
    }
    const visualContent = generate.mock.calls[1]?.[0]?.messages?.[0]?.content;
    expect(JSON.stringify(visualContent)).toContain(
      "Write the final reason in the requested output language."
    );
  });

  it("rejects a matched ID outside the candidate set (fail open)", async () => {
    const input = buildInput({
      ai: {
        generate: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            duplicate: true,
            matchedSourceDocumentId: "attacker-controlled-id",
            confidence: 0.99,
            reason: "looks the same",
          }),
        }),
      },
    });
    const result = await detectDuplicateBill(input);
    expect(result.duplicate).toBe(false);
  });

  it("fails open when the AI throws", async () => {
    const input = buildInput({
      ai: { generate: vi.fn().mockRejectedValue(new Error("provider down")) },
    });
    const result = await detectDuplicateBill(input);
    expect(result.duplicate).toBe(false);
  });

  it("fails open on invalid JSON", async () => {
    const input = buildInput({
      ai: { generate: vi.fn().mockResolvedValue({ content: "not json at all" }) },
    });
    const result = await detectDuplicateBill(input);
    expect(result.duplicate).toBe(false);
  });

  it("requires high confidence before blocking activation", async () => {
    const input = buildInput({
      ai: {
        generate: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            duplicate: true,
            matchedSourceDocumentId: "candidate-1",
            confidence: 0.5,
            reason: "maybe",
          }),
        }),
      },
    });
    const result = await detectDuplicateBill(input);
    expect(result.duplicate).toBe(false);
  });

  it("falls back to the deterministic shortlist when the text shortlist fails", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("shortlist failed"))
      .mockResolvedValueOnce({
        content: JSON.stringify({
          duplicate: true,
          matchedSourceDocumentId: "candidate-2",
          confidence: 0.85,
          reason: null,
        }),
      });
    const input = buildInput({
      candidates: [
        candidate({
          sourceDocumentId: "candidate-1",
          title: "Something Else",
          createdAt: "2026-08-05T06:00:00.000Z",
        }),
        candidate({
          sourceDocumentId: "candidate-2",
          title: "Coffee Shop",
          createdAt: "2026-08-05T08:30:00.000Z",
        }),
        candidate({
          sourceDocumentId: "candidate-3",
          title: "Groceries",
          createdAt: "2026-08-05T07:00:00.000Z",
        }),
      ],
      ai: { generate },
    });
    const result = await detectDuplicateBill(input);
    expect(result).toMatchObject({ duplicate: true, matchedSourceDocumentId: "candidate-2" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("uses deterministic selection only when the shortlist returns nothing usable", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ content: JSON.stringify(["not-a-candidate-id"]) })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          duplicate: false,
          matchedSourceDocumentId: null,
          confidence: 0,
          reason: null,
        }),
      });
    const input = buildInput({
      candidates: [
        candidate({
          sourceDocumentId: "candidate-1",
          title: "Coffee Shop",
          createdAt: "2026-08-05T08:30:00.000Z",
        }),
        candidate({
          sourceDocumentId: "candidate-2",
          title: "Other",
          createdAt: "2026-08-05T06:00:00.000Z",
        }),
        candidate({
          sourceDocumentId: "candidate-3",
          title: "Third",
          createdAt: "2026-08-05T07:00:00.000Z",
        }),
      ],
      ai: { generate },
    });
    const result = await detectDuplicateBill(input);
    expect(result.duplicate).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
    const visualCall = generate.mock.calls[1]?.[0];
    const content = visualCall?.messages?.[0]?.content;
    expect(JSON.stringify(content)).toContain("candidate-1");
  });
});

describe("normalizeDuplicateReason", () => {
  it("removes only the current and shortlisted document IDs", () => {
    const reason = normalizeDuplicateReason({
      reason: "current-1 matches candidate-1; receipt 12345, amount 123, date 2026-08-05",
      currentSourceDocumentId: "current-1",
      candidateSourceDocumentIds: ["candidate-1"],
    });

    expect(reason).toBe("matches; receipt 12345, amount 123, date 2026-08-05");
  });

  it("uses a localized fallback when the model gives no usable reason", () => {
    expect(
      normalizeDuplicateReason({
        reason: "   ",
        aiLanguage: "zh-CN",
        currentSourceDocumentId: "current-1",
        candidateSourceDocumentIds: ["candidate-1"],
      })
    ).toBe("账单内容、金额和日期高度一致，疑似为同一笔消费。");

    expect(
      normalizeDuplicateReason({
        reason: null,
        aiLanguage: "en-US",
        currentSourceDocumentId: "current-1",
        candidateSourceDocumentIds: ["candidate-1"],
      })
    ).toBe("The bill content, amount, and date closely match and may represent the same purchase.");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerMainCurrencyChangedError } from "@/application/contracts";
import type { AIContext } from "@/lib/tasks/types";
import { ProcessingFailure } from "@/modules/source-document/application/parse-source-document/contracts";

const { runParsePipelineMock, toOutputMock } = vi.hoisted(() => ({
  runParsePipelineMock: vi.fn(),
  toOutputMock: vi.fn(),
}));

vi.mock("@/modules/source-document/application/parse-source-document/pipeline", () => ({
  buildStageContext: vi.fn(() => ({})),
  runParsePipeline: runParsePipelineMock,
}));
vi.mock("@/modules/source-document/application/parse-source-document/result-mapper", () => ({
  toParseSourceDocumentOutput: toOutputMock,
}));

const { CurrentRevisionProcessor } =
  await import("@/application/adapters/in-process/revision-processor");

function createProcessor(entryCount: number, overrides: Record<string, unknown> = {}) {
  const getSettings = vi.fn().mockResolvedValue({
    mainCurrency: "CNY",
    duplicateDetectionEnabled: false,
  });
  const getRates = vi.fn().mockResolvedValue({
    base: "EUR",
    date: "2026-09-01",
    rates: { EUR: 1, CNY: 8, USD: 1.2 },
  });
  const activateRevision = vi.fn().mockResolvedValue(true);
  toOutputMock.mockReturnValue({
    verificationStatus: "passed",
    title: "Parsed",
    ledgerEntries: Array.from({ length: entryCount }, (_, index) => ({
      itemName: `Item ${index}`,
      amount: "10",
      currency: "EUR",
      categoryIndex: 0,
      entryDate: "2026-09-01",
    })),
  });
  runParsePipelineMock.mockResolvedValue({});

  const processor = new CurrentRevisionProcessor({
    createAIContext: () => ({}) as AIContext,
    loadContext: vi.fn().mockResolvedValue({
      revision: { submittedText: "receipt", outcome: "processing" },
      document: {
        activeRevisionId: null,
        pendingRevisionId: "revision-1",
        type: "ai_parsed",
        entryDate: "2026-09-01",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
      storedFileIds: [],
      categories: [],
    }),
    getSettings,
    loadStoredFiles: vi.fn().mockResolvedValue([]),
    listDuplicateCandidates: vi.fn().mockResolvedValue([]),
    getRates,
    preserveTerminalOutcome: vi.fn().mockResolvedValue(true),
    getRevision: vi.fn().mockResolvedValue(null),
    activateRevision,
    storeCandidateRevision: vi.fn().mockResolvedValue(true),
    storeDuplicatePendingRevision: vi.fn().mockResolvedValue(true),
    ...overrides,
  });
  return { processor, getSettings, getRates, activateRevision };
}

const request = {
  ledgerId: "ledger-1",
  sourceDocumentId: "document-1",
  revisionId: "revision-1",
};

describe("CurrentRevisionProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deduplicates concurrent exchange-rate reads within one processing request", async () => {
    const { processor, getRates, activateRevision } = createProcessor(100);

    await expect(processor.process(request)).resolves.toEqual({ outcome: "completed" });

    expect(getRates).toHaveBeenCalledTimes(1);
    expect(activateRevision.mock.calls[0]?.[0].entries).toHaveLength(100);
  });

  it("rebuilds currency-dependent work after a commit conflict without reparsing", async () => {
    const getSettings = vi
      .fn()
      .mockResolvedValueOnce({ mainCurrency: "CNY", duplicateDetectionEnabled: false })
      .mockResolvedValueOnce({ mainCurrency: "USD", duplicateDetectionEnabled: false });
    const activateRevision = vi
      .fn()
      .mockRejectedValueOnce(new LedgerMainCurrencyChangedError())
      .mockResolvedValueOnce(true);
    const { processor } = createProcessor(1, { getSettings, activateRevision });

    await expect(processor.process(request)).resolves.toEqual({ outcome: "completed" });

    expect(runParsePipelineMock).toHaveBeenCalledTimes(1);
    expect(activateRevision).toHaveBeenCalledTimes(2);
    expect(activateRevision.mock.calls[0]?.[0]).toMatchObject({
      expectedMainCurrency: "CNY",
      entries: [expect.objectContaining({ convertedAmount: "80.00" })],
    });
    expect(activateRevision.mock.calls[1]?.[0]).toMatchObject({
      expectedMainCurrency: "USD",
      entries: [expect.objectContaining({ convertedAmount: "12.00" })],
    });
  });

  it("stops after three currency conflicts with the stable exchange-rate failure", async () => {
    const activateRevision = vi.fn().mockRejectedValue(new LedgerMainCurrencyChangedError());
    const { processor, getSettings } = createProcessor(1, { activateRevision });

    const processing = processor.process(request);
    await expect(processing).rejects.toBeInstanceOf(ProcessingFailure);
    await expect(processing).rejects.toMatchObject({ code: "exchange_rate_failure" });
    expect(activateRevision).toHaveBeenCalledTimes(3);
    expect(getSettings).toHaveBeenCalledTimes(3);
    expect(runParsePipelineMock).toHaveBeenCalledTimes(1);
  });
});

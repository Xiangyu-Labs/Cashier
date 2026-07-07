import { describe, it, expect, vi, beforeAll } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

vi.mock("@/lib/storage/utils", () => ({
  isSuccessfulLoadImageResult: (result: { success: boolean }) => result.success,
  loadImagesForAI: vi.fn(),
  loadImagesForAIOrThrow: vi.fn(),
  loadImageForAI: vi.fn(),
  inferImageMimeType: vi.fn(),
  isLocalUploadUrl: vi.fn(),
}))

import { loadImagesForAI } from "@/lib/storage/utils"
import type { LoadImageResult } from "@/lib/storage/utils"
import { runParsePipeline } from "@/modules/source-document/application/parse-source-document/pipeline"
import { createAIContext } from "@/lib/tasks/ai-context"
import { getOpenAIClient } from "@/lib/ai/openai-client"
import { runtimeEnv } from "@/lib/env/runtime"
import type { ParseSourceDocumentInput } from "@/modules/source-document/application/tasks/parse-source-document"
import type { StageContext } from "@/modules/source-document/application/parse-source-document/pipeline"

const FIXTURES = path.resolve("tests/fixtures/images")
const SKIP = process.env.SMOKE_TESTS !== "1"

function fixtureDataUrl(filename: string): string {
  const buf = readFileSync(path.join(FIXTURES, filename))
  const ext = path.extname(filename).slice(1).replace("jpg", "jpeg")
  return `data:image/${ext};base64,${buf.toString("base64")}`
}

function imageUrls(...filenames: string[]): string[] {
  return filenames.map((f) => `/api/uploads/${f}`)
}

function assertSuccess(
  result: Awaited<ReturnType<typeof runParsePipeline>>,
  expected: { total?: number; currency?: string; minEntries?: number }
) {
  expect(result.kind).toBe("success")
  if (result.kind !== "success") return
  if (expected.total !== undefined) {
    const sum = result.ledgerEntries.reduce((s, e) => s + e.amount, 0)
    expect(Math.round(sum * 100) / 100).toBeCloseTo(expected.total, 1)
  }
  if (expected.currency !== undefined) {
    const nonNull = result.ledgerEntries.filter((e) => e.currency != null)
    expect(nonNull.length).toBeGreaterThan(0)
    expect(nonNull.every((e) => e.currency === expected.currency)).toBe(true)
  }
  if (expected.minEntries !== undefined) {
    expect(result.ledgerEntries.length).toBeGreaterThanOrEqual(expected.minEntries)
  }
}
let stageCtx: StageContext

beforeAll(() => {
  const ai = createAIContext({
    signal: new AbortController().signal,
    reportTokens: () => {},
    getClient: getOpenAIClient,
    modelConfig: {
      text: runtimeEnv.aiModelText,
      vision: runtimeEnv.aiModelVision,
    },
  })
  stageCtx = {
    signal: new AbortController().signal,
    ai,
    setProgress: async () => {},
    docId: "smoke-test-doc",
    ledgerId: "smoke-test-ledger",
  }
})

function mockImages(...filenames: string[]) {
  vi.mocked(loadImagesForAI).mockResolvedValue(
    filenames.map((f): LoadImageResult => ({
      url: `/api/uploads/${f}`,
      dataUrl: fixtureDataUrl(f),
      success: true,
    }))
  )
}

function baseInput(overrides: Partial<ParseSourceDocumentInput> = {}): ParseSourceDocumentInput {
  return {
    ledgerId: "smoke-test-ledger",
    sourceDocumentId: "smoke-test-doc",
    categories: [],
    settings: {},
    aiLanguage: "zh-CN",
    ...overrides,
  }
}

describe.skipIf(SKIP)("parse pipeline smoke tests", () => {
  describe("Group A: image-only positive cases", () => {
    it("case 1: receipt-1.jpeg → 777 CNY", async () => {
      mockImages("receipt-1.jpeg")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-1.jpeg") }), stageCtx)
      assertSuccess(result, { total: 777, currency: "CNY" })
    })

    it("case 2: receipt-2.jpeg → 76.75 MYR", async () => {
      mockImages("receipt-2.jpeg")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-2.jpeg") }), stageCtx)
      assertSuccess(result, { total: 76.75, currency: "MYR" })
    })

    it("case 3: receipt-3.png → 61.5 MYR", async () => {
      mockImages("receipt-3.png")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-3.png") }), stageCtx)
      assertSuccess(result, { total: 61.5, currency: "MYR" })
    })

    it("case 4: receipt-4.jpg → 52.8 (any currency)", async () => {
      mockImages("receipt-4.jpg")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-4.jpg") }), stageCtx)
      assertSuccess(result, { total: 52.8 })
    })

    it("case 5: receipt-5.jpg → 353 CNY", async () => {
      mockImages("receipt-5.jpg")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-5.jpg") }), stageCtx)
      assertSuccess(result, { total: 353, currency: "CNY" })
    })

    it("case 6: receipt-6.jpg → 353 CNY", async () => {
      mockImages("receipt-6.jpg")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-6.jpg") }), stageCtx)
      assertSuccess(result, { total: 353, currency: "CNY" })
    })

    it("case 7: receipt-7.jpg → 21.6 CNY", async () => {
      mockImages("receipt-7.jpg")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-7.jpg") }), stageCtx)
      assertSuccess(result, { total: 21.6, currency: "CNY" })
    })

    it("case 8: receipt-8.jpg → 21.6 CNY", async () => {
      mockImages("receipt-8.jpg")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-8.jpg") }), stageCtx)
      assertSuccess(result, { total: 21.6, currency: "CNY" })
    })

    it("case 9: receipt-9.png → 14.9 CNY", async () => {
      mockImages("receipt-9.png")
      const result = await runParsePipeline(baseInput({ imageUrls: imageUrls("receipt-9.png") }), stageCtx)
      assertSuccess(result, { total: 14.9, currency: "CNY" })
    })
  })
  describe("Group B: text-only cases", () => {
    it("case 10: 午餐费 45.50元 → 45.5 CNY", async () => {
      const result = await runParsePipeline(baseInput({ text: "午餐费 45.50元" }), stageCtx)
      assertSuccess(result, { total: 45.5, currency: "CNY" })
    })

    it("case 11: Taxi fare SGD 28.00 → 28 SGD", async () => {
      const result = await runParsePipeline(baseInput({ text: "Taxi fare SGD 28.00" }), stageCtx)
      assertSuccess(result, { total: 28, currency: "SGD" })
    })

    it("case 12: ランチ代 850円 → 850 JPY", async () => {
      const result = await runParsePipeline(baseInput({ text: "ランチ代 850円" }), stageCtx)
      assertSuccess(result, { total: 850, currency: "JPY" })
    })

    it("case 13: multi-item dinner → 156.8 CNY, ≥2 entries", async () => {
      const result = await runParsePipeline(
        baseInput({ text: "晚饭: 红烧肉45元、海鲜锅68元、饮料43.8元，合计156.8元" }),
        stageCtx
      )
      assertSuccess(result, { total: 156.8, currency: "CNY", minEntries: 2 })
    })
  })

  describe("Group C: image + text context", () => {
    it("case 14: unrecognized-currency-1.jpg alone → anomaly", async () => {
      mockImages("unrecognized-currency-1.jpg")
      const result = await runParsePipeline(
        baseInput({ imageUrls: imageUrls("unrecognized-currency-1.jpg") }),
        stageCtx
      )
      expect(result.kind).toBe("anomaly")
    })

    it("case 15: unrecognized-currency-1.jpg + CNY hint → anomaly (Stage 0 primary evidence wins over text hint)", async () => {
      mockImages("unrecognized-currency-1.jpg")
      const result = await runParsePipeline(
        baseInput({
          imageUrls: imageUrls("unrecognized-currency-1.jpg"),
          text: "这是在中国大陆的消费，货币是人民币CNY",
        }),
        stageCtx
      )
      expect(result.kind).toBe("anomaly")
    })
  })
  describe("Group D: multi-image", () => {
    it("case 16: receipt-7.jpg + receipt-8.jpg → success (both 21.6 CNY)", async () => {
      mockImages("receipt-7.jpg", "receipt-8.jpg")
      const result = await runParsePipeline(
        baseInput({ imageUrls: imageUrls("receipt-7.jpg", "receipt-8.jpg") }),
        stageCtx
      )
      assertSuccess(result, { currency: "CNY" })
    })
  })

  describe("Group E: negative / edge cases", () => {
    it("case 17: not-a-receipt-1.png → invalid", async () => {
      mockImages("not-a-receipt-1.png")
      const result = await runParsePipeline(
        baseInput({ imageUrls: imageUrls("not-a-receipt-1.png") }),
        stageCtx
      )
      expect(result.kind).toBe("invalid")
    })

    it("case 18: partial-mosaic-1.png → anomaly", async () => {
      mockImages("partial-mosaic-1.png")
      const result = await runParsePipeline(
        baseInput({ imageUrls: imageUrls("partial-mosaic-1.png") }),
        stageCtx
      )
      expect(result.kind).toBe("anomaly")
    })

    it("case 19: unrelated text → invalid", async () => {
      const result = await runParsePipeline(
        baseInput({ text: "今天天气很好出去散步了" }),
        stageCtx
      )
      expect(result.kind).toBe("invalid")
    })

    it("case 20: car maintenance USD 320 → 320 USD", async () => {
      const result = await runParsePipeline(
        baseInput({ text: "Car maintenance USD 320, parts $180, labor $140" }),
        stageCtx
      )
      assertSuccess(result, { total: 320, currency: "USD" })
    })
  })
})



# Parse Pipeline Smoke Tests + Base64 Removal

**Date:** 2026-03-28
**Status:** Planning

---

## Goals

1. **Rename fixture images** — unify all image filenames to ASCII/English.
2. **Remove base64 support** from `src/lib/storage/utils.ts` (`loadImageForAI`).
3. **20-case smoke test suite** — calls `runParsePipeline` with real AI, mocking only `loadImagesForAI` to read from fixture files on disk.

---

## Task 1 — Rename Fixture Images

### Current state (from `git status`)

| Old name | New name | Status |
|---|---|---|
| `不是账单.png` | `not-a-receipt-1.png` | Deleted staged; new file untracked |
| `无法识别货币-1.jpg` | `unrecognized-currency-1.jpg` | Modified (needs `git mv`) |
| `无法识别货币-2.jpg` | *(removed entirely)* | Deleted staged |
| `部分被马赛克涂抹.png` | `partial-mosaic-1.png` | Deleted staged; `部分被马赛克涂抹-1.png` untracked |
| `receipt-9.png` | `receipt-9.png` | New untracked |

### Action

```bash
# In tests/fixtures/images/
git mv 无法识别货币-1.jpg unrecognized-currency-1.jpg
git mv 部分被马赛克涂抹-1.png partial-mosaic-1.png
git add not-a-receipt-1.png receipt-9.png partial-mosaic-1.png
# stage deletions already done; verify with git status
```

### Final fixture inventory

| File | Expected parse outcome | Notes |
|---|---|---|
| `receipt-1.jpeg` | success · 777 CNY | |
| `receipt-2.jpeg` | success · 76.75 MYR | |
| `receipt-3.png` | success · 61.5 MYR | |
| `receipt-4.jpg` | success · 52.8 (currency from image) | currency not confirmed externally |
| `receipt-5.jpg` | success · 353 CNY | |
| `receipt-6.jpg` | success · 356 CNY | |
| `receipt-7.jpg` | success · 21.6 CNY | |
| `receipt-8.jpg` | success · 21.6 CNY | |
| `receipt-9.png` | success · 14.9 CNY | |
| `unrecognized-currency-1.jpg` | anomaly (alone) · success 110 CNY (with text hint) | |
| `partial-mosaic-1.png` | anomaly (data obscured) | |
| `not-a-receipt-1.png` | invalid | |

---

## Task 2 — Remove Base64 Support from `storage/utils.ts`

### What to remove

- The `isBase64DataUrl(url)` helper (or inline check).
- The branch in `loadImageForAI` that handles `data:image/...;base64,...` URLs — returns the string as-is.
- Any related types/comments.

### What stays

- Fetching `https://` / `http://` URLs.
- Reading `file://` or local paths (if present).
- The Supabase storage fetch path.

### Verification

Run unit tests for `storage/utils.ts` after change; delete/update any tests that cover the removed branch.

---

## Task 3 — Smoke Test Infrastructure

### New directory: `tests/smoke/`

```
tests/smoke/
  setup.ts                          # minimal: stub @/lib/db, no fake env defaults
  parse-pipeline.smoke.test.ts      # the 20 test cases
```

### New vitest project in `vitest.config.ts`

Add alongside the existing `unit` and `integration` projects:

```ts
{
  test: {
    name: "smoke",
    include: ["tests/smoke/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/smoke/setup.ts"],
    testTimeout: 90_000,   // real AI calls are slow
  },
}
```

### `tests/smoke/setup.ts`

```ts
import { vi } from "vitest"

// Stub DB — pipeline Stage 0 does a findFirst to update metadata;
// returning null just skips that update, which is fine for smoke tests.
vi.mock("@/lib/db", () => ({
  db: {
    query: { sourceDocuments: { findFirst: vi.fn().mockResolvedValue(null) } },
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  },
}))

// Do NOT set fake defaults for OPENAI_API_KEY / AI_MODEL_TEXT / AI_MODEL_VISION.
// They must come from .env.local so real AI is called.
```

### `loadImagesForAI` mock strategy

In each test, vi.mock `@/lib/storage/utils` so that `loadImagesForAI` reads from the fixture directory:

```ts
import { readFileSync } from "node:fs"
import path from "node:path"

const FIXTURES = path.resolve("tests/fixtures/images")

function fixtureDataUrl(filename: string): string {
  const buf = readFileSync(path.join(FIXTURES, filename))
  const ext = path.extname(filename).slice(1).replace("jpg", "jpeg")
  return `data:image/${ext};base64,${buf.toString("base64")}`
}

// In beforeAll / per-test:
vi.mocked(loadImagesForAI).mockImplementation(async (refs) =>
  refs.map((r) => fixtureDataUrl(r.storageKey))
)
```

Each test creates a `SourceDocumentInput` where `storageKey` = the fixture filename.

---

## Task 4 — The 20 Test Cases

### Group A: Image-only, positive (9 cases)

| # | Input | Expected |
|---|---|---|
| 1 | `receipt-1.jpeg` | status=success, total=777, currency=CNY |
| 2 | `receipt-2.jpeg` | status=success, total=76.75, currency=MYR |
| 3 | `receipt-3.png` | status=success, total=61.5, currency=MYR |
| 4 | `receipt-4.jpg` | status=success, total=52.8 |
| 5 | `receipt-5.jpg` | status=success, total=353, currency=CNY |
| 6 | `receipt-6.jpg` | status=success, total=356, currency=CNY |
| 7 | `receipt-7.jpg` | status=success, total=21.6, currency=CNY |
| 8 | `receipt-8.jpg` | status=success, total=21.6, currency=CNY |
| 9 | `receipt-9.png` | status=success, total=14.9, currency=CNY |

### Group B: Text-only (4 cases)

| # | Input | Expected |
|---|---|---|
| 10 | `"午餐费 45.50元"` | status=success, total=45.5, currency=CNY |
| 11 | `"Taxi fare SGD 28.00"` | status=success, total=28, currency=SGD |
| 12 | `"ランチ代 850円"` | status=success, total=850, currency=JPY |
| 13 | `"晚饭: 红烧肉45元、海鲜锅68元、饮料43.8元，合计156.8元"` | status=success, total=156.8, currency=CNY, entries≥2 |

### Group C: Image + text context (2 cases)

| # | Input | Expected |
|---|---|---|
| 14 | `unrecognized-currency-1.jpg` alone | status=anomaly (no currency info) |
| 15 | `unrecognized-currency-1.jpg` + text `"这是在中国大陆的消费，货币是人民币CNY"` | status=success, total=110, currency=CNY |

### Group D: Multi-image (1 case)

| # | Input | Expected |
|---|---|---|
| 16 | `receipt-7.jpg` + `receipt-8.jpg` together | status=success (both 21.6 CNY receipts parsed) |

### Group E: Negative / edge (4 cases)

| # | Input | Expected |
|---|---|---|
| 17 | `not-a-receipt-1.png` | status=invalid |
| 18 | `partial-mosaic-1.png` | status=anomaly |
| 19 | text `"今天天气很好出去散步了"` | status=invalid |
| 20 | text `"Car maintenance USD 320, parts $180, labor $140"` | status=success, total=320, currency=USD |

---

## Assertion pattern

```ts
type SmokeExpect = {
  status: "success" | "anomaly" | "invalid"
  total?: number     // exact match (no floating-point drift: compare with toBeCloseTo)
  currency?: string  // ISO 4217 uppercase
  minEntries?: number
}
```

- `status=invalid` → result object has `status: "invalid"`; no amount/currency asserted.
- `status=anomaly` → result has `status: "anomaly"`; no amount/currency asserted.
- `status=success` → assert `status`, `total` (±0.001), and `currency` when specified.
- For case 4 (receipt-4) only `total` is asserted; `currency` left open.

---

## Run command

```bash
# Run only smoke tests (requires real API key in .env.local)
SMOKE_TESTS=1 npx vitest run --project smoke
```

Regular `npm test` / `vitest run` will skip the smoke
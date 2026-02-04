# Testing Strategy

We use **Vitest** for testing with **in-memory SQLite** for fast, isolated tests.

## 1. Test Types

### 1.1 Unit Tests (`tests/unit/**/*.test.ts`)
- **Focus**: Single function logic (e.g., date parsing, OTP generation)
- **Deps**: No database, no network. Mock everything
- **Speed**: < 10ms

### 1.2 Integration Tests (`tests/integration/**/*.test.ts`)
- **Focus**: Server Actions, Database Queries, API Endpoints
- **Deps**: In-memory SQLite (created fresh for each test run)
- **OpenAI**: ALWAYS MOCKED
- **Speed**: ~100-500ms

## 2. Test Infrastructure

Tests use **in-memory SQLite** (`:memory:`), so no external database setup is required.

- **No Docker needed** for tests
- Each test run gets a fresh database
- Database is created and migrated in `tests/setup.ts`

## 3. How to Run Tests

### Run All Tests
```bash
npm run test:run
```

### Watch Mode
```bash
npm test
```

### Run Specific File
```bash
npx vitest tests/path/to/file.test.ts
```

### With Coverage
```bash
npm run test:coverage
```

## 4. Writing Integration Tests

We provide helpers in `tests/setup.ts` and `tests/helpers/`.

```typescript
import { getTestDb } from "tests/setup";
import { createTestUser, createTestUserWithLedger } from "tests/helpers/schema-setup";

describe("Create Transaction", () => {
    it("should save to database", async () => {
        const { userId, ledgerId } = await createTestUserWithLedger(getTestDb());
        
        // Act
        const result = await createTransactionAction(ledgerId, { amount: 100 });
        
        // Assert
        expect(result).toBeDefined();
    });
});
```

## 5. Mocking AI

Never hit the real OpenAI API in tests. We provide a **global mock** in `tests/setup.ts`.

If you need to customize the mock for a specific test:
```typescript
import { vi } from "vitest";

vi.mocked(getOpenAIClient).mockReturnValue({
    generateContent: vi.fn().mockResolvedValue({ content: "Custom Result" })
} as any);
```

## 6. Performance & Concurrency

File parallelism is **disabled** in `vitest.config.ts`:

```typescript
fileParallelism: false
```

### Why?
Tests share the same in-memory database. Running in parallel would cause race conditions.

### Future: Enabling Parallelism
To enable parallel testing, each worker would need its own SQLite instance.

## 7. Test Structure

```
tests/
├── setup.ts           # Global setup, mocks, test DB
├── helpers/           # Test utilities
│   └── schema-setup.ts
├── unit/              # Unit tests (no DB)
└── integration/       # Integration tests (uses DB)
```

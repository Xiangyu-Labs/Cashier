# Testing Strategy

We use **Vitest** for testing and a dedicated ephemeral infrastructure stack for integration tests.

## 1. Test Types

### 1.1 Unit Tests (`src/**/*.test.ts`)
-   **Focus**: Single function logic (e.g., date parsing helper).
-   **Deps**: No database, no network. Mock everything.
-   **Speed**: < 10ms.

### 1.2 Integration Tests (`tests/integration/**/*.test.ts`)
-   **Focus**: Server Actions, Database Queries, API Endpoints.
-   **Deps**: Real Postgres DB and Real Redis (running in Docker).
-   **OpenAI**: ALWAYS MOCKED.
-   **Speed**: ~100-500ms.

## 2. Test Infrastructure

We use a separate `docker-compose.test.yml` to spin up a clean environment for testing. This prevents your development data from being wiped during tests.

-   **Test DB Port**: 5433 (to avoid conflict with dev 5432).
-   **Test Redis Port**: 6380 (to avoid conflict with dev 6379).
-   **Storage**: `tmpfs` (RAM) for maximum speed.

## 3. How to Run Tests

### Step 1: Start Test Infra
Spin up the test database and redis containers:
```bash
npm run test:db:up
```
*You only need to do this once before your coding session.*

### Step 2: Run Tests
```bash
npm test
```
Or run a specific file:
```bash
npx vitest tests/path/to/file.test.ts
```

### Step 3: Cleanup
To stop the test containers:
```bash
npm run test:db:down
```

## 4. Writing Integration Tests

We provide helpers in `tests/setup.ts` to clear the database between tests.

```typescript
import { db } from "@/lib/db";
import { createTestUser } from "tests/helpers/user";

describe("Create Transaction", () => {
    it("should save to database", async () => {
        const user = await createTestUser();
        
        // Act
        const result = await createTransactionAction(user.id, { amount: 100 });
        
        // Assert
        const inDb = await db.query.transactions.findFirst();
        expect(inDb).toBeDefined();
        expect(inDb.amount).toBe(100);
    });
});
```

## 5. Mocking AI
Never hit the real OpenAI API in tests. We provide a **global mock** in `tests/setup.ts` to cover both foreground actions and background workers.

If you need to customize the mock for a specific test:
```typescript
import { getOpenAIClient } from "@/features/ai/server/services/openai";

vi.mocked(getOpenAIClient).mockReturnValue({
    generateContent: vi.fn().mockResolvedValue({ content: "Custom Result" })
} as any);
```

> [!IMPORTANT]
> Since we use background workers, an action might trigger a task that runs *after* your test finishes or during your test. Always ensure OpenAI is mocked globally to prevent `OPENAI_API_KEY is required` errors in worker threads.

## 6. Continuous Integration (CI)
Our CI pipeline automatically runs `test:db:up` -> `test` -> `test:db:down` on every PR.

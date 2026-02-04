# AI Pipeline Architecture

Cashier uses a simplified asynchronous architecture to process receipts and invoices. This ensures that long-running AI tasks do not block the user interface.

## 1. High-Level Flow Overview

1.  **User Action**: User uploads a file/text via the UI.
2.  **API Layer**: Server Action creates a `source_documents` record with status `queued` and submits it to the **In-Process Task Runner**.
3.  **Async Execution**: The task runner picks up the job immediately in the background (within the same Node.js process).
4.  **AI Processing**: The runner calls OpenAI (or other LLMs) to parse the document.
5.  **Verification & Arbitration**: The system runs checks (Dual GPT) and arbitrates if results conflict.
6.  **Result Persistence**: Valid results are saved to `ledger_entries`; the document status is updated to `completed`.
7.  **Real-time Updates**:
    - **UI Update**: The frontend uses **Smart Polling** (via TanStack Query) to refresh the status every few seconds.

```mermaid
graph TD
    A[User Upload] -->|Server Action| B(Create source_documents Record)
    B -->|Submit Task| C[In-Process Runner]
    C -->|Execute Async| D[Task Handler]
    D -->|Request| E[OpenAI / LLM]
    E -->|Response| D
    D -->|Verify| F{Checks Pass?}
    F -->|Yes| G[Save Ledger Entries]
    F -->|No| H[Set Anomaly Status]
    G --> I[Notify User via Web Push]
    H --> I
    J[Frontend UI] -.->|Smart Polling| B
    J -.->|Smart Polling| G
    J -.->|Smart Polling| H
```

## 2. The Task Runner

Tasks are executed using a lightweight **FlowEngine** (`src/lib/flow/engine.ts`).

-   **Execution Model**: "Fire-and-forget" asynchronous execution within the main application process.
-   **Lifecycle**:
    -   `validate`: Checks inputs (e.g. document exists).
    -   `execute`: Runs the core business logic.
    -   `onComplete` / `onError`: Handles status updates and notifications.

**Note**: Since tasks run in-memory, they will be interrupted if the server restarts.

## 3. The Parsing Task: "Dual GPT + Arbitration"

The core logic resides in `src/features/source-document/server/tasks/parse-source-document.ts`. We use a sophisticated **"Consensus & Arbitration"** strategy to ensure accuracy.

### Step 3.1: Dual Execution
The system sends the **same prompt** to the LLM **twice in parallel**.
```typescript
const [result1, result2] = await Promise.all([
    processor.process(payload, options),
    processor.process(payload, options)
]);
```

### Step 3.2: Verification
We compare `result1` and `result2` using strict logic (`verifyAmounts`):
-   Do they have the same number of entries?
-   Do the total amounts match (per currency)?
-   **If they match**: We assume the result is correct.
-   **If they differ**: We assume *ambiguity* or *hallucination*.

### Step 3.3: Arbitration (The "Judge")
If `result1 !== result2`, we invoke a third LLM call: the **Arbitrator**.
The Arbitrator is given:
-    The original text/image.
-   The two conflicting outputs (`result1` vs `result2`).
-   An instruction to decide which one is correct, or if *both* are wrong.

This significantly reduces "silent failures" where an LLM confidently outputs wrong numbers.

## 4. Idempotency & Error Handling

-   **Idempotency**: The handler performs an "upsert-like" operation: it soft-deletes any existing entries for the source document before inserting new ones.
-   **Anomalies**: If the document cannot be parsed (e.g., blurred image, unrelated text), it is not "Failed" (which implies a system crash) but set to `anomaly` status. This prompts the user to review it manually.

---

## 📚 Related Documentation

- [Backend Task Development SOP](./backend_task_development_sop.md) - How to write new tasks
- [Architecture Overview](./architecture_overview.md) - High-level system design

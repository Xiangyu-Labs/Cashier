# Architecture Overview

Cashier is built on a **Feature-Based Architecture** (often called "Vertical Slices"). Instead of organizing code by technical layer (controllers, views, models), we organize it by _domain feature_ (auth, ledger, ai).

## High-Level Directory Structure

```text
src/
├── app/            # Next.js App Router (Routing Layer)
├── features/       # Feature Slices (Domain Logic)
│   ├── auth/       # Authentication (NextAuth)
│   ├── ledger/     # Transactions & Bookkeeping
│   ├── ai/         # LLM Processing
│   └── ...
├── lib/            # Shared Kernel (Infrastructure & Utilities)
├── components/     # shared UI components (Design System)
└── db/             # Database Schema & Migrations
```

## 1. Feature Slices (`src/features/*`)

Each directory in `src/features/` represents a distinct domain capability. A typical feature structure looks like this:

```text
src/features/ledger/
├── components/     # UI Components specific to this feature
│   ├── transaction-list.tsx
│   └── transaction-form.tsx
├── server/         # Server-side logic
│   ├── actions/    # Server Actions (callable from UI)
│   └── schema.ts   # Database Schema for this feature
└── client/         # Client-side specific logic (hooks, stores)
```

### Rules for Features

1.  **Colocation**: Everything related to a feature should stay within that feature's folder.
2.  **Public API**: Cross-feature imports must go through explicit entrypoints such as `features/ledger`, `features/ledger/server`, `features/ledger/client`, or `features/ledger/components`. Do not deep link into another feature's internal files.
3.  **Feature-private helpers stay colocated**: If logic only serves one feature, keep it inside that feature's `client/`, `server/`, or local helper modules rather than promoting it to `src/lib` or `src/hooks`.
4.  **Feature internals are not contracts**: `actions/*`, `hooks/*`, local component files, and `lib/*` under a feature may change freely. If another feature needs them, promote them through the owning feature's public entrypoint first.

## 2. Shared Kernel (`src/lib/*`)

The `src/lib/` directory contains code that is truly generic or infrastructural, shared across multiple features.

- **`lib/db`**: Database connection, Drizzle ORM configuration, and Scoped Query Helpers (`scoped-query.ts`).
- **`lib/auth.ts`**: Authentication configuration.
- **`lib/utils.ts`**: low-level helpers.
- **`lib/flow`**: Workflow orchestration for processing tasks.

Avoid putting business logic in `src/lib`. If logic belongs to "Users", put it in `src/features/users`, not `lib/user-utils.ts`.

Community-aligned rule of thumb:

- Put cross-feature pure utilities, parsing, formatting, and shared schemas in `src/lib`.
- Keep feature-specific URL state, filter state, and UI coordination inside the owning feature.
- Separate pure state helpers from navigation or browser side effects whenever possible.
- Keep `src/lib` infrastructure-focused. If a helper needs `NextResponse`, route params, or feature-specific business rules, it likely belongs in `src/app` boundary code or the owning feature instead.

## 3. The Application Layer (`src/app`)

The `src/app` directory (Next.js App Router) should be kept "thin". It serves as the glue that connects URLs to Feature Components.

**Example Page (`src/app/(dashboard)/ledger/page.tsx`):**

```tsx
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";

export default function LedgerPage() {
  // The page just mounts the feature container
  return <LedgerPageClient />;
}
```

For route handlers, keep `src/app/api/*` limited to boundary concerns:

- Authentication / authorization
- Rate limiting
- Input parsing and validation
- Calling feature actions/services
- Returning HTTP responses

Do not let `src/app` become a second business-logic layer.

`src/app` and shared UI code should import features only through public entrypoints. If a page needs feature-specific prefetching or orchestration, move that logic into the feature and call it from the page.

## 4. Data Access

We use **Drizzle ORM** for data access.

- **Schema Definition**: Schemas are defined inside `src/features/*/server/schema.ts` to keep data definition close to usage.
- **Schema Aggregation**: `drizzle.config.ts` imports all these schemas to generate migrations.
- **Queries**: Queries live directly in **Server Actions**. We use a helper (`forLedger` / `scoped-query`) to ensure tenant isolation and handle soft deletes consistently without a heavy Repository layer.

## 5. Background Tasks

- Task modules export explicit task definitions `{ type, handler }`.
- Only `lib/flow/task-registry.ts` is allowed to register tasks with the engine.
- Task metadata such as `deduplicationKey` must be first-class engine fields, not hidden inside task input payloads.
## 6. Key Technologies

- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite
- **ORM**: Drizzle ORM
- **Authentication**: Auth.js (NextAuth) v5
- **UI System**: Tailwind CSS + Shadcn/ui (Radix Primitives)
- **Async Processing**: In-Process Task Runner (Simple, memory-based)

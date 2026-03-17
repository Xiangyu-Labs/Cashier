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
2.  **Public API**: Features should ideally export a clear API for other features to use, rather than deep linking into internal implementation details (e.g., import from `features/ledger/server` not `.../server/internal_helper`).

## 2. Shared Kernel (`src/lib/*`)

The `src/lib/` directory contains code that is truly generic or infrastructural, shared across multiple features.

- **`lib/db`**: Database connection, Drizzle ORM configuration, and Scoped Query Helpers (`scoped-query.ts`).
- **`lib/auth.ts`**: Authentication configuration.
- **`lib/utils.ts`**: low-level helpers.
- **`lib/flow`**: Workflow orchestration for processing tasks.

Avoid putting business logic in `src/lib`. If logic belongs to "Users", put it in `src/features/users`, not `lib/user-utils.ts`.

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

## 4. Data Access

We use **Drizzle ORM** for data access.

- **Schema Definition**: Schemas are defined inside `src/features/*/server/schema.ts` to keep data definition close to usage.
- **Schema Aggregation**: `drizzle.config.ts` imports all these schemas to generate migrations.
- **Queries**: Queries live directly in **Server Actions**. We use a helper (`forLedger` / `scoped-query`) to ensure tenant isolation and handle soft deletes consistently without a heavy Repository layer.

## 5. Key Technologies

- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite
- **ORM**: Drizzle ORM
- **Authentication**: Auth.js (NextAuth) v5
- **UI System**: Tailwind CSS + Shadcn/ui (Radix Primitives)
- **Async Processing**: In-Process Task Runner (Simple, memory-based)

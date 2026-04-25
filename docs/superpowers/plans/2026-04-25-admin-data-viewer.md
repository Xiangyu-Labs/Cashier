# Admin Data Viewer Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the admin panel with 6 new read-only entity views (Ledgers, Categories, Accounts, Service Credentials, Currency Rates, OTP Tokens) and an overview dashboard, all following the existing admin table+filter+detail pattern.

**Architecture:** Each new entity follows the exact same pattern as existing admin pages: a server-side query file with cursor pagination and filters, a client-side list component with expandable detail panel, and a server page component that wires them together. No new patterns or dependencies are introduced.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM (SQLite), next-intl, Tailwind CSS, Vitest

---

## File Structure

### New Query Files
- `src/modules/admin/application/queries/list-admin-ledgers.ts`
- `src/modules/admin/application/queries/list-admin-categories.ts`
- `src/modules/admin/application/queries/list-admin-accounts.ts`
- `src/modules/admin/application/queries/list-admin-service-credentials.ts`
- `src/modules/admin/application/queries/list-admin-currency-rates.ts`
- `src/modules/admin/application/queries/list-admin-otp-tokens.ts`
- `src/modules/admin/application/queries/get-admin-overview-stats.ts`

### New UI Components
- `src/modules/admin/ui/AdminLedgersList.tsx`
- `src/modules/admin/ui/AdminCategoriesList.tsx`
- `src/modules/admin/ui/AdminAccountsList.tsx`
- `src/modules/admin/ui/AdminServiceCredentialsList.tsx`
- `src/modules/admin/ui/AdminCurrencyRatesList.tsx`
- `src/modules/admin/ui/AdminOTPTokensList.tsx`
- `src/modules/admin/ui/AdminOverviewStatCard.tsx`

### New Page Routes
- `src/app/[locale]/(protected)/admin/ledgers/page.tsx`
- `src/app/[locale]/(protected)/admin/categories/page.tsx`
- `src/app/[locale]/(protected)/admin/accounts/page.tsx`
- `src/app/[locale]/(protected)/admin/service-credentials/page.tsx`
- `src/app/[locale]/(protected)/admin/currency-rates/page.tsx`
- `src/app/[locale]/(protected)/admin/otp-tokens/page.tsx`

### Modified Files
- `src/modules/admin/contracts.ts` — append new types
- `src/modules/admin/contract-schemas.ts` — append new schemas
- `src/modules/admin/queries.ts` — append new exports
- `src/modules/admin/ui/AdminHome.tsx` — rewrite as dashboard
- `src/modules/admin/ui/index.ts` — append new exports
- `src/app/[locale]/(protected)/admin/layout.tsx` — append nav items
- `src/app/[locale]/(protected)/admin/page.tsx` — update to pass stats
- `messages/zh.json` — append translations
- `messages/en.json` — append translations

### New Test Files
- `tests/unit/modules/admin/list-admin-ledgers.test.ts`
- `tests/unit/modules/admin/list-admin-categories.test.ts`
- `tests/unit/modules/admin/list-admin-accounts.test.ts`
- `tests/unit/modules/admin/list-admin-service-credentials.test.ts`
- `tests/unit/modules/admin/list-admin-currency-rates.test.ts`
- `tests/unit/modules/admin/list-admin-otp-tokens.test.ts`
- `tests/unit/modules/admin/get-admin-overview-stats.test.ts`

---

## Task 1: Shared Contracts, Schemas, and Barrel Exports

**Files:**
- Modify: `src/modules/admin/contracts.ts`
- Modify: `src/modules/admin/contract-schemas.ts`
- Modify: `src/modules/admin/queries.ts`

- [ ] **Step 1: Append new types to contracts.ts**

Add the following interfaces to the end of `src/modules/admin/contracts.ts` (before any type aliases that reference schemas):

```typescript
export interface AdminLedgerListItem {
  id: string;
  userId: string;
  userEmail: string | null;
  mainCurrency: string | null;
  createdAt: Date;
}

export interface AdminLedgerDetail {
  id: string;
  userId: string;
  userEmail: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AdminCategoryListItem {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isEditable: boolean;
  createdAt: Date;
}

export interface AdminCategoryDetail {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isEditable: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AdminAccountListItem {
  userId: string;
  userEmail: string | null;
  provider: string;
  providerAccountId: string;
  type: string;
}

export interface AdminAccountDetail {
  userId: string;
  userEmail: string | null;
  provider: string;
  providerAccountId: string;
  type: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
  idToken: string | null;
  sessionState: string | null;
}

export interface AdminServiceCredentialListItem {
  id: string;
  key: string;
  name: string;
  ledgerId: string;
  userEmail: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface AdminServiceCredentialDetail {
  id: string;
  key: string;
  name: string;
  ledgerId: string;
  userEmail: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  deletedAt: Date | null;
}

export interface AdminCurrencyRateListItem {
  date: string;
  base: string;
  rateCount: number;
  updatedAt: Date;
}

export interface AdminCurrencyRateDetail {
  date: string;
  base: string;
  rates: Record<string, number>;
  updatedAt: Date;
}

export interface AdminOTPTokenListItem {
  id: string;
  email: string;
  expires: Date;
  attempts: number;
  isVerified: boolean;
  ipAddress: string | null;
  createdAt: Date;
}

export interface AdminOTPTokenDetail {
  id: string;
  email: string;
  tokenHash: string;
  expires: Date;
  attempts: number;
  lockedUntil: Date | null;
  ipAddress: string | null;
  createdAt: Date;
  lastAttemptAt: Date | null;
  verifiedAt: Date | null;
}

export interface AdminOverviewStats {
  totalUsers: number;
  totalLedgers: number;
  totalEntries: number;
  totalSourceDocuments: number;
  totalTasks: number;
  totalCategories: number;
  totalServiceCredentials: number;
  totalAccounts: number;
  totalCurrencyRates: number;
  totalOTPTokens: number;
}

export type AdminLedgerRange = "24h" | "7d" | "30d" | "all";

export interface ListAdminLedgersResult {
  items: AdminLedgerListItem[];
  nextCursor: string | null;
  hasAnyLedgers: boolean;
}

export interface ListAdminCategoriesResult {
  items: AdminCategoryListItem[];
  hasAnyCategories: boolean;
}

export interface ListAdminAccountsResult {
  items: AdminAccountListItem[];
  availableProviders: string[];
  hasAnyAccounts: boolean;
}

export interface ListAdminServiceCredentialsResult {
  items: AdminServiceCredentialListItem[];
  nextCursor: string | null;
  hasAnyServiceCredentials: boolean;
}

export interface ListAdminCurrencyRatesResult {
  items: AdminCurrencyRateListItem[];
  nextCursor: string | null;
  hasAnyCurrencyRates: boolean;
}

export interface ListAdminOTPTokensResult {
  items: AdminOTPTokenListItem[];
  nextCursor: string | null;
  hasAnyOTPTokens: boolean;
}

export type ListAdminLedgersInput = z.input<typeof listAdminLedgersValidatedInputSchema>;
export type ListAdminLedgersValidatedInput = z.infer<typeof listAdminLedgersValidatedInputSchema>;
export type ListAdminCategoriesInput = z.input<typeof listAdminCategoriesValidatedInputSchema>;
export type ListAdminCategoriesValidatedInput = z.infer<typeof listAdminCategoriesValidatedInputSchema>;
export type ListAdminAccountsInput = z.input<typeof listAdminAccountsValidatedInputSchema>;
export type ListAdminAccountsValidatedInput = z.infer<typeof listAdminAccountsValidatedInputSchema>;
export type ListAdminServiceCredentialsInput = z.input<typeof listAdminServiceCredentialsValidatedInputSchema>;
export type ListAdminServiceCredentialsValidatedInput = z.infer<typeof listAdminServiceCredentialsValidatedInputSchema>;
export type ListAdminCurrencyRatesInput = z.input<typeof listAdminCurrencyRatesValidatedInputSchema>;
export type ListAdminCurrencyRatesValidatedInput = z.infer<typeof listAdminCurrencyRatesValidatedInputSchema>;
export type ListAdminOTPTokensInput = z.input<typeof listAdminOTPTokensValidatedInputSchema>;
export type ListAdminOTPTokensValidatedInput = z.infer<typeof listAdminOTPTokensValidatedInputSchema>;
```

- [ ] **Step 2: Append new schemas to contract-schemas.ts**

Add the following to `src/modules/admin/contract-schemas.ts` after the existing schemas:

```typescript
const adminLedgerRangeSchema = z.enum(["24h", "7d", "30d", "all"]);
const adminLedgerCursorSchema = z.string().regex(/^.+\|.+$/, "Invalid admin ledger cursor");

export const listAdminLedgersValidatedInputSchema = strictObjectSchema({
  range: adminLedgerRangeSchema.default("all"),
  cursor: adminLedgerCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminLedgersInputSchema = listAdminLedgersValidatedInputSchema;

export const listAdminCategoriesValidatedInputSchema = strictObjectSchema({
  ledgerId: z.string().trim().min(1).optional(),
});

export const listAdminCategoriesInputSchema = listAdminCategoriesValidatedInputSchema;

export const listAdminAccountsValidatedInputSchema = strictObjectSchema({
  provider: z.string().trim().min(1).optional(),
});

export const listAdminAccountsInputSchema = listAdminAccountsValidatedInputSchema;

const adminServiceCredentialCursorSchema = z
  .string()
  .regex(/^.+\|.+$/, "Invalid admin service credential cursor");

export const listAdminServiceCredentialsValidatedInputSchema = strictObjectSchema({
  ledgerId: z.string().trim().min(1).optional(),
  cursor: adminServiceCredentialCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminServiceCredentialsInputSchema = listAdminServiceCredentialsValidatedInputSchema;

const adminCurrencyRateCursorSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid admin currency rate cursor");

export const listAdminCurrencyRatesValidatedInputSchema = strictObjectSchema({
  range: adminLedgerRangeSchema.default("all"),
  cursor: adminCurrencyRateCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminCurrencyRatesInputSchema = listAdminCurrencyRatesValidatedInputSchema;

const adminOTPTokenCursorSchema = z.string().regex(/^.+\|.+$/, "Invalid admin OTP token cursor");

export const listAdminOTPTokensValidatedInputSchema = strictObjectSchema({
  email: z.string().trim().min(1).optional(),
  verified: z.enum(["yes", "no"]).optional(),
  cursor: adminOTPTokenCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminOTPTokensInputSchema = listAdminOTPTokensValidatedInputSchema;

export function parseListAdminLedgersInput(input: unknown): z.infer<typeof listAdminLedgersValidatedInputSchema> {
  const result = listAdminLedgersValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminCategoriesInput(input: unknown): z.infer<typeof listAdminCategoriesValidatedInputSchema> {
  const result = listAdminCategoriesValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminAccountsInput(input: unknown): z.infer<typeof listAdminAccountsValidatedInputSchema> {
  const result = listAdminAccountsValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminServiceCredentialsInput(
  input: unknown
): z.infer<typeof listAdminServiceCredentialsValidatedInputSchema> {
  const result = listAdminServiceCredentialsValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminCurrencyRatesInput(
  input: unknown
): z.infer<typeof listAdminCurrencyRatesValidatedInputSchema> {
  const result = listAdminCurrencyRatesValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminOTPTokensInput(
  input: unknown
): z.infer<typeof listAdminOTPTokensValidatedInputSchema> {
  const result = listAdminOTPTokensValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}
```

- [ ] **Step 3: Append new exports to queries.ts barrel**

Append to `src/modules/admin/queries.ts`:

```typescript
export { listAdminLedgers } from "./application/queries/list-admin-ledgers";
export { listAdminCategories } from "./application/queries/list-admin-categories";
export { listAdminAccounts } from "./application/queries/list-admin-accounts";
export { listAdminServiceCredentials } from "./application/queries/list-admin-service-credentials";
export { listAdminCurrencyRates } from "./application/queries/list-admin-currency-rates";
export { listAdminOTPTokens } from "./application/queries/list-admin-otp-tokens";
export { getAdminOverviewStats } from "./application/queries/get-admin-overview-stats";
```

- [ ] **Step 4: Run typecheck to verify contracts/schemas compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin/contracts.ts src/modules/admin/contract-schemas.ts src/modules/admin/queries.ts
git commit -m "feat(admin): add contracts, schemas, and barrel exports for new entity views

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Ledgers Query, Test, UI, and Page

**Files:**
- Create: `src/modules/admin/application/queries/list-admin-ledgers.ts`
- Create: `tests/unit/modules/admin/list-admin-ledgers.test.ts`
- Create: `src/modules/admin/ui/AdminLedgersList.tsx`
- Create: `src/app/[locale]/(protected)/admin/ledgers/page.tsx`

- [ ] **Step 1: Write the query**

Create `src/modules/admin/application/queries/list-admin-ledgers.ts`:

```typescript
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminLedgersInput } from "@/modules/admin/contract-schemas";
import type {
  AdminLedgerListItem,
  ListAdminLedgersInput,
  ListAdminLedgersResult,
} from "@/modules/admin/contracts";
import { ledgers, users } from "@/persistence";

function parseLedgerCursor(cursor: string): { createdAt: Date; id: string; rangeStart: Date | null } {
  const [createdAtRaw, id, rangeStartRaw, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin ledger cursor", path: ["cursor"] }],
    });
  }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin ledger cursor", path: ["cursor"] }],
    });
  }
  let rangeStart: Date | null = null;
  if (rangeStartRaw != null && rangeStartRaw !== "") {
    rangeStart = new Date(rangeStartRaw);
    if (Number.isNaN(rangeStart.getTime())) {
      throw new ValidationError("Validation failed", {
        issues: [{ message: "Invalid admin ledger cursor", path: ["cursor"] }],
      });
    }
  }
  return { createdAt, id, rangeStart };
}

function resolveRangeStart(range: "24h" | "7d" | "30d" | "all"): Date | null {
  const now = Date.now();
  switch (range) {
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function formatLedgerCursor(row: { createdAt: Date; id: string }, rangeStart: Date | null): string {
  if (rangeStart == null) {
    return `${row.createdAt.toISOString()}|${row.id}`;
  }
  return `${row.createdAt.toISOString()}|${row.id}|${rangeStart.toISOString()}`;
}

export async function listAdminLedgers(
  input: ListAdminLedgersInput = {}
): Promise<ListAdminLedgersResult> {
  await requireSuperAdmin();

  const validated = parseListAdminLedgersInput(input);
  const conditions = [isNull(ledgers.deletedAt)];
  const parsedCursor = validated.cursor != null ? parseLedgerCursor(validated.cursor) : null;

  const rangeStart =
    validated.range === "all" ? null : parsedCursor?.rangeStart ?? resolveRangeStart(validated.range);
  if (rangeStart != null) {
    conditions.push(gte(ledgers.createdAt, rangeStart));
  }

  if (parsedCursor != null) {
    const cursorCondition = or(
      lt(ledgers.createdAt, parsedCursor.createdAt),
      and(eq(ledgers.createdAt, parsedCursor.createdAt), lt(ledgers.id, parsedCursor.id))
    );
    if (cursorCondition != null) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      id: ledgers.id,
      userId: ledgers.userId,
      userEmail: users.email,
      metadata: ledgers.metadata,
      createdAt: ledgers.createdAt,
    })
    .from(ledgers)
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .where(and(...conditions))
    .orderBy(desc(ledgers.createdAt), desc(ledgers.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = formatLedgerCursor(lastItem, rangeStart);
    }
  }

  const anyLedgerRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgers)
    .where(isNull(ledgers.deletedAt));

  const items: AdminLedgerListItem[] = pageRows.map((row) => ({
    id: row.id,
    userId: row.userId,
    userEmail: row.userEmail,
    mainCurrency:
      typeof row.metadata === "object" && row.metadata != null
        ? (row.metadata as { settings?: { mainCurrency?: string } }).settings?.mainCurrency ?? null
        : null,
    createdAt: row.createdAt,
  }));

  return {
    items,
    nextCursor,
    hasAnyLedgers: (anyLedgerRows[0]?.count ?? 0) > 0,
  };
}
```

- [ ] **Step 2: Write the test**

Create `tests/unit/modules/admin/list-admin-ledgers.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { ledgers, users } from "@/persistence";
import { listAdminLedgers } from "@/modules/admin/queries";
import { ValidationError } from "@/lib/errors";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("listAdminLedgers", () => {
  it("requires super-admin access before querying ledgers", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminLedgers({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns newest ledgers first with user email enrichment", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM ledgers`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(ledgers).values([
      {
        id: "ledger-new",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "CNY" } },
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "ledger-old",
        userId: "user-1",
        metadata: {},
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminLedgers({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["ledger-new", "ledger-old"]);
    expect(result.items[0]).toMatchObject({ userEmail: "owner@example.com", mainCurrency: "CNY" });
    expect(result.hasAnyLedgers).toBe(true);
  });

  it("filters by time range", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

    await db.insert(ledgers).values([
      {
        id: "ledger-in-range",
        userId: "user-1",
        metadata: {},
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
      },
      {
        id: "ledger-out-of-range",
        userId: "user-1",
        metadata: {},
        createdAt: new Date("2026-03-17T11:00:00.000Z"),
      },
    ]);

    const result = await listAdminLedgers({ range: "7d", limit: 50 });
    expect(result.items.map((item) => item.id)).toEqual(["ledger-in-range"]);

    vi.useRealTimers();
  });

  it("returns nextCursor and supports pagination", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(ledgers).values([
      {
        id: "ledger-c",
        userId: "user-1",
        metadata: {},
        createdAt: new Date("2026-03-25T12:00:00.000Z"),
      },
      {
        id: "ledger-b",
        userId: "user-1",
        metadata: {},
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
      },
      {
        id: "ledger-a",
        userId: "user-1",
        metadata: {},
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
    ]);

    const firstPage = await listAdminLedgers({ limit: 2 });
    expect(firstPage.items.map((item) => item.id)).toEqual(["ledger-c", "ledger-b"]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listAdminLedgers({ limit: 2, cursor: firstPage.nextCursor ?? undefined });
    expect(secondPage.items.map((item) => item.id)).toEqual(["ledger-a"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await expect(listAdminLedgers({ cursor: "bad-cursor" })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/modules/admin/list-admin-ledgers.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 4: Write the UI component**

Create `src/modules/admin/ui/AdminLedgersList.tsx`:

```typescript
"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminLedgerListItem } from "@/modules/admin/contracts";

export interface AdminLedgersListLabels {
  title: string;
  description: string;
  id: string;
  user: string;
  createdAt: string;
  mainCurrency: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
  notAvailable: string;
  ledgerId: string;
  userId: string;
  userEmail: string;
  metadata: string;
  updatedAt: string;
  deletedAt: string;
  showRawData: string;
  hideRawData: string;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

function buildNextPageHref(nextCursor: string): string {
  return `/admin/ledgers?cursor=${encodeURIComponent(nextCursor)}`;
}

export function AdminLedgersList(props: {
  locale: string;
  items: AdminLedgerListItem[];
  hasAnyLedgers: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedLedgerId?: string | null;
  labels: AdminLedgersListLabels;
}) {
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    [props.locale]
  );

  if (props.items.length === 0) {
    const title = props.hasAnyLedgers
      ? props.labels.filteredEmptyTitle
      : props.labels.emptyTitle;
    const description = props.hasAnyLedgers
      ? props.labels.filteredEmptyDescription
      : props.labels.emptyDescription;
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-text">{props.labels.title}</h2>
        <p className="mt-1 text-sm text-muted">{props.labels.description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.id}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.user}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.createdAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.mainCurrency}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const isExpanded = props.expandedLedgerId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="break-all px-6 py-4 text-sm text-text">{item.id}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {item.userEmail ?? item.userId}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      {item.mainCurrency ?? props.labels.notAvailable}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/ledgers"
                            : `/admin/ledgers?detail=${encodeURIComponent(item.id)}${
                                props.currentCursor ? `&cursor=${encodeURIComponent(props.currentCursor)}` : ""
                              }`
                        }
                        prefetch={false}
                        scroll={false}
                        className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                      >
                        {isExpanded ? props.labels.hideDetails : props.labels.details}
                      </Link>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={5} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.ledgerId}</h3>
                            <p className="mt-1 text-sm text-muted">{item.id}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.userId}</h3>
                            <p className="mt-1 text-sm text-muted">{item.userId}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.userEmail}</h3>
                            <p className="mt-1 text-sm text-muted">{item.userEmail ?? props.labels.notAvailable}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.createdAt}</h3>
                            <p className="mt-1 text-sm text-muted">
                              {formatOptionalDate(item.createdAt, dateFormatter)}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {props.nextCursor != null ? (
        <div className="border-t border-border px-6 py-4">
          <Link
            href={buildNextPageHref(props.nextCursor)}
            prefetch={false}
            scroll={false}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            {props.labels.nextPage}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Write the page**

Create `src/app/[locale]/(protected)/admin/ledgers/page.tsx`:

```typescript
import { getLocale, getTranslations } from "next-intl/server";
import { listAdminLedgers } from "@/modules/admin/queries";
import { AdminLedgersList } from "@/modules/admin/ui";

interface AdminLedgersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminLedgersPage({ searchParams }: AdminLedgersPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminLedgers");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    range: getSingleSearchParam(resolvedSearchParams.range),
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const expandedLedgerId = getSingleSearchParam(resolvedSearchParams.detail);
  const ledgers = await listAdminLedgers(listSearchParams);

  return (
    <AdminLedgersList
      locale={locale}
      items={ledgers.items}
      hasAnyLedgers={ledgers.hasAnyLedgers}
      nextCursor={ledgers.nextCursor}
      currentCursor={getSingleSearchParam(resolvedSearchParams.cursor)}
      expandedLedgerId={expandedLedgerId}
      labels={{
        title: t("title"),
        description: t("description"),
        id: t("id"),
        user: t("user"),
        createdAt: t("createdAt"),
        mainCurrency: t("mainCurrency"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        filteredEmptyTitle: t("filteredEmptyTitle"),
        filteredEmptyDescription: t("filteredEmptyDescription"),
        nextPage: t("nextPage"),
        notAvailable: t("notAvailable"),
        ledgerId: t("ledgerId"),
        userId: t("userId"),
        userEmail: t("userEmail"),
        metadata: t("metadata"),
        updatedAt: t("updatedAt"),
        deletedAt: t("deletedAt"),
        showRawData: t("showRawData"),
        hideRawData: t("hideRawData"),
      }}
    />
  );
}
```

- [ ] **Step 6: Append UI export to barrel**

Append to `src/modules/admin/ui/index.ts`:

```typescript
export { AdminLedgersList, type AdminLedgersListLabels } from "./AdminLedgersList";
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/application/queries/list-admin-ledgers.ts tests/unit/modules/admin/list-admin-ledgers.test.ts src/modules/admin/ui/AdminLedgersList.tsx src/app/[locale]/\(protected\)/admin/ledgers/page.tsx src/modules/admin/ui/index.ts
git commit -m "feat(admin): add ledgers list view

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Categories Query, Test, UI, and Page

**Files:**
- Create: `src/modules/admin/application/queries/list-admin-categories.ts`
- Create: `tests/unit/modules/admin/list-admin-categories.test.ts`
- Create: `src/modules/admin/ui/AdminCategoriesList.tsx`
- Create: `src/app/[locale]/(protected)/admin/categories/page.tsx`

- [ ] **Step 1: Write the query**

Create `src/modules/admin/application/queries/list-admin-categories.ts`:

```typescript
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminCategoriesInput } from "@/modules/admin/contract-schemas";
import type {
  AdminCategoryListItem,
  ListAdminCategoriesInput,
  ListAdminCategoriesResult,
} from "@/modules/admin/contracts";
import { entryCategories, ledgers, users } from "@/persistence";

export async function listAdminCategories(
  input: ListAdminCategoriesInput = {}
): Promise<ListAdminCategoriesResult> {
  await requireSuperAdmin();

  const validated = parseListAdminCategoriesInput(input);
  const conditions = [isNull(entryCategories.deletedAt)];

  if (validated.ledgerId != null) {
    conditions.push(eq(entryCategories.ledgerId, validated.ledgerId));
  }

  const rows = await db
    .select({
      id: entryCategories.id,
      ledgerId: entryCategories.ledgerId,
      name: entryCategories.name,
      description: entryCategories.description,
      sortOrder: entryCategories.sortOrder,
      isEditable: entryCategories.isEditable,
      createdAt: entryCategories.createdAt,
    })
    .from(entryCategories)
    .where(and(...conditions))
    .orderBy(asc(entryCategories.sortOrder), desc(entryCategories.createdAt));

  const hasAnyCategories = rows.length > 0;

  const items: AdminCategoryListItem[] = rows.map((row) => ({
    id: row.id,
    ledgerId: row.ledgerId,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    isEditable: row.isEditable,
    createdAt: row.createdAt,
  }));

  return { items, hasAnyCategories };
}
```

- [ ] **Step 2: Write the test**

Create `tests/unit/modules/admin/list-admin-categories.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { entryCategories, ledgers, users } from "@/persistence";
import { listAdminCategories } from "@/modules/admin/queries";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("listAdminCategories", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminCategories()).rejects.toThrow("forbidden");
  });

  it("returns categories sorted by sortOrder", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM entry_categories`);
    await db.run(sql`DELETE FROM ledgers`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(ledgers).values({ id: "ledger-1", userId: "user-1", metadata: {} });

    await db.insert(entryCategories).values([
      {
        id: "cat-b",
        ledgerId: "ledger-1",
        name: "Category B",
        sortOrder: 2,
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "cat-a",
        ledgerId: "ledger-1",
        name: "Category A",
        sortOrder: 1,
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminCategories();

    expect(result.items.map((item) => item.id)).toEqual(["cat-a", "cat-b"]);
    expect(result.items[0]).toMatchObject({ name: "Category A", sortOrder: 1, isEditable: true });
    expect(result.hasAnyCategories).toBe(true);
  });

  it("filters by ledgerId", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(ledgers).values({ id: "ledger-2", userId: "user-1", metadata: {} });
    await db.insert(entryCategories).values({
      id: "cat-other",
      ledgerId: "ledger-2",
      name: "Other Category",
      sortOrder: 0,
      createdAt: new Date(),
    });

    const result = await listAdminCategories({ ledgerId: "ledger-1" });
    expect(result.items.map((item) => item.id)).toEqual(["cat-a", "cat-b"]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/modules/admin/list-admin-categories.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 4: Write the UI component**

Create `src/modules/admin/ui/AdminCategoriesList.tsx`:

```typescript
"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminCategoryListItem } from "@/modules/admin/contracts";

export interface AdminCategoriesListLabels {
  title: string;
  description: string;
  id: string;
  ledgerId: string;
  name: string;
  descriptionColumn: string;
  sortOrder: string;
  isEditable: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  notAvailable: string;
  yes: string;
  no: string;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

export function AdminCategoriesList(props: {
  locale: string;
  items: AdminCategoryListItem[];
  hasAnyCategories: boolean;
  expandedCategoryId?: string | null;
  labels: AdminCategoriesListLabels;
}) {
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    [props.locale]
  );

  if (props.items.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{props.labels.emptyTitle}</h2>
          <p className="text-sm text-muted">{props.labels.emptyDescription}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-text">{props.labels.title}</h2>
        <p className="mt-1 text-sm text-muted">{props.labels.description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.id}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.ledgerId}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.name}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.sortOrder}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.isEditable}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.createdAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const isExpanded = props.expandedCategoryId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="break-all px-6 py-4 text-sm text-text">{item.id}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">{item.ledgerId}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-text">{item.sortOrder}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      {item.isEditable ? props.labels.yes : props.labels.no}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/categories"
                            : `/admin/categories?detail=${encodeURIComponent(item.id)}`
                        }
                        prefetch={false}
                        scroll={false}
                        className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                      >
                        {isExpanded ? props.labels.hideDetails : props.labels.details}
                      </Link>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={7} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.name}</h3>
                            <p className="mt-1 text-sm text-muted">{item.name}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.descriptionColumn}
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                              {item.description ?? props.labels.notAvailable}
                            </p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.icon}</h3>
                            <p className="mt-1 text-sm text-muted">
                              {item.icon ?? props.labels.notAvailable}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write the page**

Create `src/app/[locale]/(protected)/admin/categories/page.tsx`:

```typescript
import { getLocale, getTranslations } from "next-intl/server";
import { listAdminCategories } from "@/modules/admin/queries";
import { AdminCategoriesList } from "@/modules/admin/ui";

interface AdminCategoriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminCategoriesPage({ searchParams }: AdminCategoriesPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminCategories");
  const resolvedSearchParams = await searchParams;

  const expandedCategoryId = getSingleSearchParam(resolvedSearchParams.detail);
  const categories = await listAdminCategories();

  return (
    <AdminCategoriesList
      locale={locale}
      items={categories.items}
      hasAnyCategories={categories.hasAnyCategories}
      expandedCategoryId={expandedCategoryId}
      labels={{
        title: t("title"),
        description: t("description"),
        id: t("id"),
        ledgerId: t("ledgerId"),
        name: t("name"),
        descriptionColumn: t("description"),
        sortOrder: t("sortOrder"),
        isEditable: t("isEditable"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        icon: t("icon"),
        createdAt: t("createdAt"),
        updatedAt: t("updatedAt"),
        deletedAt: t("deletedAt"),
        notAvailable: t("notAvailable"),
        yes: t("yes"),
        no: t("no"),
      }}
    />
  );
}
```

- [ ] **Step 6: Append UI export to barrel**

Append to `src/modules/admin/ui/index.ts`:

```typescript
export { AdminCategoriesList, type AdminCategoriesListLabels } from "./AdminCategoriesList";
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/application/queries/list-admin-categories.ts tests/unit/modules/admin/list-admin-categories.test.ts src/modules/admin/ui/AdminCategoriesList.tsx src/app/[locale]/\(protected\)/admin/categories/page.tsx src/modules/admin/ui/index.ts
git commit -m "feat(admin): add categories list view

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Accounts Query, Test, UI, and Page

**Files:**
- Create: `src/modules/admin/application/queries/list-admin-accounts.ts`
- Create: `tests/unit/modules/admin/list-admin-accounts.test.ts`
- Create: `src/modules/admin/ui/AdminAccountsList.tsx`
- Create: `src/app/[locale]/(protected)/admin/accounts/page.tsx`

- [ ] **Step 1: Write the query**

Create `src/modules/admin/application/queries/list-admin-accounts.ts`:

```typescript
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminAccountsInput } from "@/modules/admin/contract-schemas";
import type {
  AdminAccountListItem,
  ListAdminAccountsInput,
  ListAdminAccountsResult,
} from "@/modules/admin/contracts";
import { accounts, users } from "@/persistence";

export async function listAdminAccounts(
  input: ListAdminAccountsInput = {}
): Promise<ListAdminAccountsResult> {
  await requireSuperAdmin();

  const validated = parseListAdminAccountsInput(input);
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof isNull>)[] = [];

  if (validated.provider != null) {
    conditions.push(eq(accounts.provider, validated.provider));
  }

  const rows = await db
    .select({
      userId: accounts.userId,
      provider: accounts.provider,
      providerAccountId: accounts.providerAccountId,
      type: accounts.type,
      refreshToken: accounts.refresh_token,
      accessToken: accounts.access_token,
      expiresAt: accounts.expires_at,
      tokenType: accounts.token_type,
      scope: accounts.scope,
      idToken: accounts.id_token,
      sessionState: accounts.session_state,
      userEmail: users.email,
    })
    .from(accounts)
    .leftJoin(users, and(eq(accounts.userId, users.id), isNull(users.deletedAt)))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(accounts.provider), asc(accounts.providerAccountId));

  const availableProviderRows = await db
    .selectDistinct({ provider: accounts.provider })
    .from(accounts)
    .orderBy(asc(accounts.provider));

  const items: AdminAccountListItem[] = rows.map((row) => ({
    userId: row.userId,
    userEmail: row.userEmail,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    type: row.type,
  }));

  return {
    items,
    availableProviders: availableProviderRows.map((row) => row.provider),
    hasAnyAccounts: items.length > 0,
  };
}
```

- [ ] **Step 2: Write the test**

Create `tests/unit/modules/admin/list-admin-accounts.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { accounts, users } from "@/persistence";
import { listAdminAccounts } from "@/modules/admin/queries";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("listAdminAccounts", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminAccounts()).rejects.toThrow("forbidden");
  });

  it("returns accounts with user email enrichment", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM accounts`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(accounts).values([
      {
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-123",
        type: "oauth",
      },
      {
        userId: "user-1",
        provider: "github",
        providerAccountId: "github-456",
        type: "oauth",
      },
    ]);

    const result = await listAdminAccounts();

    expect(result.items.map((item) => item.provider)).toEqual(["github", "google"]);
    expect(result.items[0]).toMatchObject({ userEmail: "owner@example.com" });
    expect(result.availableProviders).toEqual(["github", "google"]);
    expect(result.hasAnyAccounts).toBe(true);
  });

  it("filters by provider", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    const result = await listAdminAccounts({ provider: "google" });
    expect(result.items.map((item) => item.provider)).toEqual(["google"]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/modules/admin/list-admin-accounts.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 4: Write the UI component**

Create `src/modules/admin/ui/AdminAccountsList.tsx`:

```typescript
"use client";

import { Fragment } from "react";
import { Link } from "@/i18n/routing";
import type { AdminAccountListItem } from "@/modules/admin/contracts";

export interface AdminAccountsListLabels {
  title: string;
  description: string;
  provider: string;
  providerAccountId: string;
  type: string;
  user: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  userId: string;
  userEmail: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: string;
  tokenType: string;
  scope: string;
  idToken: string;
  sessionState: string;
  notAvailable: string;
}

function truncate(value: string | null, maxLength = 30): string {
  if (value == null) return "—";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function AdminAccountsList(props: {
  items: AdminAccountListItem[];
  hasAnyAccounts: boolean;
  expandedAccountKey?: string | null;
  labels: AdminAccountsListLabels;
}) {
  if (props.items.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{props.labels.emptyTitle}</h2>
          <p className="text-sm text-muted">{props.labels.emptyDescription}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-text">{props.labels.title}</h2>
        <p className="mt-1 text-sm text-muted">{props.labels.description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.provider}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.providerAccountId}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.type}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.user}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.userId}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const accountKey = `${item.provider}:${item.providerAccountId}`;
              const isExpanded = props.expandedAccountKey === accountKey;
              return (
                <Fragment key={accountKey}>
                  <tr className="border-b border-border align-top">
                    <td className="px-6 py-4 text-sm text-text">{item.provider}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {truncate(item.providerAccountId)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">{item.type}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {item.userEmail ?? props.labels.notAvailable}
                    </td>
                    <td className="break-all px-6 py-4 text-sm text-muted">{item.userId}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/accounts"
                            : `/admin/accounts?detail=${encodeURIComponent(accountKey)}`
                        }
                        prefetch={false}
                        scroll={false}
                        className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                      >
                        {isExpanded ? props.labels.hideDetails : props.labels.details}
                      </Link>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={6} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.provider}
                            </h3>
                            <p className="mt-1 text-sm text-muted">{item.provider}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.providerAccountId}
                            </h3>
                            <p className="mt-1 text-sm text-muted">{item.providerAccountId}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.userId}
                            </h3>
                            <p className="mt-1 text-sm text-muted">{item.userId}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.userEmail}
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                              {item.userEmail ?? props.labels.notAvailable}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write the page**

Create `src/app/[locale]/(protected)/admin/accounts/page.tsx`:

```typescript
import { getTranslations } from "next-intl/server";
import { listAdminAccounts } from "@/modules/admin/queries";
import { AdminAccountsList } from "@/modules/admin/ui";

interface AdminAccountsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminAccountsPage({ searchParams }: AdminAccountsPageProps) {
  const t = await getTranslations("AdminAccounts");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    provider: getSingleSearchParam(resolvedSearchParams.provider),
  };

  const expandedAccountKey = getSingleSearchParam(resolvedSearchParams.detail);
  const accounts = await listAdminAccounts(listSearchParams);

  return (
    <AdminAccountsList
      items={accounts.items}
      hasAnyAccounts={accounts.hasAnyAccounts}
      expandedAccountKey={expandedAccountKey}
      labels={{
        title: t("title"),
        description: t("description"),
        provider: t("provider"),
        providerAccountId: t("providerAccountId"),
        type: t("type"),
        user: t("user"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        userId: t("userId"),
        userEmail: t("userEmail"),
        refreshToken: t("refreshToken"),
        accessToken: t("accessToken"),
        expiresAt: t("expiresAt"),
        tokenType: t("tokenType"),
        scope: t("scope"),
        idToken: t("idToken"),
        sessionState: t("sessionState"),
        notAvailable: t("notAvailable"),
      }}
    />
  );
}
```

- [ ] **Step 6: Append UI export to barrel**

Append to `src/modules/admin/ui/index.ts`:

```typescript
export { AdminAccountsList, type AdminAccountsListLabels } from "./AdminAccountsList";
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/application/queries/list-admin-accounts.ts tests/unit/modules/admin/list-admin-accounts.test.ts src/modules/admin/ui/AdminAccountsList.tsx src/app/[locale]/\(protected\)/admin/accounts/page.tsx src/modules/admin/ui/index.ts
git commit -m "feat(admin): add accounts list view

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Service Credentials Query, Test, UI, and Page

**Files:**
- Create: `src/modules/admin/application/queries/list-admin-service-credentials.ts`
- Create: `tests/unit/modules/admin/list-admin-service-credentials.test.ts`
- Create: `src/modules/admin/ui/AdminServiceCredentialsList.tsx`
- Create: `src/app/[locale]/(protected)/admin/service-credentials/page.tsx`

- [ ] **Step 1: Write the query**

Create `src/modules/admin/application/queries/list-admin-service-credentials.ts`:

```typescript
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminServiceCredentialsInput } from "@/modules/admin/contract-schemas";
import type {
  AdminServiceCredentialListItem,
  ListAdminServiceCredentialsInput,
  ListAdminServiceCredentialsResult,
} from "@/modules/admin/contracts";
import { ledgers, serviceCredentials, users } from "@/persistence";

function parseServiceCredentialCursor(cursor: string): { createdAt: Date; id: string } {
  const [createdAtRaw, id, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin service credential cursor", path: ["cursor"] }],
    });
  }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin service credential cursor", path: ["cursor"] }],
    });
  }
  return { createdAt, id };
}

function formatServiceCredentialCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

export async function listAdminServiceCredentials(
  input: ListAdminServiceCredentialsInput = {}
): Promise<ListAdminServiceCredentialsResult> {
  await requireSuperAdmin();

  const validated = parseListAdminServiceCredentialsInput(input);
  const conditions = [isNull(serviceCredentials.deletedAt)];
  const parsedCursor = validated.cursor != null ? parseServiceCredentialCursor(validated.cursor) : null;

  if (validated.ledgerId != null) {
    conditions.push(eq(serviceCredentials.ledgerId, validated.ledgerId));
  }

  if (parsedCursor != null) {
    const cursorCondition = or(
      lt(serviceCredentials.createdAt, parsedCursor.createdAt),
      and(
        eq(serviceCredentials.createdAt, parsedCursor.createdAt),
        lt(serviceCredentials.id, parsedCursor.id)
      )
    );
    if (cursorCondition != null) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      id: serviceCredentials.id,
      key: serviceCredentials.key,
      name: serviceCredentials.name,
      ledgerId: serviceCredentials.ledgerId,
      userEmail: users.email,
      createdAt: serviceCredentials.createdAt,
      lastUsedAt: serviceCredentials.lastUsedAt,
    })
    .from(serviceCredentials)
    .leftJoin(ledgers, and(eq(serviceCredentials.ledgerId, ledgers.id), isNull(ledgers.deletedAt)))
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .where(and(...conditions))
    .orderBy(desc(serviceCredentials.createdAt), desc(serviceCredentials.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = formatServiceCredentialCursor(lastItem);
    }
  }

  const anyCredentialRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(serviceCredentials)
    .where(isNull(serviceCredentials.deletedAt));

  const items: AdminServiceCredentialListItem[] = pageRows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    ledgerId: row.ledgerId,
    userEmail: row.userEmail,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }));

  return {
    items,
    nextCursor,
    hasAnyServiceCredentials: (anyCredentialRows[0]?.count ?? 0) > 0,
  };
}
```

- [ ] **Step 2: Write the test**

Create `tests/unit/modules/admin/list-admin-service-credentials.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { ledgers, serviceCredentials, users } from "@/persistence";
import { listAdminServiceCredentials } from "@/modules/admin/queries";
import { ValidationError } from "@/lib/errors";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("listAdminServiceCredentials", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminServiceCredentials({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns credentials newest first with user email enrichment", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM service_credentials`);
    await db.run(sql`DELETE FROM ledgers`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(ledgers).values({ id: "ledger-1", userId: "user-1", metadata: {} });

    await db.insert(serviceCredentials).values([
      {
        id: "cred-new",
        key: "key-new",
        name: "New Credential",
        ledgerId: "ledger-1",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "cred-old",
        key: "key-old",
        name: "Old Credential",
        ledgerId: "ledger-1",
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminServiceCredentials({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["cred-new", "cred-old"]);
    expect(result.items[0]).toMatchObject({ userEmail: "owner@example.com" });
    expect(result.hasAnyServiceCredentials).toBe(true);
  });

  it("returns nextCursor and supports pagination", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    const firstPage = await listAdminServiceCredentials({ limit: 1 });
    expect(firstPage.items.map((item) => item.id)).toEqual(["cred-new"]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listAdminServiceCredentials({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.id)).toEqual(["cred-old"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await expect(listAdminServiceCredentials({ cursor: "bad" })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/modules/admin/list-admin-service-credentials.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 4: Write the UI component**

Create `src/modules/admin/ui/AdminServiceCredentialsList.tsx`:

```typescript
"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminServiceCredentialListItem } from "@/modules/admin/contracts";

export interface AdminServiceCredentialsListLabels {
  title: string;
  description: string;
  id: string;
  key: string;
  name: string;
  ledgerId: string;
  user: string;
  createdAt: string;
  lastUsedAt: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
  notAvailable: string;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

function truncate(value: string, maxLength = 30): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function buildNextPageHref(nextCursor: string): string {
  return `/admin/service-credentials?cursor=${encodeURIComponent(nextCursor)}`;
}

export function AdminServiceCredentialsList(props: {
  locale: string;
  items: AdminServiceCredentialListItem[];
  hasAnyServiceCredentials: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedCredentialId?: string | null;
  labels: AdminServiceCredentialsListLabels;
}) {
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    [props.locale]
  );

  if (props.items.length === 0) {
    const title = props.hasAnyServiceCredentials
      ? props.labels.filteredEmptyTitle
      : props.labels.emptyTitle;
    const description = props.hasAnyServiceCredentials
      ? props.labels.filteredEmptyDescription
      : props.labels.emptyDescription;
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-text">{props.labels.title}</h2>
        <p className="mt-1 text-sm text-muted">{props.labels.description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[15%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[16%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.name}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.key}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.ledgerId}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.user}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.createdAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const isExpanded = props.expandedCredentialId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="break-all px-6 py-4 text-sm text-text">{item.name}</td>
                    <td className="break-all px-6 py-4 text-sm text-muted">{truncate(item.key)}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">{item.ledgerId}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {item.userEmail ?? item.ledgerId}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/service-credentials"
                            : `/admin/service-credentials?detail=${encodeURIComponent(item.id)}${
                                props.currentCursor
                                  ? `&cursor=${encodeURIComponent(props.currentCursor)}`
                                  : ""
                              }`
                        }
                        prefetch={false}
                        scroll={false}
                        className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                      >
                        {isExpanded ? props.labels.hideDetails : props.labels.details}
                      </Link>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={6} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.id}</h3>
                            <p className="mt-1 text-sm text-muted">{item.id}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.key}</h3>
                            <p className="mt-1 text-sm text-muted">{item.key}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.name}</h3>
                            <p className="mt-1 text-sm text-muted">{item.name}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.ledgerId}
                            </h3>
                            <p className="mt-1 text-sm text-muted">{item.ledgerId}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {props.nextCursor != null ? (
        <div className="border-t border-border px-6 py-4">
          <Link
            href={buildNextPageHref(props.nextCursor)}
            prefetch={false}
            scroll={false}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            {props.labels.nextPage}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Write the page**

Create `src/app/[locale]/(protected)/admin/service-credentials/page.tsx`:

```typescript
import { getLocale, getTranslations } from "next-intl/server";
import { listAdminServiceCredentials } from "@/modules/admin/queries";
import { AdminServiceCredentialsList } from "@/modules/admin/ui";

interface AdminServiceCredentialsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminServiceCredentialsPage({
  searchParams,
}: AdminServiceCredentialsPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminServiceCredentials");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const expandedCredentialId = getSingleSearchParam(resolvedSearchParams.detail);
  const credentials = await listAdminServiceCredentials(listSearchParams);

  return (
    <AdminServiceCredentialsList
      locale={locale}
      items={credentials.items}
      hasAnyServiceCredentials={credentials.hasAnyServiceCredentials}
      nextCursor={credentials.nextCursor}
      currentCursor={getSingleSearchParam(resolvedSearchParams.cursor)}
      expandedCredentialId={expandedCredentialId}
      labels={{
        title: t("title"),
        description: t("description"),
        id: t("id"),
        key: t("key"),
        name: t("name"),
        ledgerId: t("ledgerId"),
        user: t("user"),
        createdAt: t("createdAt"),
        lastUsedAt: t("lastUsedAt"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        filteredEmptyTitle: t("filteredEmptyTitle"),
        filteredEmptyDescription: t("filteredEmptyDescription"),
        nextPage: t("nextPage"),
        notAvailable: t("notAvailable"),
      }}
    />
  );
}
```

- [ ] **Step 6: Append UI export to barrel**

Append to `src/modules/admin/ui/index.ts`:

```typescript
export {
  AdminServiceCredentialsList,
  type AdminServiceCredentialsListLabels,
} from "./AdminServiceCredentialsList";
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/application/queries/list-admin-service-credentials.ts tests/unit/modules/admin/list-admin-service-credentials.test.ts src/modules/admin/ui/AdminServiceCredentialsList.tsx src/app/[locale]/\(protected\)/admin/service-credentials/page.tsx src/modules/admin/ui/index.ts
git commit -m "feat(admin): add service credentials list view

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Currency Rates Query, Test, UI, and Page

**Files:**
- Create: `src/modules/admin/application/queries/list-admin-currency-rates.ts`
- Create: `tests/unit/modules/admin/list-admin-currency-rates.test.ts`
- Create: `src/modules/admin/ui/AdminCurrencyRatesList.tsx`
- Create: `src/app/[locale]/(protected)/admin/currency-rates/page.tsx`

- [ ] **Step 1: Write the query**

Create `src/modules/admin/application/queries/list-admin-currency-rates.ts`:

```typescript
import { and, desc, gte, isNull, like, lte, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminCurrencyRatesInput } from "@/modules/admin/contract-schemas";
import type {
  AdminCurrencyRateListItem,
  ListAdminCurrencyRatesInput,
  ListAdminCurrencyRatesResult,
} from "@/modules/admin/contracts";
import { currencyRates } from "@/persistence";

function parseCurrencyRateCursor(cursor: string): { date: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin currency rate cursor", path: ["cursor"] }],
    });
  }
  return { date: cursor };
}

export async function listAdminCurrencyRates(
  input: ListAdminCurrencyRatesInput = {}
): Promise<ListAdminCurrencyRatesResult> {
  await requireSuperAdmin();

  const validated = parseListAdminCurrencyRatesInput(input);
  const conditions: (ReturnType<typeof like> | ReturnType<typeof gte> | ReturnType<typeof lte>)[] = [];
  const parsedCursor = validated.cursor != null ? parseCurrencyRateCursor(validated.cursor) : null;

  if (validated.range !== "all") {
    const now = new Date();
    const days = validated.range === "24h" ? 1 : validated.range === "7d" ? 7 : 30;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    conditions.push(gte(currencyRates.date, cutoffStr));
  }

  if (parsedCursor != null) {
    conditions.push(lte(currencyRates.date, parsedCursor.date));
  }

  const rows = await db
    .select({
      date: currencyRates.date,
      base: currencyRates.base,
      rates: currencyRates.rates,
      updatedAt: currencyRates.updatedAt,
    })
    .from(currencyRates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(currencyRates.date))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = lastItem.date;
    }
  }

  const anyRateRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(currencyRates);

  const items: AdminCurrencyRateListItem[] = pageRows.map((row) => ({
    date: row.date,
    base: row.base,
    rateCount: Object.keys(row.rates ?? {}).length,
    updatedAt: row.updatedAt,
  }));

  return {
    items,
    nextCursor,
    hasAnyCurrencyRates: (anyRateRows[0]?.count ?? 0) > 0,
  };
}
```

- [ ] **Step 2: Write the test**

Create `tests/unit/modules/admin/list-admin-currency-rates.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { currencyRates } from "@/persistence";
import { listAdminCurrencyRates } from "@/modules/admin/queries";
import { ValidationError } from "@/lib/errors";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("listAdminCurrencyRates", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminCurrencyRates({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns currency rates newest first", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM currency_rates`);

    await db.insert(currencyRates).values([
      {
        date: "2026-03-25",
        base: "EUR",
        rates: { CNY: 7.8, USD: 1.1 },
        updatedAt: new Date(),
      },
      {
        date: "2026-03-24",
        base: "EUR",
        rates: { CNY: 7.7, USD: 1.09 },
        updatedAt: new Date(),
      },
    ]);

    const result = await listAdminCurrencyRates({ limit: 50 });

    expect(result.items.map((item) => item.date)).toEqual(["2026-03-25", "2026-03-24"]);
    expect(result.items[0]).toMatchObject({ base: "EUR", rateCount: 2 });
    expect(result.hasAnyCurrencyRates).toBe(true);
  });

  it("returns nextCursor and supports pagination", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    const firstPage = await listAdminCurrencyRates({ limit: 1 });
    expect(firstPage.items.map((item) => item.date)).toEqual(["2026-03-25"]);
    expect(firstPage.nextCursor).toBe("2026-03-25");

    const secondPage = await listAdminCurrencyRates({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.date)).toEqual(["2026-03-24"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await expect(listAdminCurrencyRates({ cursor: "bad" })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/modules/admin/list-admin-currency-rates.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 4: Write the UI component**

Create `src/modules/admin/ui/AdminCurrencyRatesList.tsx`:

```typescript
"use client";

import { Fragment, useMemo, useState } from "react";
import { Link } from "@/i18n/routing";
import type { AdminCurrencyRateListItem } from "@/modules/admin/contracts";

export interface AdminCurrencyRatesListLabels {
  title: string;
  description: string;
  date: string;
  base: string;
  rateCount: string;
  updatedAt: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
  rates: string;
  showRawData: string;
  hideRawData: string;
  notAvailable: string;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

function buildNextPageHref(nextCursor: string): string {
  return `/admin/currency-rates?cursor=${encodeURIComponent(nextCursor)}`;
}

export function AdminCurrencyRatesList(props: {
  locale: string;
  items: AdminCurrencyRateListItem[];
  hasAnyCurrencyRates: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedDate?: string | null;
  expandedRates?: Record<string, number> | null;
  labels: AdminCurrencyRatesListLabels;
}) {
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    [props.locale]
  );

  if (props.items.length === 0) {
    const title = props.hasAnyCurrencyRates
      ? props.labels.filteredEmptyTitle
      : props.labels.emptyTitle;
    const description = props.hasAnyCurrencyRates
      ? props.labels.filteredEmptyDescription
      : props.labels.emptyDescription;
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-text">{props.labels.title}</h2>
        <p className="mt-1 text-sm text-muted">{props.labels.description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[35%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.date}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.base}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.rateCount}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.updatedAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const isExpanded = props.expandedDate === item.date;
              const rates = isExpanded ? props.expandedRates : null;
              return (
                <Fragment key={item.date}>
                  <tr className="border-b border-border align-top">
                    <td className="px-6 py-4 text-sm text-text">{item.date}</td>
                    <td className="px-6 py-4 text-sm text-text">{item.base}</td>
                    <td className="px-6 py-4 text-sm text-text">{item.rateCount}</td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.updatedAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/currency-rates"
                            : `/admin/currency-rates?detail=${encodeURIComponent(item.date)}${
                                props.currentCursor
                                  ? `&cursor=${encodeURIComponent(props.currentCursor)}`
                                  : ""
                              }`
                        }
                        prefetch={false}
                        scroll={false}
                        className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                      >
                        {isExpanded ? props.labels.hideDetails : props.labels.details}
                      </Link>
                    </td>
                  </tr>
                  {isExpanded && rates != null ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={5} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.date}</h3>
                            <p className="mt-1 text-sm text-muted">{item.date}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.base}</h3>
                            <p className="mt-1 text-sm text-muted">{item.base}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.rates}</h3>
                            <pre className="mt-1 overflow-x-auto rounded-md bg-surface p-3 text-xs text-muted">
                              {JSON.stringify(rates, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {props.nextCursor != null ? (
        <div className="border-t border-border px-6 py-4">
          <Link
            href={buildNextPageHref(props.nextCursor)}
            prefetch={false}
            scroll={false}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            {props.labels.nextPage}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Write the page**

Create `src/app/[locale]/(protected)/admin/currency-rates/page.tsx`:

```typescript
import { getLocale, getTranslations } from "next-intl/server";
import { listAdminCurrencyRates } from "@/modules/admin/queries";
import { AdminCurrencyRatesList } from "@/modules/admin/ui";

interface AdminCurrencyRatesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminCurrencyRatesPage({ searchParams }: AdminCurrencyRatesPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminCurrencyRates");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    range: getSingleSearchParam(resolvedSearchParams.range),
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const expandedDate = getSingleSearchParam(resolvedSearchParams.detail);
  const rates = await listAdminCurrencyRates(listSearchParams);

  return (
    <AdminCurrencyRatesList
      locale={locale}
      items={rates.items}
      hasAnyCurrencyRates={rates.hasAnyCurrencyRates}
      nextCursor={rates.nextCursor}
      currentCursor={getSingleSearchParam(resolvedSearchParams.cursor)}
      expandedDate={expandedDate}
      labels={{
        title: t("title"),
        description: t("description"),
        date: t("date"),
        base: t("base"),
        rateCount: t("rateCount"),
        updatedAt: t("updatedAt"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        filteredEmptyTitle: t("filteredEmptyTitle"),
        filteredEmptyDescription: t("filteredEmptyDescription"),
        nextPage: t("nextPage"),
        rates: t("rates"),
        showRawData: t("showRawData"),
        hideRawData: t("hideRawData"),
        notAvailable: t("notAvailable"),
      }}
    />
  );
}
```

- [ ] **Step 6: Append UI export to barrel**

Append to `src/modules/admin/ui/index.ts`:

```typescript
export {
  AdminCurrencyRatesList,
  type AdminCurrencyRatesListLabels,
} from "./AdminCurrencyRatesList";
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/application/queries/list-admin-currency-rates.ts tests/unit/modules/admin/list-admin-currency-rates.test.ts src/modules/admin/ui/AdminCurrencyRatesList.tsx src/app/[locale]/\(protected\)/admin/currency-rates/page.tsx src/modules/admin/ui/index.ts
git commit -m "feat(admin): add currency rates list view

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: OTP Tokens Query, Test, UI, and Page

**Files:**
- Create: `src/modules/admin/application/queries/list-admin-otp-tokens.ts`
- Create: `tests/unit/modules/admin/list-admin-otp-tokens.test.ts`
- Create: `src/modules/admin/ui/AdminOTPTokensList.tsx`
- Create: `src/app/[locale]/(protected)/admin/otp-tokens/page.tsx`

- [ ] **Step 1: Write the query**

Create `src/modules/admin/application/queries/list-admin-otp-tokens.ts`:

```typescript
import { and, desc, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminOTPTokensInput } from "@/modules/admin/contract-schemas";
import type {
  AdminOTPTokenListItem,
  ListAdminOTPTokensInput,
  ListAdminOTPTokensResult,
} from "@/modules/admin/contracts";
import { otpTokens } from "@/persistence";

function parseOTPTokenCursor(cursor: string): { createdAt: Date; id: string } {
  const [createdAtRaw, id, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin OTP token cursor", path: ["cursor"] }],
    });
  }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin OTP token cursor", path: ["cursor"] }],
    });
  }
  return { createdAt, id };
}

function formatOTPTokenCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

export async function listAdminOTPTokens(
  input: ListAdminOTPTokensInput = {}
): Promise<ListAdminOTPTokensResult> {
  await requireSuperAdmin();

  const validated = parseListAdminOTPTokensInput(input);
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof isNotNull> | ReturnType<typeof isNull>)[] = [];
  const parsedCursor = validated.cursor != null ? parseOTPTokenCursor(validated.cursor) : null;

  if (validated.email != null) {
    conditions.push(eq(otpTokens.email, validated.email));
  }

  if (validated.verified === "yes") {
    conditions.push(isNotNull(otpTokens.verifiedAt));
  } else if (validated.verified === "no") {
    conditions.push(isNull(otpTokens.verifiedAt));
  }

  if (parsedCursor != null) {
    const cursorCondition = or(
      lt(otpTokens.createdAt, parsedCursor.createdAt),
      and(eq(otpTokens.createdAt, parsedCursor.createdAt), lt(otpTokens.id, parsedCursor.id))
    );
    if (cursorCondition != null) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      id: otpTokens.id,
      email: otpTokens.email,
      tokenHash: otpTokens.tokenHash,
      expires: otpTokens.expires,
      attempts: otpTokens.attempts,
      lockedUntil: otpTokens.lockedUntil,
      ipAddress: otpTokens.ipAddress,
      createdAt: otpTokens.createdAt,
      lastAttemptAt: otpTokens.lastAttemptAt,
      verifiedAt: otpTokens.verifiedAt,
    })
    .from(otpTokens)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(otpTokens.createdAt), desc(otpTokens.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = formatOTPTokenCursor(lastItem);
    }
  }

  const anyTokenRows = await db.select({ count: sql<number>`count(*)` }).from(otpTokens);

  const items: AdminOTPTokenListItem[] = pageRows.map((row) => ({
    id: row.id,
    email: row.email,
    expires: row.expires,
    attempts: row.attempts,
    isVerified: row.verifiedAt != null,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  }));

  return {
    items,
    nextCursor,
    hasAnyOTPTokens: (anyTokenRows[0]?.count ?? 0) > 0,
  };
}
```

- [ ] **Step 2: Write the test**

Create `tests/unit/modules/admin/list-admin-otp-tokens.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { otpTokens } from "@/persistence";
import { listAdminOTPTokens } from "@/modules/admin/queries";
import { ValidationError } from "@/lib/errors";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("listAdminOTPTokens", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminOTPTokens({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns OTP tokens newest first", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM otp_tokens`);

    await db.insert(otpTokens).values([
      {
        id: "token-new",
        email: "user@example.com",
        tokenHash: "hash-new",
        expires: new Date("2026-03-26T10:00:00.000Z"),
        attempts: 0,
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "token-old",
        email: "user@example.com",
        tokenHash: "hash-old",
        expires: new Date("2026-03-24T10:00:00.000Z"),
        attempts: 1,
        verifiedAt: new Date("2026-03-25T09:00:00.000Z"),
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminOTPTokens({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["token-new", "token-old"]);
    expect(result.items[0]).toMatchObject({ isVerified: false });
    expect(result.items[1]).toMatchObject({ isVerified: true });
    expect(result.hasAnyOTPTokens).toBe(true);
  });

  it("filters by verified status", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    const verifiedResult = await listAdminOTPTokens({ verified: "yes", limit: 50 });
    expect(verifiedResult.items.map((item) => item.id)).toEqual(["token-old"]);

    const unverifiedResult = await listAdminOTPTokens({ verified: "no", limit: 50 });
    expect(unverifiedResult.items.map((item) => item.id)).toEqual(["token-new"]);
  });

  it("returns nextCursor and supports pagination", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    const firstPage = await listAdminOTPTokens({ limit: 1 });
    expect(firstPage.items.map((item) => item.id)).toEqual(["token-new"]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listAdminOTPTokens({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.id)).toEqual(["token-old"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await expect(listAdminOTPTokens({ cursor: "bad" })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/modules/admin/list-admin-otp-tokens.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 4: Write the UI component**

Create `src/modules/admin/ui/AdminOTPTokensList.tsx`:

```typescript
"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminOTPTokenListItem } from "@/modules/admin/contracts";

export interface AdminOTPTokensListLabels {
  title: string;
  description: string;
  email: string;
  expires: string;
  attempts: string;
  isVerified: string;
  ipAddress: string;
  createdAt: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
  tokenHash: string;
  lockedUntil: string;
  lastAttemptAt: string;
  verifiedAt: string;
  notAvailable: string;
  yes: string;
  no: string;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

function truncate(value: string, maxLength = 20): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function buildNextPageHref(nextCursor: string): string {
  return `/admin/otp-tokens?cursor=${encodeURIComponent(nextCursor)}`;
}

export function AdminOTPTokensList(props: {
  locale: string;
  items: AdminOTPTokenListItem[];
  hasAnyOTPTokens: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedTokenId?: string | null;
  labels: AdminOTPTokensListLabels;
}) {
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    [props.locale]
  );

  if (props.items.length === 0) {
    const title = props.hasAnyOTPTokens
      ? props.labels.filteredEmptyTitle
      : props.labels.emptyTitle;
    const description = props.hasAnyOTPTokens
      ? props.labels.filteredEmptyDescription
      : props.labels.emptyDescription;
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-text">{props.labels.title}</h2>
        <p className="mt-1 text-sm text-muted">{props.labels.description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[15%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.email}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.expires}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.attempts}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.isVerified}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.ipAddress}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.createdAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const isExpanded = props.expandedTokenId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="break-all px-6 py-4 text-sm text-text">{item.email}</td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.expires, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">{item.attempts}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      {item.isVerified ? props.labels.yes : props.labels.no}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {item.ipAddress ?? props.labels.notAvailable}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/otp-tokens"
                            : `/admin/otp-tokens?detail=${encodeURIComponent(item.id)}${
                                props.currentCursor
                                  ? `&cursor=${encodeURIComponent(props.currentCursor)}`
                                  : ""
                              }`
                        }
                        prefetch={false}
                        scroll={false}
                        className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                      >
                        {isExpanded ? props.labels.hideDetails : props.labels.details}
                      </Link>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={7} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.email}</h3>
                            <p className="mt-1 text-sm text-muted">{item.email}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.tokenHash}</h3>
                            <p className="mt-1 text-sm text-muted">{truncate(item.id)}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.expires}</h3>
                            <p className="mt-1 text-sm text-muted">
                              {formatOptionalDate(item.expires, dateFormatter)}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {props.nextCursor != null ? (
        <div className="border-t border-border px-6 py-4">
          <Link
            href={buildNextPageHref(props.nextCursor)}
            prefetch={false}
            scroll={false}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            {props.labels.nextPage}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Write the page**

Create `src/app/[locale]/(protected)/admin/otp-tokens/page.tsx`:

```typescript
import { getLocale, getTranslations } from "next-intl/server";
import { listAdminOTPTokens } from "@/modules/admin/queries";
import { AdminOTPTokensList } from "@/modules/admin/ui";

interface AdminOTPTokensPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminOTPTokensPage({ searchParams }: AdminOTPTokensPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminOTPTokens");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    email: getSingleSearchParam(resolvedSearchParams.email),
    verified: getSingleSearchParam(resolvedSearchParams.verified) as "yes" | "no" | undefined,
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const expandedTokenId = getSingleSearchParam(resolvedSearchParams.detail);
  const tokens = await listAdminOTPTokens(listSearchParams);

  return (
    <AdminOTPTokensList
      locale={locale}
      items={tokens.items}
      hasAnyOTPTokens={tokens.hasAnyOTPTokens}
      nextCursor={tokens.nextCursor}
      currentCursor={getSingleSearchParam(resolvedSearchParams.cursor)}
      expandedTokenId={expandedTokenId}
      labels={{
        title: t("title"),
        description: t("description"),
        email: t("email"),
        expires: t("expires"),
        attempts: t("attempts"),
        isVerified: t("isVerified"),
        ipAddress: t("ipAddress"),
        createdAt: t("createdAt"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        filteredEmptyTitle: t("filteredEmptyTitle"),
        filteredEmptyDescription: t("filteredEmptyDescription"),
        nextPage: t("nextPage"),
        tokenHash: t("tokenHash"),
        lockedUntil: t("lockedUntil"),
        lastAttemptAt: t("lastAttemptAt"),
        verifiedAt: t("verifiedAt"),
        notAvailable: t("notAvailable"),
        yes: t("yes"),
        no: t("no"),
      }}
    />
  );
}
```

- [ ] **Step 6: Append UI export to barrel**

Append to `src/modules/admin/ui/index.ts`:

```typescript
export { AdminOTPTokensList, type AdminOTPTokensListLabels } from "./AdminOTPTokensList";
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/application/queries/list-admin-otp-tokens.ts tests/unit/modules/admin/list-admin-otp-tokens.test.ts src/modules/admin/ui/AdminOTPTokensList.tsx src/app/[locale]/\(protected\)/admin/otp-tokens/page.tsx src/modules/admin/ui/index.ts
git commit -m "feat(admin): add OTP tokens list view

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Overview Dashboard Query, Test, UI, and Page

**Files:**
- Create: `src/modules/admin/application/queries/get-admin-overview-stats.ts`
- Create: `tests/unit/modules/admin/get-admin-overview-stats.test.ts`
- Create: `src/modules/admin/ui/AdminOverviewStatCard.tsx`
- Modify: `src/modules/admin/ui/AdminHome.tsx`
- Modify: `src/app/[locale]/(protected)/admin/page.tsx`

- [ ] **Step 1: Write the query**

Create `src/modules/admin/application/queries/get-admin-overview-stats.ts`:

```typescript
import { isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import type { AdminOverviewStats } from "@/modules/admin/contracts";
import {
  accounts,
  currencyRates,
  entryCategories,
  ledgerEntries,
  ledgers,
  otpTokens,
  serviceCredentials,
  sourceDocuments,
  taskRuns,
  users,
} from "@/persistence";

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  await requireSuperAdmin();

  const [
    totalUsers,
    totalLedgers,
    totalEntries,
    totalSourceDocuments,
    totalTasks,
    totalCategories,
    totalServiceCredentials,
    totalAccounts,
    totalCurrencyRates,
    totalOTPTokens,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users).where(isNull(users.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(ledgers).where(isNull(ledgers.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(ledgerEntries).where(isNull(ledgerEntries.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(sourceDocuments).where(isNull(sourceDocuments.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(taskRuns).where(isNull(taskRuns.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(entryCategories).where(isNull(entryCategories.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(serviceCredentials).where(isNull(serviceCredentials.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(accounts),
    db.select({ count: sql<number>`count(*)` }).from(currencyRates),
    db.select({ count: sql<number>`count(*)` }).from(otpTokens),
  ]);

  return {
    totalUsers: totalUsers[0]?.count ?? 0,
    totalLedgers: totalLedgers[0]?.count ?? 0,
    totalEntries: totalEntries[0]?.count ?? 0,
    totalSourceDocuments: totalSourceDocuments[0]?.count ?? 0,
    totalTasks: totalTasks[0]?.count ?? 0,
    totalCategories: totalCategories[0]?.count ?? 0,
    totalServiceCredentials: totalServiceCredentials[0]?.count ?? 0,
    totalAccounts: totalAccounts[0]?.count ?? 0,
    totalCurrencyRates: totalCurrencyRates[0]?.count ?? 0,
    totalOTPTokens: totalOTPTokens[0]?.count ?? 0,
  };
}
```

- [ ] **Step 2: Write the test**

Create `tests/unit/modules/admin/get-admin-overview-stats.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { getAdminOverviewStats } from "@/modules/admin/queries";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("getAdminOverviewStats", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(getAdminOverviewStats()).rejects.toThrow("forbidden");
  });

  it("returns correct counts for all entities", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM otp_tokens`);
    await db.run(sql`DELETE FROM currency_rates`);
    await db.run(sql`DELETE FROM accounts`);
    await db.run(sql`DELETE FROM service_credentials`);
    await db.run(sql`DELETE FROM entry_categories`);
    await db.run(sql`DELETE FROM task_runs`);
    await db.run(sql`DELETE FROM source_documents`);
    await db.run(sql`DELETE FROM ledger_entries`);
    await db.run(sql`DELETE FROM ledgers`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(ledgers).values({ id: "ledger-1", userId: "user-1", metadata: {} });

    await db.insert(entryCategories).values({
      id: "cat-1",
      ledgerId: "ledger-1",
      name: "Food",
      sortOrder: 0,
      createdAt: new Date(),
    });

    await db.insert(serviceCredentials).values({
      id: "cred-1",
      key: "key-1",
      name: "API Key",
      ledgerId: "ledger-1",
      createdAt: new Date(),
    });

    await db.insert(currencyRates).values({
      date: "2026-03-25",
      base: "EUR",
      rates: { CNY: 7.8 },
      updatedAt: new Date(),
    });

    await db.insert(otpTokens).values({
      id: "otp-1",
      email: "user@example.com",
      tokenHash: "hash",
      expires: new Date(),
      createdAt: new Date(),
    });

    const result = await getAdminOverviewStats();

    expect(result.totalUsers).toBe(1);
    expect(result.totalLedgers).toBe(1);
    expect(result.totalCategories).toBe(1);
    expect(result.totalServiceCredentials).toBe(1);
    expect(result.totalAccounts).toBe(0);
    expect(result.totalCurrencyRates).toBe(1);
    expect(result.totalOTPTokens).toBe(1);
    expect(result.totalEntries).toBe(0);
    expect(result.totalSourceDocuments).toBe(0);
    expect(result.totalTasks).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/modules/admin/get-admin-overview-stats.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 4: Write the stat card component**

Create `src/modules/admin/ui/AdminOverviewStatCard.tsx`:

```typescript
import type { ReactNode } from "react";
import { Link } from "@/i18n/routing";

export function AdminOverviewStatCard(props: {
  href: string;
  label: string;
  value: number;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={props.href}
      className="flex flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface2"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{props.label}</span>
        {props.icon != null ? <span className="text-muted">{props.icon}</span> : null}
      </div>
      <p className="mt-3 text-3xl font-semibold text-text">{props.value.toLocaleString()}</p>
    </Link>
  );
}
```

- [ ] **Step 5: Rewrite AdminHome as dashboard**

Rewrite `src/modules/admin/ui/AdminHome.tsx`:

```typescript
import type { AdminOverviewStats } from "@/modules/admin/contracts";
import { AdminOverviewStatCard } from "./AdminOverviewStatCard";

export interface AdminHomeLabels {
  title: string;
  description: string;
  totalUsers: string;
  totalLedgers: string;
  totalEntries: string;
  totalSourceDocuments: string;
  totalTasks: string;
  totalCategories: string;
  totalServiceCredentials: string;
  totalAccounts: string;
  totalCurrencyRates: string;
  totalOTPTokens: string;
}

export function AdminHome(props: {
  stats: AdminOverviewStats;
  labels: AdminHomeLabels;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-xl font-semibold text-text">{props.labels.title}</h2>
          <p className="text-sm leading-6 text-muted">{props.labels.description}</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <AdminOverviewStatCard
          href="/admin/users"
          label={props.labels.totalUsers}
          value={props.stats.totalUsers}
        />
        <AdminOverviewStatCard
          href="/admin/ledgers"
          label={props.labels.totalLedgers}
          value={props.stats.totalLedgers}
        />
        <AdminOverviewStatCard
          href="/admin/entries"
          label={props.labels.totalEntries}
          value={props.stats.totalEntries}
        />
        <AdminOverviewStatCard
          href="/admin/source-documents"
          label={props.labels.totalSourceDocuments}
          value={props.stats.totalSourceDocuments}
        />
        <AdminOverviewStatCard
          href="/admin/tasks"
          label={props.labels.totalTasks}
          value={props.stats.totalTasks}
        />
        <AdminOverviewStatCard
          href="/admin/categories"
          label={props.labels.totalCategories}
          value={props.stats.totalCategories}
        />
        <AdminOverviewStatCard
          href="/admin/service-credentials"
          label={props.labels.totalServiceCredentials}
          value={props.stats.totalServiceCredentials}
        />
        <AdminOverviewStatCard
          href="/admin/accounts"
          label={props.labels.totalAccounts}
          value={props.stats.totalAccounts}
        />
        <AdminOverviewStatCard
          href="/admin/currency-rates"
          label={props.labels.totalCurrencyRates}
          value={props.stats.totalCurrencyRates}
        />
        <AdminOverviewStatCard
          href="/admin/otp-tokens"
          label={props.labels.totalOTPTokens}
          value={props.stats.totalOTPTokens}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update the overview page**

Rewrite `src/app/[locale]/(protected)/admin/page.tsx`:

```typescript
import { getTranslations } from "next-intl/server";
import { getAdminOverviewStats } from "@/modules/admin/queries";
import { AdminHome } from "@/modules/admin/ui";

export default async function AdminPage() {
  const t = await getTranslations("AdminOverview");
  const stats = await getAdminOverviewStats();

  return (
    <AdminHome
      stats={stats}
      labels={{
        title: t("title"),
        description: t("description"),
        totalUsers: t("totalUsers"),
        totalLedgers: t("totalLedgers"),
        totalEntries: t("totalEntries"),
        totalSourceDocuments: t("totalSourceDocuments"),
        totalTasks: t("totalTasks"),
        totalCategories: t("totalCategories"),
        totalServiceCredentials: t("totalServiceCredentials"),
        totalAccounts: t("totalAccounts"),
        totalCurrencyRates: t("totalCurrencyRates"),
        totalOTPTokens: t("totalOTPTokens"),
      }}
    />
  );
}
```

- [ ] **Step 7: Append UI exports to barrel**

Append to `src/modules/admin/ui/index.ts`:

```typescript
export { AdminOverviewStatCard } from "./AdminOverviewStatCard";
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/admin/application/queries/get-admin-overview-stats.ts tests/unit/modules/admin/get-admin-overview-stats.test.ts src/modules/admin/ui/AdminOverviewStatCard.tsx src/modules/admin/ui/AdminHome.tsx src/app/[locale]/\(protected\)/admin/page.tsx src/modules/admin/ui/index.ts
git commit -m "feat(admin): add overview dashboard with entity count statistics

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Layout Navigation, i18n Translations, and Final Integration

**Files:**
- Modify: `src/app/[locale]/(protected)/admin/layout.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `src/modules/admin/ui/index.ts`

- [ ] **Step 1: Update layout nav items**

Modify `src/app/[locale]/(protected)/admin/layout.tsx`, append new nav items to the existing `navItems` array after `systemConfig`:

```typescript
navItems={[
  { href: "/admin", label: t("overview") },
  { href: "/admin/users", label: t("users") },
  { href: "/admin/ledgers", label: t("ledgers") },
  { href: "/admin/categories", label: t("categories") },
  { href: "/admin/source-documents", label: t("sourceDocuments") },
  { href: "/admin/entries", label: t("entries") },
  { href: "/admin/tasks", label: t("tasks") },
  { href: "/admin/accounts", label: t("accounts") },
  { href: "/admin/service-credentials", label: t("serviceCredentials") },
  { href: "/admin/currency-rates", label: t("currencyRates") },
  { href: "/admin/otp-tokens", label: t("otpTokens") },
  { href: "/admin/system-config", label: t("systemConfig") },
]}
```

Also add new translation keys to the `getTranslations("Admin")` call context. Since the layout uses `t("kicker")`, `t("title")`, etc., add the following to both `messages/en.json` and `messages/zh.json` inside the `"Admin"` object:

**en.json additions inside `"Admin"`:**
```json
"ledgers": "Ledgers",
"categories": "Categories",
"accounts": "Accounts",
"serviceCredentials": "Service Credentials",
"currencyRates": "Currency Rates",
"otpTokens": "OTP Tokens",
"homeTitle": "Admin Overview",
"homeDescription": "System-wide statistics and navigation to all entity views."
```

**zh.json additions inside `"Admin"`:**
```json
"ledgers": "账本",
"categories": "分类",
"accounts": "账户",
"serviceCredentials": "API 密钥",
"currencyRates": "汇率",
"otpTokens": "OTP 令牌",
"homeTitle": "后台概览",
"homeDescription": "系统全局统计和各实体查看入口。"
```

- [ ] **Step 2: Add new entity translations to en.json**

Add the following top-level objects to `messages/en.json` (after `"AdminUnauthorized"`):

```json
"AdminLedgers": {
  "title": "Ledgers",
  "description": "Read-only visibility into all ledgers.",
  "id": "ID",
  "user": "User",
  "createdAt": "Created",
  "mainCurrency": "Main Currency",
  "details": "View details",
  "detailsColumn": "Details",
  "hideDetails": "Hide details",
  "emptyTitle": "No ledgers yet",
  "emptyDescription": "Ledgers will appear here once users create them.",
  "filteredEmptyTitle": "No ledgers match the current filters",
  "filteredEmptyDescription": "Try clearing one or more filters.",
  "nextPage": "Load older ledgers",
  "notAvailable": "—",
  "ledgerId": "Ledger ID",
  "userId": "User ID",
  "userEmail": "User Email",
  "metadata": "Metadata",
  "updatedAt": "Updated At",
  "deletedAt": "Deleted At",
  "showRawData": "Show raw data",
  "hideRawData": "Hide raw data"
},
"AdminCategories": {
  "title": "Categories",
  "description": "Read-only visibility into all entry categories.",
  "id": "ID",
  "ledgerId": "Ledger ID",
  "name": "Name",
  "description": "Description",
  "sortOrder": "Sort Order",
  "isEditable": "Editable",
  "details": "View details",
  "detailsColumn": "Details",
  "hideDetails": "Hide details",
  "emptyTitle": "No categories yet",
  "emptyDescription": "Categories will appear here once they are created.",
  "icon": "Icon",
  "createdAt": "Created",
  "updatedAt": "Updated At",
  "deletedAt": "Deleted At",
  "notAvailable": "—",
  "yes": "Yes",
  "no": "No"
},
"AdminAccounts": {
  "title": "Accounts",
  "description": "Read-only visibility into all OAuth accounts.",
  "provider": "Provider",
  "providerAccountId": "Provider Account ID",
  "type": "Type",
  "user": "User",
  "details": "View details",
  "detailsColumn": "Details",
  "hideDetails": "Hide details",
  "emptyTitle": "No accounts yet",
  "emptyDescription": "OAuth accounts will appear here once users link them.",
  "userId": "User ID",
  "userEmail": "User Email",
  "refreshToken": "Refresh Token",
  "accessToken": "Access Token",
  "expiresAt": "Expires At",
  "tokenType": "Token Type",
  "scope": "Scope",
  "idToken": "ID Token",
  "sessionState": "Session State",
  "notAvailable": "—"
},
"AdminServiceCredentials": {
  "title": "Service Credentials",
  "description": "Read-only visibility into all API keys.",
  "id": "ID",
  "key": "Key",
  "name": "Name",
  "ledgerId": "Ledger ID",
  "user": "User",
  "createdAt": "Created",
  "lastUsedAt": "Last Used",
  "details": "View details",
  "detailsColumn": "Details",
  "hideDetails": "Hide details",
  "emptyTitle": "No credentials yet",
  "emptyDescription": "API keys will appear here once they are created.",
  "filteredEmptyTitle": "No credentials match the current filters",
  "filteredEmptyDescription": "Try clearing one or more filters.",
  "nextPage": "Load older credentials",
  "notAvailable": "—"
},
"AdminCurrencyRates": {
  "title": "Currency Rates",
  "description": "Read-only visibility into historical exchange rates.",
  "date": "Date",
  "base": "Base",
  "rateCount": "Rate Count",
  "updatedAt": "Updated",
  "details": "View details",
  "detailsColumn": "Details",
  "hideDetails": "Hide details",
  "emptyTitle": "No rates yet",
  "emptyDescription": "Currency rates will appear here once they are fetched.",
  "filteredEmptyTitle": "No rates match the current filters",
  "filteredEmptyDescription": "Try clearing one or more filters.",
  "nextPage": "Load older rates",
  "rates": "Rates",
  "showRawData": "Show raw data",
  "hideRawData": "Hide raw data",
  "notAvailable": "—"
},
"AdminOTPTokens": {
  "title": "OTP Tokens",
  "description": "Read-only visibility into OTP token history.",
  "email": "Email",
  "expires": "Expires",
  "attempts": "Attempts",
  "isVerified": "Verified",
  "ipAddress": "IP Address",
  "createdAt": "Created",
  "details": "View details",
  "detailsColumn": "Details",
  "hideDetails": "Hide details",
  "emptyTitle": "No tokens yet",
  "emptyDescription": "OTP tokens will appear here once they are generated.",
  "filteredEmptyTitle": "No tokens match the current filters",
  "filteredEmptyDescription": "Try clearing one or more filters.",
  "nextPage": "Load older tokens",
  "tokenHash": "Token Hash",
  "lockedUntil": "Locked Until",
  "lastAttemptAt": "Last Attempt",
  "verifiedAt": "Verified At",
  "notAvailable": "—",
  "yes": "Yes",
  "no": "No"
},
"AdminOverview": {
  "title": "Admin Overview",
  "description": "System-wide statistics at a glance.",
  "totalUsers": "Total Users",
  "totalLedgers": "Total Ledgers",
  "totalEntries": "Total Entries",
  "totalSourceDocuments": "Total Source Documents",
  "totalTasks": "Total Tasks",
  "totalCategories": "Total Categories",
  "totalServiceCredentials": "Total API Keys",
  "totalAccounts": "Total Accounts",
  "totalCurrencyRates": "Total Rate Records",
  "totalOTPTokens": "Total OTP Tokens"
}
```

- [ ] **Step 3: Add new entity translations to zh.json**

Add the corresponding Chinese translations to `messages/zh.json` (same structure as en.json, with Chinese values):

```json
"AdminLedgers": {
  "title": "账本",
  "description": "只读查看系统中的所有账本。",
  "id": "ID",
  "user": "用户",
  "createdAt": "创建时间",
  "mainCurrency": "主币种",
  "details": "查看详情",
  "detailsColumn": "详情",
  "hideDetails": "收起详情",
  "emptyTitle": "还没有账本",
  "emptyDescription": "用户创建账本后，这里会显示出来。",
  "filteredEmptyTitle": "当前筛选条件下没有账本",
  "filteredEmptyDescription": "请尝试清除一个或多个筛选条件。",
  "nextPage": "加载更早账本",
  "notAvailable": "—",
  "ledgerId": "账本 ID",
  "userId": "用户 ID",
  "userEmail": "用户邮箱",
  "metadata": "元数据",
  "updatedAt": "更新时间",
  "deletedAt": "删除时间",
  "showRawData": "展开原始数据",
  "hideRawData": "收起原始数据"
},
"AdminCategories": {
  "title": "分类",
  "description": "只读查看所有分录分类。",
  "id": "ID",
  "ledgerId": "账本 ID",
  "name": "名称",
  "description": "描述",
  "sortOrder": "排序",
  "isEditable": "可编辑",
  "details": "查看详情",
  "detailsColumn": "详情",
  "hideDetails": "收起详情",
  "emptyTitle": "还没有分类",
  "emptyDescription": "分类创建后，这里会显示出来。",
  "icon": "图标",
  "createdAt": "创建时间",
  "updatedAt": "更新时间",
  "deletedAt": "删除时间",
  "notAvailable": "—",
  "yes": "是",
  "no": "否"
},
"AdminAccounts": {
  "title": "账户",
  "description": "只读查看所有 OAuth 账户。",
  "provider": "提供商",
  "providerAccountId": "提供商账户 ID",
  "type": "类型",
  "user": "用户",
  "details": "查看详情",
  "detailsColumn": "详情",
  "hideDetails": "收起详情",
  "emptyTitle": "还没有账户",
  "emptyDescription": "用户关联 OAuth 账户后，这里会显示出来。",
  "userId": "用户 ID",
  "userEmail": "用户邮箱",
  "refreshToken": "Refresh Token",
  "accessToken": "Access Token",
  "expiresAt": "过期时间",
  "tokenType": "Token 类型",
  "scope": "Scope",
  "idToken": "ID Token",
  "sessionState": "Session State",
  "notAvailable": "—"
},
"AdminServiceCredentials": {
  "title": "API 密钥",
  "description": "只读查看所有 API 密钥。",
  "id": "ID",
  "key": "密钥",
  "name": "名称",
  "ledgerId": "账本 ID",
  "user": "用户",
  "createdAt": "创建时间",
  "lastUsedAt": "最后使用时间",
  "details": "查看详情",
  "detailsColumn": "详情",
  "hideDetails": "收起详情",
  "emptyTitle": "还没有 API 密钥",
  "emptyDescription": "API 密钥创建后，这里会显示出来。",
  "filteredEmptyTitle": "当前筛选条件下没有 API 密钥",
  "filteredEmptyDescription": "请尝试清除一个或多个筛选条件。",
  "nextPage": "加载更早密钥",
  "notAvailable": "—"
},
"AdminCurrencyRates": {
  "title": "汇率",
  "description": "只读查看历史汇率数据。",
  "date": "日期",
  "base": "基准",
  "rateCount": "汇率数量",
  "updatedAt": "更新时间",
  "details": "查看详情",
  "detailsColumn": "详情",
  "hideDetails": "收起详情",
  "emptyTitle": "还没有汇率数据",
  "emptyDescription": "汇率数据获取后，这里会显示出来。",
  "filteredEmptyTitle": "当前筛选条件下没有汇率数据",
  "filteredEmptyDescription": "请尝试清除一个或多个筛选条件。",
  "nextPage": "加载更早汇率",
  "rates": "汇率",
  "showRawData": "展开原始数据",
  "hideRawData": "收起原始数据",
  "notAvailable": "—"
},
"AdminOTPTokens": {
  "title": "OTP 令牌",
  "description": "只读查看 OTP 令牌历史。",
  "email": "邮箱",
  "expires": "过期时间",
  "attempts": "尝试次数",
  "isVerified": "已验证",
  "ipAddress": "IP 地址",
  "createdAt": "创建时间",
  "details": "查看详情",
  "detailsColumn": "详情",
  "hideDetails": "收起详情",
  "emptyTitle": "还没有 OTP 令牌",
  "emptyDescription": "OTP 令牌生成后，这里会显示出来。",
  "filteredEmptyTitle": "当前筛选条件下没有 OTP 令牌",
  "filteredEmptyDescription": "请尝试清除一个或多个筛选条件。",
  "nextPage": "加载更早令牌",
  "tokenHash": "Token Hash",
  "lockedUntil": "锁定截止时间",
  "lastAttemptAt": "最后尝试时间",
  "verifiedAt": "验证时间",
  "notAvailable": "—",
  "yes": "是",
  "no": "否"
},
"AdminOverview": {
  "title": "后台概览",
  "description": "系统全局统计一览。",
  "totalUsers": "总用户数",
  "totalLedgers": "总账本数",
  "totalEntries": "总分录数",
  "totalSourceDocuments": "总源单据数",
  "totalTasks": "总任务数",
  "totalCategories": "总分类数",
  "totalServiceCredentials": "总 API 密钥数",
  "totalAccounts": "总账户数",
  "totalCurrencyRates": "总汇率记录数",
  "totalOTPTokens": "总 OTP 令牌数"
}
```

- [ ] **Step 4: Run full admin test suite**

Run: `npx vitest run tests/unit/modules/admin/`
Expected: All existing + new tests PASS

- [ ] **Step 5: Run build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/\(protected\)/admin/layout.tsx messages/en.json messages/zh.json
git commit -m "feat(admin): add navigation and i18n for all new entity views

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Ledgers list view: Task 2
- Categories list view: Task 3
- Accounts list view: Task 4
- Service Credentials list view: Task 5
- Currency Rates list view: Task 6
- OTP Tokens list view: Task 7
- Overview dashboard: Task 8
- Layout nav + i18n: Task 9
- All covered.

**2. Placeholder scan:**
- No TBD, TODO, or "implement later" found
- No "similar to Task N" references
- All steps contain complete code

**3. Type consistency:**
- `AdminLedgerRange` used consistently across ledgers, currency rates
- Cursor function names follow pattern: `parse{Entity}Cursor`, `format{Entity}Cursor`
- All type names match between contracts, queries, and UI components

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-admin-data-viewer.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

# Simplify SSR and Caching - Implementation Plan

> **For agentic workers:** REQUIRED: Use @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the SSR architecture by removing unnecessary server-side rendering from pages that don't need it, keeping only the LedgerPage SSR for first-screen experience.

**Architecture:** Convert simple pages (settings, account) to client-side rendering with "use client". Keep LedgerPage SSR as it benefits from first-screen data preloading.

**Tech Stack:** Next.js 16 App Router, React, TypeScript

---

## Chunk 1: Convert Settings Pages to CSR

### Task 1.1: Convert main settings page

**Files:**
- Modify: `src/app/[locale]/(protected)/settings/page.tsx`

- [ ] **Step 1: Read current implementation**

Run: `cat src/app/[locale]/(protected)/settings/page.tsx`

Expected: Async server component that fetches user data

- [ ] **Step 2: Convert to client component**

Replace the entire file with:
```typescript
"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { getUserAction } from "@/features/auth/server/actions";
import { SettingsPageClient } from "./SettingsPageClient";

export default function SettingsPage() {
  const { data: session } = useSession();
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => getUserAction(),
    enabled: !!session?.user?.id,
  });

  if (!user) {
    return <div>Loading...</div>;
  }

  return <SettingsPageClient user={user} />;
}
```

Note: If `SettingsPageClient` doesn't exist, the component can be inline.

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/(protected)/settings/page.tsx
git commit -m "refactor: convert settings page to client-side rendering

Settings page doesn't benefit significantly from SSR. Converting to
CSR simplifies the architecture and reduces server load."
```

---

### Task 1.2: Convert account settings page

**Files:**
- Modify: `src/app/[locale]/(protected)/settings/account/page.tsx`

- [ ] **Step 1: Read current implementation**

Run: `cat src/app/[locale]/(protected)/settings/account/page.tsx`

- [ ] **Step 2: Convert to client component**

Add `"use client";` at the top and convert async data fetching to useQuery pattern similar to Task 1.1.

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/(protected)/settings/account/page.tsx
git commit -m "refactor: convert account settings page to CSR"
```

---

### Task 1.3: Convert ledger settings page

**Files:**
- Modify: `src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx`

- [ ] **Step 1: Read current implementation**

Run: `cat src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx`

- [ ] **Step 2: Convert to client component**

Add `"use client";` and convert to useQuery for data fetching.

Key changes:
- Remove `async` from function
- Remove direct `getLedgerAction` call
- Use `useQuery` with `queryKeys.ledger(ledgerId)`

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx
git commit -m "refactor: convert ledger settings page to CSR"
```

---

## Chunk 2: Convert Home Page to CSR

### Task 2.1: Convert protected home page

**Files:**
- Modify: `src/app/[locale]/(protected)/page.tsx`

- [ ] **Step 1: Read current implementation**

Run: `cat src/app/[locale]/(protected)/page.tsx`

Expected: Async server component that fetches ledgers and redirects

- [ ] **Step 2: Convert to client component with redirect**

Replace with:
```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { getLedgersAction } from "@/features/ledger/server/actions";

export default function HomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { data: ledgers } = useQuery({
    queryKey: ["ledgers"],
    queryFn: () => getLedgersAction(),
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (ledgers && ledgers.length > 0) {
      router.push(`/ledger/${ledgers[0].id}`);
    } else if (ledgers?.length === 0) {
      router.push("/onboarding");
    }
  }, [ledgers, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/(protected)/page.tsx
git commit -m "refactor: convert home page to CSR

Home page only redirects to first ledger or onboarding. No benefit
from SSR, and CSR allows for smoother client-side navigation."
```

---

## Chunk 3: Simplify LedgerPage SSR (Optional)

### Task 3.1: Reduce over-fetching in LedgerPage

**Files:**
- Modify: `src/app/[locale]/(protected)/ledger/[id]/page.tsx`

- [ ] **Step 1: Read current implementation**

Run: `cat src/app/[locale]/(protected)/ledger/[id]/page.tsx`

Expected: Multiple `prefetchQuery` calls for different data

- [ ] **Step 2: Reduce to essential prefetches only**

Keep only:
- Ledger data (essential for page header)
- Categories (needed for settings)

Remove or make lazy:
- Source documents (large dataset, can load client-side)
- Task queue (real-time data, will refresh anyway)

Example:
```typescript
// Only prefetch essential data
await Promise.all([
  queryClient.prefetchQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
  }),
  queryClient.prefetchQuery({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    staleTime: STALE_TIME,
  }),
]);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/(protected)/ledger/[id]/page.tsx
git commit -m "refactor: reduce LedgerPage SSR prefetching

Only prefetch essential data (ledger, categories). Other data like
source documents and task queue are better loaded client-side with
smart polling."
```

---

## Chunk 4: Run Tests and Verify

### Task 4.1: Run test suite

- [ ] **Step 1: Run tests**

Run: `npm run test:run`

Expected: All tests pass

- [ ] **Step 2: Check for hydration errors**

Run: `npm run dev`

Open browser to:
- http://localhost:3000/settings
- http://localhost:3000/settings/account
- http://localhost:3000/ledger/[id]/settings

Check console for hydration mismatch errors.

- [ ] **Step 3: Build and check**

Run: `npm run build`

Expected: Build succeeds

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "refactor: simplify SSR architecture

Converted to CSR:
- /settings
- /settings/account
- /ledger/[id]/settings
- / (home page)

Simplified LedgerPage SSR:
- Reduced prefetched data to essentials only

Results:
- Reduced server load
- Simpler data flow
- Better separation of concerns"
```

---

## Verification Checklist

- [ ] **Page load verification:**
  1. Navigate to each converted page
  2. Verify no console errors
  3. Verify no hydration warnings
  4. Verify data loads correctly

- [ ] **Navigation verification:**
  1. Navigate between pages
  2. Verify smooth client-side transitions
  3. Verify data persists correctly

- [ ] **SSR verification:**
  1. View page source (Ctrl+U)
  2. CSR pages should have minimal HTML
  3. LedgerPage should still have pre-rendered content

---

## Rollback Plan

If issues occur:

1. **Revert commits:**
   ```bash
   git revert HEAD~4..HEAD
   ```

2. **Quick fixes:**
   - If hydration errors: Check for localStorage/sessionStorage access
   - If data not loading: Check useQuery configuration
   - If build fails: Check for missing "use client" directives

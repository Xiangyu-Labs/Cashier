# Localized Default Ledger Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan.

**Goal:** Make default ledger initialization language-aware, creating English categories/settings for English users and Chinese for Chinese users.

**Architecture:** Extend `default-ledger.ts` to export locale-specific configurations, modify `createDefaultLedgerForUser` to accept and use user's locale preference.

**Tech Stack:** TypeScript, next-intl, Drizzle ORM

---

## Overview

Currently, the default ledger is hardcoded with Chinese categories (餐饮, 日用, etc.) and Chinese-centric settings (aiLanguage: "zh-CN", mainCurrency: "CNY"). This enhancement will:

1. Create locale-specific default configurations
2. Pass user's locale during registration/initialization
3. Create appropriate ledger based on user's language preference

---

## Chunk 1: Extend Default Ledger Configuration

### Task 1.1: Create Localized Default Ledger Configurations

**Files:**
- Modify: `src/config/default-ledger.ts`

**Current State:**
```typescript
export const defaultLedger = {
    settings: { aiLanguage: "zh-CN", currencies: ["USD", "CNY"], mainCurrency: "CNY", ... },
    categories: [{ name: "餐饮", ... }, { name: "日用", ... }, ...]
};
```

**Changes Required:**

- [ ] **Step 1: Create separate configurations for each locale**

Replace the single export with locale-specific configurations:

```typescript
// Chinese (zh) configuration
const zhLedger = {
    settings: {
        aiLanguage: "zh-CN",
        currencies: ["CNY", "USD"],
        mainCurrency: "CNY",
        collapseEntriesDefault: false,
        aiCustomPrompt: "",
    },
    categories: [
        { name: "餐饮", description: "日常餐饮消费，包括早餐、午餐、晚餐、饮料水果及外卖等", icon: "Utensils", sortOrder: 1, isEditable: true },
        { name: "日用", description: "生活日用品消耗，如洗护用品、清洁工具、厨房用品等", icon: "ShoppingBag", sortOrder: 2, isEditable: true },
        { name: "娱乐", description: "休闲娱乐活动，如游戏、电影、演出及会员订阅等", icon: "Gamepad2", sortOrder: 3, isEditable: true },
        { name: "交通", description: "日常交通出行，包括公交、地铁、打车、加油及停车费等", icon: "Bus", sortOrder: 4, isEditable: true },
        { name: "医疗", description: "医疗健康支出，包括药品、挂号费、体检及保健品等", icon: "Stethoscope", sortOrder: 5, isEditable: true },
        { name: "会员", description: "各类服务订阅与会员费用，如各类APP会员、健身卡等", icon: "Crown", sortOrder: 6, isEditable: true },
        { name: "购物", description: "服饰鞋帽、电子数码、美妆护肤及其他个人物品购置", icon: "Shirt", sortOrder: 7, isEditable: true },
        { name: "其他", description: "无法归类的支出", icon: "Package", sortOrder: 8, isEditable: false },
    ],
};

// English (en) configuration
const enLedger = {
    settings: {
        aiLanguage: "en",
        currencies: ["USD", "EUR", "GBP"],
        mainCurrency: "USD",
        collapseEntriesDefault: false,
        aiCustomPrompt: "",
    },
    categories: [
        { name: "Dining", description: "Food and beverages, including meals, snacks, drinks, and takeout", icon: "Utensils", sortOrder: 1, isEditable: true },
        { name: "Groceries", description: "Daily necessities and household supplies", icon: "ShoppingBag", sortOrder: 2, isEditable: true },
        { name: "Entertainment", description: "Leisure activities, games, movies, shows, and subscriptions", icon: "Gamepad2", sortOrder: 3, isEditable: true },
        { name: "Transport", description: "Daily commuting and travel, including public transit, taxis, fuel, and parking", icon: "Bus", sortOrder: 4, isEditable: true },
        { name: "Healthcare", description: "Medical expenses, including medications, appointments, checkups, and supplements", icon: "Stethoscope", sortOrder: 5, isEditable: true },
        { name: "Subscriptions", description: "Service subscriptions and memberships, including apps and gym memberships", icon: "Crown", sortOrder: 6, isEditable: true },
        { name: "Shopping", description: "Clothing, electronics, beauty products, and other personal items", icon: "Shirt", sortOrder: 7, isEditable: true },
        { name: "Other", description: "Expenses that don't fit other categories", icon: "Package", sortOrder: 8, isEditable: false },
    ],
};

// Helper function to get default ledger by locale
export function getDefaultLedger(locale: string = "zh") {
    if (locale.startsWith("zh")) {
        return zhLedger;
    }
    return enLedger;
}

// Keep default export for backward compatibility
export const defaultLedger = zhLedger;
export default defaultLedger;
```

- [ ] **Step 2: Verify TypeScript types**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/config/default-ledger.ts
git commit -m "feat(i18n): add locale-specific default ledger configurations"
```

---

## Chunk 2: Update User Setup Service

### Task 2.1: Modify createDefaultLedgerForUser to Accept Locale

**Files:**
- Modify: `src/features/auth/server/services/user-setup.ts`

**Current State:**
```typescript
export async function createDefaultLedgerForUser(
    userId: string,
    _userEmail: string
): Promise<string>
```

**Changes Required:**

- [ ] **Step 1: Add locale parameter**

```typescript
export async function createDefaultLedgerForUser(
    userId: string,
    _userEmail: string,
    locale: string = "zh" // Add locale parameter with default
): Promise<string> {
    const { getDefaultLedger } = await import("@/config/default-ledger");
    const { entryCategories } = await import("@/lib/db/schema");

    // Get locale-specific default ledger
    const defaultLedger = getDefaultLedger(locale);

    // Rest of the function remains the same...
```

- [ ] **Step 2: Update all usages of defaultLedger to use getDefaultLedger(locale)**

Replace `defaultLedger.settings` with `defaultLedger.settings`
Replace `defaultLedger.categories` with `defaultLedger.categories`

- [ ] **Step 3: Verify TypeScript types**

Run: `npm run lint`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/server/services/user-setup.ts
git commit -m "feat(i18n): accept locale in createDefaultLedgerForUser"
```

---

## Chunk 3: Pass Locale During User Registration

### Task 3.1: Update User Registration Flow

**Files:**
- Modify: `src/features/auth/server/services/otp-verification.ts` (or wherever user is created)

**Analysis Needed:**

We need to find where `createDefaultLedgerForUser` is called and ensure the user's locale is passed.

The locale should come from:
1. The user's browser preference during registration
2. Or the locale parameter in the URL during registration

**Typical Flow:**
1. User registers at `/[locale]/login`
2. After OTP verification, user is created
3. Default ledger is created

**Changes Required:**

- [ ] **Step 1: Find where createDefaultLedgerForUser is called**

Search for usages of `createDefaultLedgerForUser` in the codebase.

- [ ] **Step 2: Update the call site to pass locale**

If called in OTP verification:
```typescript
// Pass locale from the request context or user preference
const locale = getLocaleFromRequest(request); // or from user preference
await createDefaultLedgerForUser(user.id, user.email, locale);
```

- [ ] **Step 3: Add locale detection helper if needed**

Create a helper to detect locale from request:
```typescript
function getLocaleFromRequest(request: Request): string {
    // Try to get from Accept-Language header
    const acceptLanguage = request.headers.get("accept-language");
    if (acceptLanguage) {
        const preferred = acceptLanguage.split(",")[0];
        if (preferred.startsWith("zh")) return "zh";
        if (preferred.startsWith("en")) return "en";
    }
    return "zh"; // Default
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint`
Expected: No type errors

```bash
git add src/features/auth/server/services/user-setup.ts
git commit -m "feat(i18n): pass user locale during default ledger creation"
```

---

## Chunk 4: Update Database Schema (Optional)

### Task 4.1: Store User's Preferred Locale

**Files:**
- Modify: `src/lib/db/schema.ts` (if users table needs locale column)

**Analysis:**

Check if the `users` table already has a locale/language preference column.

If not, consider adding one to persist user's language preference:

```typescript
export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    // ... other fields
    preferredLocale: text("preferred_locale").default("zh"),
    // ...
});
```

**Note:** This is optional if the locale can be reliably detected from the request URL or headers.

---

## Chunk 5: Verification

### Task 5.1: Run Tests

**Files:**
- All modified files

**Steps:**

- [ ] **Step 1: Run lint**

```bash
npm run lint
```
Expected: No errors

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```
Expected: All tests pass

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git commit -m "test: verify localized default ledger implementation"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/config/default-ledger.ts` | Add `getDefaultLedger(locale)` function, create en/zh configs |
| `src/features/auth/server/services/user-setup.ts` | Accept locale parameter, use `getDefaultLedger` |
| Registration flow files | Pass user's locale when calling `createDefaultLedgerForUser` |

## Benefits

1. **Better UX:** English users see English categories (Dining, Transport) instead of Chinese
2. **Appropriate currencies:** English users get USD/EUR/GBP, Chinese users get CNY/USD
3. **AI language:** AI recognition uses user's preferred language
4. **Backward compatible:** Default remains Chinese if no locale specified

---

*Plan created: 2026-03-16*
*Estimated effort: 1-2 hours*

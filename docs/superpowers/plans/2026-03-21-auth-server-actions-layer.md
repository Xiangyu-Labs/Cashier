# Auth 模块 Server Actions 分层实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/modules/auth/actions.ts` 中直接实现的两个 Server Action 函数体迁移至 `server-actions/` 子目录，使 `actions.ts` 成为符合约定的纯 re-export barrel。

**Architecture:** 纯结构性重组，不改变任何业务逻辑。新建 `auth/server-actions/send-otp.ts` 和 `auth/server-actions/delete-account.ts` 分别承载对应函数，`actions.ts` 改为纯 re-export。

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest

---

## 文件变更地图

### 新建
- `src/modules/auth/server-actions/send-otp.ts` — 迁入 `sendOTPAction`
- `src/modules/auth/server-actions/delete-account.ts` — 迁入 `deleteAccount`

### 修改
- `src/modules/auth/actions.ts` — 清理为纯 barrel

---

## Task 1：创建 server-actions/send-otp.ts

**Files:**
- Create: `src/modules/auth/server-actions/send-otp.ts`

- [ ] **Step 1：确认现有 actions.ts 完整内容**

  ```bash
  cat src/modules/auth/actions.ts
  ```

  已知 `sendOTPAction` 使用了 `headers()` 从 next/headers、`getClientIPFromHeaders` 和 `sendOTP` use case。

- [ ] **Step 2：创建 send-otp.ts**

  ```typescript
  // src/modules/auth/server-actions/send-otp.ts
  "use server";
  import { headers } from "next/headers";
  import { getClientIPFromHeaders } from "@/lib/utils/ip";
  import { sendOTP } from "../use-cases";

  export async function sendOTPAction(email: string, _locale: string = "en") {
    const requestHeaders = await headers();
    return sendOTP({
      email,
      ip: getClientIPFromHeaders(requestHeaders),
      host: requestHeaders.get("host") ?? "localhost",
    });
  }
  ```

- [ ] **Step 3：类型检查确认新文件无错**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

---

## Task 2：创建 server-actions/delete-account.ts

**Files:**
- Create: `src/modules/auth/server-actions/delete-account.ts`

- [ ] **Step 1：创建 delete-account.ts**

  ```typescript
  // src/modules/auth/server-actions/delete-account.ts
  "use server";
  import { signOut } from "@/auth";
  import { withAuth } from "@/lib/auth-actions";
  import { deleteAccount as deleteAccountUseCase } from "../use-cases";

  export const deleteAccount = withAuth(async (userId: string) => {
    await deleteAccountUseCase(userId);
    await signOut({ redirectTo: "/" });
  });
  ```

- [ ] **Step 2：类型检查确认新文件无错**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

---

## Task 3：将 actions.ts 清理为纯 barrel

**Files:**
- Modify: `src/modules/auth/actions.ts`

- [ ] **Step 1：检查所有引用 auth/actions 的调用方**

  ```bash
  grep -rn "from '@/modules/auth/actions'\|from \"@/modules/auth/actions\"" src/ --include='*.ts' --include='*.tsx'
  ```

  确认调用方使用的导出名为 `sendOTPAction` 和 `deleteAccount`，无其他意外导出。

- [ ] **Step 2：将 actions.ts 改为纯 barrel**

  ```typescript
  // src/modules/auth/actions.ts
  export { sendOTPAction } from "./server-actions/send-otp";
  export { deleteAccount } from "./server-actions/delete-account";
  ```

- [ ] **Step 3：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

- [ ] **Step 4：运行全量测试**

  ```bash
  npx vitest run
  ```

  预期：全部 PASS。

- [ ] **Step 5：Commit**

  ```bash
  git add src/modules/auth/server-actions/ src/modules/auth/actions.ts
  git commit -m "refactor(auth): extract server actions into server-actions/ subdir, make actions.ts a pure barrel"
  ```

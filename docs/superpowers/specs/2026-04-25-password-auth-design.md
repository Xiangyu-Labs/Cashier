# 密码登录与账户管理功能设计文档

**日期**: 2026-04-25
**方案**: 方案 A（Tab 切换双登录 + 设置页账户管理）
**状态**: 已确认

---

## 1. 概述

将 Cashier 的认证系统从单一的 OTP 验证码登录扩展为支持密码登录的并存体系，同时在账户设置页增加密码管理、修改邮箱、清空数据等账户管理功能。

### 1.1 功能清单

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 密码登录 | 登录页 Tab 切换，支持邮箱+密码登录 | P0 |
| 设置密码 | 已登录用户在设置页首次设置密码 | P0 |
| 修改密码 | 已设置密码用户修改密码（需当前密码） | P0 |
| 修改邮箱 | 向新邮箱发送验证码，验证后更新 | P0 |
| 清空数据 | 软删除用户所有账本及关联数据，保留账号 | P0 |
| 删除账号（增强） | 现有功能增强：增加邮箱验证码二次确认 | P0 |

### 1.2 核心决策

- **密码登录与 OTP 验证码登录并存**，登录页通过 Tab 切换
- **OTP 保持为默认注册方式**：新用户通过 OTP 登录即自动注册，进入系统后在设置页设置密码
- **无密码用户密码登录返回通用错误**（"邮箱或密码错误"），防止账号枚举
- **清空数据和删除账号均需邮箱验证码 + 确认文本双重验证**
- **所有删除操作均为软删除**（`deletedAt`），保留数据恢复可能

---

## 2. 数据库变更

### 2.1 Schema 变更

文件：`src/persistence/schema/auth.ts`

在 `users` 表中新增字段：

```typescript
export const users = sqliteTable(
  "users",
  {
    // ... existing fields
    passwordHash: text("password_hash"), // nullable，未设置密码的用户为 null
  },
  // ... existing indexes
);
```

### 2.2 迁移

通过 Drizzle 迁移文件添加 `password_hash` 列到 `users` 表。现有用户的该列为 `NULL`。

---

## 3. 认证架构

### 3.1 NextAuth Providers

文件：`src/auth.ts`

现有 `Credentials({ id: "otp", ... })` 保持不变，新增第二个 Credentials provider：

```typescript
Credentials({
  id: "password",
  name: "Password",
  credentials: {
    email: { type: "email" },
    password: { type: "password" },
  },
  async authorize(credentials) {
    // 1. 校验邮箱和密码非空且为字符串
    // 2. 查询用户（email + deletedAt isNull）
    // 3. 检查 passwordHash 是否存在且非空
    // 4. bcrypt.compare 验证密码
    // 5. 返回用户对象（id, email, name, image）
    // 任意步骤失败均返回 null（通用错误，不暴露具体原因）
  },
})
```

两个 provider 并存，NextAuth 根据前端调用 `signIn("otp", ...)` 或 `signIn("password", ...)` 路由到对应 provider。

### 3.2 Session 策略

保持 JWT session strategy 不变。密码登录成功后，session 与 OTP 登录完全一致。

---

## 4. 密码服务

### 4.1 依赖

新增 `bcryptjs`（纯 JavaScript 实现，无需原生编译依赖）。

### 4.2 API

文件：`src/modules/auth/services/password.ts`

```typescript
export async function hashPassword(password: string): Promise<string>;
export async function verifyPassword(password: string, hash: string): Promise<boolean>;
```

- 使用 bcryptjs，salt rounds = 10
- `hashPassword` 用于设置/修改密码时生成哈希
- `verifyPassword` 用于密码登录和修改密码时验证当前密码

### 4.3 密码策略

| 规则 | 值 |
|------|-----|
| 最小长度 | 8 位 |
| 复杂度 | 至少包含 1 个字母 + 1 个数字 |
| 最大长度 | 128 位 |

---

## 5. 登录页 UI

### 5.1 布局

文件：`src/modules/auth/ui/login-page.tsx`

在标题下方、表单卡片上方增加 Tab 切换栏：

```
┌──────────────────────────────────┐
│        [验证码登录] [密码登录]      │  ← Tab 切换
├──────────────────────────────────┤
│                                  │
│     根据选中 Tab 显示对应表单       │
│                                  │
└──────────────────────────────────┘
```

### 5.2 验证码登录模式（现有，保持不变）

- `EmailStep` → 点击"发送验证码" → `OtpStep` → 点击"验证"
- 复用现有 `EmailStep` 和 `OtpStep` 组件

### 5.3 密码登录模式（新增）

新增 `PasswordStep` 组件：

- 邮箱输入框（placeholder: "邮箱地址"）
- 密码输入框（type="password"，placeholder: "密码"）
- 登录按钮
- "忘记密码？"文本（本次实现为纯文本，不添加链接，Phase 2 可扩展）
- 错误提示区域（统一显示"邮箱或密码错误"）

### 5.4 状态管理

`useLoginFlow` hook 扩展：

```typescript
type LoginMode = "otp" | "password";

// 新增状态
mode: LoginMode;
password: string;
passwordError: string | null;
isPasswordLoading: boolean;

// 新增方法
setMode(mode: LoginMode): void;
setPassword(pw: string): void;
handlePasswordLogin(): Promise<void>; // 调用 signIn("password", ...)
```

切换 Tab 时清空对方模式的输入值和错误状态。

---

## 6. 账户设置页

文件：`src/app/[locale]/(protected)/settings/account/page.tsx`

扩展后页面结构：

```
账户设置 /settings/account
├── 账户信息区（新增）
│   ├── 当前邮箱（只读显示）
│   └── [修改邮箱] 按钮
│
├── 密码管理区（新增）
│   ├── 未设置密码 → [设置密码] 按钮
│   └── 已设置密码 → [修改密码] 按钮
│
└── 危险操作区（Danger Zone）
    ├── 清空数据（新增）
    └── 删除账号（已有，增强验证）
```

### 6.1 设置/修改密码

**设置密码（首次）**

弹窗表单：
- 新密码输入框（带可见性切换）
- 确认新密码输入框
- 密码要求提示文字（最少 8 位，含字母和数字）
- 提交按钮

**修改密码（已设置过）**

弹窗表单：
- 当前密码输入框
- 新密码输入框
- 确认新密码输入框
- 提交按钮

后端流程：
1. 验证当前密码（bcrypt compare）
2. 验证新密码符合策略
3. 验证新密码与确认密码一致
4. 哈希新密码并更新 `users.passwordHash`
5. 返回成功，前端 toast 提示

### 6.2 修改邮箱

流程：
1. 点击"修改邮箱" → 打开弹窗
2. 输入新邮箱地址 → 点击"发送验证码"
3. 后端向新邮箱发送 OTP 验证码（复用 `sendOTP` use-case）
4. 用户输入 6 位验证码 → 点击"确认修改"
5. 后端验证：
   - 验证码正确且未过期
   - 新邮箱未被其他账号使用（`email` 唯一约束）
   - 更新 `users.email`
6. 成功后刷新 session（`update`）使前端获取新 email，toast 提示

### 6.3 清空数据

卡片位于 Danger Zone，与删除账号并列：

```
┌─────────────────────────────────────────────────────────┐
│  清空所有数据                                              │
│  此操作将清空您所有账本及条目数据，但保留您的账户。            │
│                                          [清空数据]        │
└─────────────────────────────────────────────────────────┘
```

点击后打开确认弹窗：
- 警告说明文本
- 确认输入框（输入 "CLEAR"）
- 验证码区域：
  - "发送验证码到当前邮箱" 按钮（60 秒倒计时）
  - 6 位验证码输入框
- [取消] [确认] 按钮

后端执行：
1. 验证确认文本为 "CLEAR"
2. 验证邮箱验证码正确
3. 查询用户所有 ledgers
4. 将 ledgers 及关联的 entries、source documents、categories 等全部软删除（设置 `deletedAt`）
5. 返回成功

前端执行后：重定向到首页（账本为空状态）。

### 6.4 删除账号（增强）

现有功能增强，增加验证码验证：

确认弹窗：
- 警告说明文本
- 确认输入框（输入 "DELETE"）
- 验证码区域（同清空数据）
- [取消] [确认] 按钮

后端执行：
1. 验证确认文本为 "DELETE"
2. 验证邮箱验证码正确
3. 设置 `users.deletedAt = new Date()`（软删除）
4. 调用 `signOut({ redirectTo: "/" })`

---

## 7. Server Actions / Use Cases

### 7.1 新增 Use Cases

| Use Case | 文件 | 职责 |
|----------|------|------|
| authenticateWithPassword | `application/use-cases/authenticate-with-password.ts` | 密码登录验证 |
| setPassword | `application/use-cases/set-password.ts` | 首次设置密码 |
| changePassword | `application/use-cases/change-password.ts` | 修改密码 |
| changeEmail | `application/use-cases/change-email.ts` | 修改邮箱 |
| clearUserData | `application/use-cases/clear-user-data.ts` | 清空用户数据 |

### 7.2 新增 Server Actions

| Server Action | 文件 | 调用 Use Case |
|---------------|------|---------------|
| authenticateWithPassword | `server-actions/authenticate-with-password.ts` | authenticateWithPassword |
| setPassword | `server-actions/set-password.ts` | setPassword |
| changePassword | `server-actions/change-password.ts` | changePassword |
| changeEmail | `server-actions/change-email.ts` | changeEmail |
| clearUserData | `server-actions/clear-user-data.ts` | clearUserData |

所有 server actions 使用 `withAuth` 包装以获取当前用户身份。

### 7.3 修改的 Use Cases

- `deleteAccount`（`application/use-cases/delete-account.ts`）：增强为需要验证码验证
- `deleteAccount`（`server-actions/delete-account.ts`）：增加验证码参数

---

## 8. 错误处理

### 8.1 新增错误码

在 `src/modules/auth/errors.ts` 中扩展：

```typescript
export const AUTH_ERROR_CODES = {
  // ... existing codes
  INVALID_CREDENTIALS: "invalid_credentials",     // 密码登录通用错误
  PASSWORD_TOO_SHORT: "password_too_short",
  PASSWORD_REQUIREMENTS_NOT_MET: "password_requirements_not_met",
  PASSWORD_MISMATCH: "password_mismatch",         // 确认密码不匹配
  CURRENT_PASSWORD_WRONG: "current_password_wrong",
  EMAIL_ALREADY_EXISTS: "email_already_exists",   // 修改邮箱时新邮箱已占用
  INVALID_CONFIRMATION: "invalid_confirmation",   // 清空/删除确认文本错误
  OTP_REQUIRED: "otp_required",                   // 敏感操作缺少验证码
  OTP_INVALID_FOR_ACTION: "otp_invalid_for_action", // 敏感操作验证码错误
} as const;
```

### 8.2 错误响应策略

| 场景 | 前端提示 |
|------|----------|
| 密码登录，账号不存在 | "邮箱或密码错误" |
| 密码登录，未设置密码 | "邮箱或密码错误" |
| 密码登录，密码错误 | "邮箱或密码错误" |
| 修改密码，当前密码错误 | "当前密码不正确" |
| 修改邮箱，新邮箱已存在 | "该邮箱已被使用" |
| 清空/删除，验证码错误 | "验证码错误或已过期" |
| 清空/删除，确认文本错误 | "确认文本不正确" |

---

## 9. 安全策略

| 策略 | 实现 |
|------|------|
| 密码最小长度 | 8 位 |
| 密码复杂度 | 至少 1 个字母 + 1 个数字 |
| 密码哈希 | bcryptjs，salt rounds = 10 |
| 登录失败限流 | 密码登录接入现有 IP-based rate limit（与 OTP 共享或独立配置） |
| 敏感操作二次确认 | 清空数据、删除账号需邮箱验证码 + 确认文本 |
| 密码错误模糊化 | 统一返回通用错误，不暴露账号状态 |
| Session 安全 | 保持现有 JWT strategy，session maxAge 不变 |

---

## 10. i18n

新增翻译键（`messages/en.json` 和 `messages/zh.json`）：

```json
{
  "Auth": {
    "passwordLogin": "Password Login",
    "otpLogin": "OTP Login",
    "password": "Password",
    "passwordPlaceholder": "Enter your password",
    "forgotPassword": "Forgot password?",
    "loginWithPassword": "Log in with password"
  },
  "Settings.Account": {
    "passwordSection": "Password",
    "setPassword": "Set Password",
    "changePassword": "Change Password",
    "currentPassword": "Current Password",
    "newPassword": "New Password",
    "confirmNewPassword": "Confirm New Password",
    "passwordSetSuccess": "Password set successfully",
    "passwordChangedSuccess": "Password changed successfully",
    "passwordRequirements": "At least 8 characters with letters and numbers",
    "emailSection": "Email",
    "currentEmail": "Current Email",
    "changeEmail": "Change Email",
    "newEmail": "New Email",
    "emailChangedSuccess": "Email changed successfully",
    "clearData": "Clear All Data",
    "clearDataDesc": "This will delete all your ledgers and entries but keep your account.",
    "clearDataConfirm": "Type CLEAR to confirm",
    "clearDataSuccess": "All data has been cleared",
    "deleteAccount": "Delete Account",
    "deleteAccountDesc": "Permanently delete your account. This action cannot be undone.",
    "deleteAccountConfirm": "Type DELETE to confirm",
    "verifyToContinue": "Verify to continue",
    "sendVerificationCode": "Send verification code",
    "verificationCode": "Verification Code",
    "verificationCodeSent": "Verification code sent to your email"
  }
}
```

---

## 11. 测试策略

### 11.1 单元测试

| 目标 | 文件 | 内容 |
|------|------|------|
| 密码服务 | `tests/unit/modules/auth/password.test.ts` | hashPassword, verifyPassword |
| 密码策略验证 | `tests/unit/modules/auth/password-policy.test.ts` | 各种密码的合法性校验 |

### 11.2 集成测试

| 目标 | 文件 | 内容 |
|------|------|------|
| 密码登录 | `tests/integration/auth/password-login.test.ts` | 成功登录、密码错误、账号不存在、未设密码 |
| 设置密码 | `tests/integration/auth/set-password.test.ts` | 首次设置成功、密码不符合策略 |
| 修改密码 | `tests/integration/auth/change-password.test.ts` | 成功修改、当前密码错误、确认密码不匹配 |
| 修改邮箱 | `tests/integration/auth/change-email.test.ts` | 成功修改、验证码错误、邮箱已存在 |
| 清空数据 | `tests/integration/auth/clear-data.test.ts` | 成功清空、确认文本错误、验证码错误 |
| 删除账号 | `tests/integration/auth/delete-account.test.ts` | 成功删除、验证码错误 |

---

## 12. 文件变更清单

### 新增文件

```
src/modules/auth/services/password.ts
src/modules/auth/application/use-cases/authenticate-with-password.ts
src/modules/auth/application/use-cases/set-password.ts
src/modules/auth/application/use-cases/change-password.ts
src/modules/auth/application/use-cases/change-email.ts
src/modules/auth/application/use-cases/clear-user-data.ts
src/modules/auth/server-actions/authenticate-with-password.ts
src/modules/auth/server-actions/set-password.ts
src/modules/auth/server-actions/change-password.ts
src/modules/auth/server-actions/change-email.ts
src/modules/auth/server-actions/clear-user-data.ts
src/modules/auth/ui/password-step.tsx
src/app/[locale]/(protected)/settings/account/PasswordForm.tsx
src/app/[locale]/(protected)/settings/account/ChangeEmailForm.tsx
src/app/[locale]/(protected)/settings/account/ClearDataForm.tsx
```

### 修改文件

```
package.json                              # 新增 bcryptjs 依赖
src/persistence/schema/auth.ts            # 新增 passwordHash 字段
src/auth.ts                               # 新增 password Credentials provider
src/modules/auth/ui/login-page.tsx        # Tab 切换
src/modules/auth/hooks/use-login-flow.ts  # 支持双模式
src/modules/auth/errors.ts                # 扩展错误码
src/modules/auth/use-cases.ts             # 导出新增 use cases
src/modules/auth/actions.ts               # 导出新增 server actions
src/modules/auth/application/use-cases/delete-account.ts    # 增强验证码验证
src/modules/auth/server-actions/delete-account.ts           # 增加验证码参数
src/app/[locale]/(protected)/settings/account/page.tsx      # 扩展布局
src/app/[locale]/(protected)/settings/account/DeleteAccountForm.tsx  # 增强验证码
messages/en.json                          # 新增翻译键
messages/zh.json                          # 新增翻译键
```

### 迁移文件

```
src/persistence/migrations/00XX_add_password_hash_to_users.sql
```

---

## 13. 风险与注意事项

1. **bcryptjs 性能**：纯 JavaScript 实现的 bcrypt 比原生版本慢约 30%，但在登录场景（低并发）下可接受。如未来有性能瓶颈，可迁移至 `@node-rs/argon2`。
2. **OTP provider 命名冲突**：NextAuth Credentials provider 通过 `id` 区分（"otp" vs "password"），确保前端调用正确的 provider。
3. **邮箱修改后的 session**：修改邮箱后需要调用 NextAuth 的 `update()` 刷新 session，否则前端仍显示旧邮箱。
4. **清空数据的级联**：清空数据涉及多个表的软删除，需确保所有相关表都有 `deletedAt` 字段。如某些表缺少该字段，需先补充。
5. **Rate limit 共享**：密码登录和 OTP 登录的限流策略可独立配置，避免一种方式的限流影响另一种。

# Admin 数据查看面板增强设计

## 背景

Cashier 的 admin 页面目前已有 users、source-documents、entries、tasks、system-config 五个只读数据查看页面。本设计旨在将 admin 扩展为覆盖项目中所有核心数据实体的全面查看入口，保持纯只读、无增删改。

## 目标

1. 新增 6 个数据实体的 admin 查看页面：Ledgers、Categories、Accounts、Service Credentials、Currency Rates、OTP Tokens
2. 每个页面遵循现有模式：列表表格 + 筛选 + 点击展开详情
3. Overview 页面从空欢迎语升级为数据仪表盘，展示各实体数量统计
4. 不引入新交互模式，完全复用现有 admin 组件范式

## 新增页面

### Ledgers（账本）

**列表字段**：
- ID（ledger id，截断展示）
- User（关联用户邮箱，如未找到则显示 userId）
- 创建时间
- 主币种（从 metadata.settings.mainCurrency 提取）

**筛选**：时间范围（24h/7d/30d/all）

**详情面板**：Ledger ID、User ID、Metadata JSON（格式化可折叠）、创建/更新/删除时间

### Categories（分类）

**列表字段**：
- ID（截断）
- 所属 Ledger（ledgerId）
- 名称
- 描述
- 排序
- 是否可编辑

**筛选**：无（分类数量通常不大，全量展示即可）

**详情面板**：分类 ID、Ledger ID、名称、描述、图标、排序、是否可编辑、创建/更新/删除时间

### Accounts（OAuth 账户）

**列表字段**：
- Provider（google、github 等）
- Provider Account ID（截断）
- 关联 User（邮箱或 userId）
- 类型

**筛选**：按 Provider、按关联 User

**详情面板**：Provider、Provider Account ID、User ID、类型、Refresh Token（截断）、Access Token（截断）、过期时间、Token Type、Scope、ID Token、Session State

### Service Credentials（API 密钥）

**列表字段**：
- Key（截断展示）
- 名称
- 所属 Ledger（ledgerId）
- 创建时间
- 最后使用时间

**筛选**：按 Ledger

**详情面板**：ID、Key（截断）、名称、Ledger ID、创建时间、最后使用时间、删除时间

### Currency Rates（汇率）

**列表字段**：
- 日期
- Base 币种
- 汇率数量（rates JSON 的 key 数量）

**筛选**：按日期范围

**详情面板**：日期、Base、Rates JSON（格式化 + 可折叠，参考现有 AdminTaskJsonBlock）

### OTP Tokens

**列表字段**：
- Email
- 过期时间
- 尝试次数
- 验证状态（是否已 verifiedAt）
- IP 地址

**筛选**：按 Email、按验证状态（已验证/未验证）

**详情面板**：ID、Email、Token Hash（截断）、过期时间、尝试次数、锁定截止时间、IP 地址、创建时间、最后尝试时间、验证时间

## Overview 仪表盘

从空欢迎语替换为统计卡片网格，每个卡片展示一个实体的总数：

- 总用户数
- 总账本数
- 总分录数
- 总源单据数
- 总任务数
- 总分类数
- API 密钥数
- OAuth 账户数
- 汇率记录数
- OTP Token 数

每个卡片可点击跳转到对应列表页。卡片按 3 列或 4 列响应式网格布局。

查询实现：每个数字用简单的 `COUNT(*)` SQL 查询，无聚合计算，保证加载速度。

## 架构设计

### 目录结构

```
src/modules/admin/
├── actions.ts                          # 保留现有
├── server-actions/                     # 新增目录
│   ├── list-ledgers.ts
│   ├── list-categories.ts
│   ├── list-accounts.ts
│   ├── list-service-credentials.ts
│   ├── list-currency-rates.ts
│   ├── list-otp-tokens.ts
│   └── get-admin-overview-stats.ts
├── application/queries/
│   ├── list-admin-ledgers.ts
│   ├── list-admin-categories.ts
│   ├── list-admin-accounts.ts
│   ├── list-admin-service-credentials.ts
│   ├── list-admin-currency-rates.ts
│   ├── list-admin-otp-tokens.ts
│   └── get-admin-overview-stats.ts
├── contracts.ts                        # 追加新类型
├── contract-schemas.ts                 # 追加新 schema
├── ui/
│   ├── AdminShell.tsx                  # 追加 nav items
│   ├── AdminHome.tsx                   # 重写为仪表盘
│   ├── AdminLedgersList.tsx            # 新增
│   ├── AdminCategoriesList.tsx         # 新增
│   ├── AdminAccountsList.tsx           # 新增
│   ├── AdminServiceCredentialsList.tsx # 新增
│   ├── AdminCurrencyRatesList.tsx      # 新增
│   ├── AdminOTPTokensList.tsx          # 新增
│   └── AdminOverviewStatCard.tsx       # 新增
└── ...
```

### 数据流

和现有模式一致：

```
Page (Server Component)
  → Server Action → Application Query → Drizzle ORM
  → contracts/types → UI Component (Client Component)
```

### Server Actions 组织

由于新增 6 个实体 × 2 个 action（list + 可能的 detail）+ overview，action 数量显著增加。为保持文件长度合理（< 300 行），新增 `server-actions/` 目录，按实体拆分。

现有 actions.ts 中的 action 保持不变，新增 action 放入 server-actions/ 目录。

### 导航

在 `AdminShell` 的 `navItems` 中追加新页面链接：

```
/admin/ledgers
/admin/categories
/admin/accounts
/admin/service-credentials
/admin/currency-rates
/admin/otp-tokens
```

## 类型与 Schema

新增类型放在 `src/modules/admin/contracts.ts`：

- `AdminLedgerListItem`、`AdminLedgerDetail`
- `AdminCategoryListItem`、`AdminCategoryDetail`
- `AdminAccountListItem`、`AdminAccountDetail`
- `AdminServiceCredentialListItem`、`AdminServiceCredentialDetail`
- `AdminCurrencyRateListItem`、`AdminCurrencyRateDetail`
- `AdminOTPTokenListItem`、`AdminOTPTokenDetail`
- `AdminOverviewStats`

新增 Zod schema 放在 `src/modules/admin/contract-schemas.ts`：

- `listAdminLedgersInputSchema`
- `listAdminCategoriesInputSchema`
- `listAdminAccountsInputSchema`
- `listAdminServiceCredentialsInputSchema`
- `listAdminCurrencyRatesInputSchema`
- `listAdminOTPTokensInputSchema`

## i18n

新增翻译键（zh.json / en.json）：

- `AdminLedgers` — 账本列表和详情
- `AdminCategories` — 分类列表和详情
- `AdminAccounts` — OAuth 账户列表和详情
- `AdminServiceCredentials` — API 密钥列表和详情
- `AdminCurrencyRates` — 汇率列表和详情
- `AdminOTPTokens` — OTP Token 列表和详情
- `AdminOverview` — 仪表盘统计卡片

## 错误处理

- 所有 Server Actions 遵循现有模式：直接 throw 错误（ValidationError、UnauthorizedError 等）
- 查询层调用 `requireSuperAdmin()` 进行权限校验
- UI 层通过 `error.tsx` 统一捕获

## 测试策略

- 每个新增 query 写集成测试：验证查询返回正确字段、权限校验生效
- Overview stats 查询测试：验证各 COUNT 正确
- 复用现有的测试基础设施（in-memory SQLite、全局 mock）
- 不需要前端组件测试（纯展示组件，无复杂交互）

## 范围排除（明确不做）

- 不实现实体间关联跳转（如从 user 跳转到该用户的 ledgers）
- 不实现图表或复杂可视化（纯数字统计）
- 不实现搜索功能（筛选已足够）
- 不实现导出/下载
- 不修改现有 admin 页面的行为（仅在其上追加 nav items）

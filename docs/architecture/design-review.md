# 全项目设计复审（2026-09-05）

## 范围与结论

本复审以个人、小规模自托管为基准，覆盖生产代码、历史迁移、脚本、测试、CI 与部署。
外部约束保持不变：用户功能、API v1、已有数据、Docker/Next.js 部署方式、认证授权、
`ledgerId` 租户隔离、软删除、版本冲突和日志脱敏均保留。内部继续采用按职责组织的模块化
单体，不引入微服务、通用仓储框架、新客户端状态库或新任务平台。

AI 解析策略单独延期。当前链路可能执行首次解析、复杂单据第二次解析、分歧仲裁、JSON
修复和重复检测，调用次数与成本随输入和失败路径变化。本轮只记录这一事实，不修改提示词、
模型、仲裁、重复检测或质量阈值，也不把 mock 通过视为准确率不退化证据。

## 全量设计清单

| 子系统           | 代码位置                                                              | 引入背景与原始假设                                     | 当前调用方与实际成本                                     | 决定                                                                                              | 验证证据                                       |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 认证与会话       | `src/auth.ts`, `src/modules/auth/`, PostgreSQL account adapters       | OTP、密码和开发登录共享 JWT 会话；账户安全状态持久化   | NextAuth 和认证 actions；旧 sign-in 回调层无调用方       | 保留当前组合，删除旧回调 use case、barrel 和重复事件测试                                          | auth 单元/集成、架构检查                       |
| 账本与分类       | `src/modules/ledger/`, `adapters/postgres/ledger-*`                   | 单账本所有权、分类和分录通过端口隔离 SQL               | Workspace、API v1、Server Actions；旧包装只转发同一端口  | 调用方直接使用注入端口；保留锁、CAS、租户条件和聚合写                                             | ledger/API/并发集成测试                        |
| 单据与修订       | `src/modules/source-document/`, `adapters/postgres/source-document-*` | 修订历史、候选、重复审查和处理意图需要版本化聚合       | Stream、详情、API v1、处理器                             | 保留聚合和历史；删除旧删除/轻量查询包装，写端口使用真实方法名                                     | source-document 契约、并发和 API 测试          |
| 汇率与换算       | `src/modules/currency/`, `exchange-rate*.ts`                          | 每日快照和持久化任务允许失败恢复                       | 换算、统计、后台维护；旧事件订阅会重复入队               | 汇率写事务唯一入队；提交后 best-effort drain；保留租约、退避和漏任务修复                          | 汇率定向集成 17/17                             |
| 统计             | `src/modules/stats/`, `get-enhanced-stats.ts`                         | Details 与 Stats 共享持久化 accounting amount          | Stats tab 和 API                                         | 保留查询，删除仅作转出的 actions barrel                                                           | stats 与金额完整性集成测试                     |
| Workspace/Stream | `src/modules/workspace/`, source-document stream hooks                | URL 是筛选状态来源，无限查询负责分页                   | 受保护账本页；旧实现重复构造参数、key 和页输入           | descriptor 唯一构造 query key、total key、签名和页输入                                            | Stream hook、URL、分页测试                     |
| 应用契约与组合根 | `src/application/contracts/`, `server-composition-root.ts`            | 模块依赖抽象端口，运行时集中装配具体 adapter           | Server Actions、API、处理器                              | 保留向内依赖；业务价值而非固定层数决定是否保留 use case                                           | contract suite、architecture rules             |
| 对象存储         | `adapters/local/stored-files.ts` 及子目录                             | 直传和 API 内联上传共享授权、确认、补偿                | Web 上传、API v1、文件读取；六级继承隐藏依赖             | 改为 `createStoredFileAdapter(dependencies)` 和职责函数组合                                       | 直传、内联、幂等、取消、补偿、跨账本测试       |
| 前端翻译         | `src/i18n/use-feature-messages.ts`, `_active-shell.tsx`               | 非活动 tab 按需加载 namespace                          | settings/details/stats；旧模块缓存重复管理请求身份和监听 | 使用 QueryClient；无限 stale/gc，无自动重试、焦点或重连刷新                                       | preload+mount 单请求、显式重试、父级消息零请求 |
| 设置草稿         | `AiSettings.tsx`, `BookkeepingSettings.tsx`                           | 保存后服务器返回账本是事实来源                         | Settings tab；旧 unknown 探测可掩盖异常响应              | 回调统一 `Promise<LedgerDto>`，不以提交值冒充保存结果                                             | Settings 单元和集成工作流                      |
| 浏览器图片       | `src/lib/image-utils.ts`, input/upload hooks                          | 压缩后上传并即时预览                                   | 新建和 edit-retry；base64 往返产生内存复制               | 内部用 `File`/`Blob`；对象 URL 在删除、重置、替换、卸载释放；API v1 base64 不变                   | 图片、上传、URL 生命周期测试                   |
| 数据读取         | `source-document-reads/`, ledger read adapters                        | 列表、详情、编辑种子需要不同边界                       | Stream、详情、edit-retry                                 | 新增 `getEvidence`，编辑种子不读分类或分录；列表继续剥离证据                                      | SQL 捕获：2 次 SELECT，无 `ledger_entries`     |
| 数据库定义       | `src/persistence/schema/`, `src/persistence/index.ts`                 | PostgreSQL 是唯一事实源                                | 全部 PostgreSQL adapters                                 | 保留约束、软删除、租户键、修订和任务租约；无破坏性 schema 变更                                    | 类型检查、完整迁移、集成测试                   |
| 历史迁移         | `postgres-migrations/0000..0034`, `meta/_journal.json`                | 自托管实例必须顺序升级并保留历史数据                   | entrypoint、integration schema、`db:migrate`             | 全部保留，审查升级行为而非按当前 schema 反删迁移                                                  | 每个 integration worker 执行完整 journal       |
| i18n 生成物      | generate/validate scripts、message map、version                       | namespace 映射和版本由 messages 生成                   | i18n API 和客户端 preload                                | 生成脚本是源，生成 JSON/版本不手工重写                                                            | `validate:i18n`、脚本测试                      |
| 脚本与维护       | `scripts/`                                                            | 迁移、bootstrap、存储清理、架构和测试环境              | npm、Docker、CI                                          | 保留有入口脚本；破坏性清理仍须先审查目标集合                                                      | Knip entry、脚本测试、静态门禁                 |
| 测试             | `tests/unit/`, `tests/integration/`, helpers                          | 行为、契约、SQL 和并发分层验证                         | 本地和 CI                                                | 删除只证明旧包装互调的测试；OpenAI mock 只模拟当前 parser/arbitration；纯逻辑 Node，DOM happy-dom | unit、integration、coverage 门禁               |
| CI               | `.github/workflows/ci-cd.yml`                                         | PR 快门禁，main/定时完整门禁，发布多架构镜像           | GitHub Actions                                           | 保留；dead-code 纳入完整源码与生产导出复核                                                        | `check:pr`, `check`                            |
| 部署             | Dockerfile、Compose、Next config、entrypoint                          | 单应用容器连接外部 PostgreSQL/S3，启动时迁移/bootstrap | 自托管 Docker 与 Next standalone                         | 保留部署拓扑和 secret 文件持久化                                                                  | build check、CI Docker build                   |
| PWA/框架入口     | service worker、instrumentation、manifests                            | 静态资源更新与 Node instrumentation                    | Next/Serwist 动态发现                                    | 保留入口；instrumentation 不再注册汇率全局订阅                                                    | instrumentation 测试、build check              |

历史迁移中特别保留：`0012` 修复跳过迁移，`0018` 回填 accounting projection，`0023`
引入持久化汇率任务，`0033` 引入 state version，`0034` 移除旧状态触发器。它们描述升级路径，
不是可按当前 schema 判定的死代码。

## 本轮变更清单

| 批次     | 文件/符号                                                                | 处理决定                                                                              | 验证                                            |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 检查盲区 | `knip.json`, `package.json`                                              | 源码统一 `src/**/*.{ts,tsx}!`，开启 `ignoreExportsUsedInFile`；生产阶段仅排除逐项标签 | 初始复现 15 文件/41 导出/8 类型；当前两阶段通过 |
| 废弃路径 | auth/currency/ledger/source-document/stats 旧 barrel、创建/删除/转发流程 | 删除无生产调用方文件；测试改用当前 action 或 adapter                                  | Knip 无不可达文件                               |
| 调用层   | ledger 五个转发 query/use case、source-document write 别名               | 调用方直接使用端口，保留真实编排                                                      | TypeScript、模块回归                            |
| 存储     | `stored-files.ts` 及子目录                                               | 继承层改为函数组合，依赖显式注入                                                      | current-runtime storage 与上传集成              |
| 前端状态 | feature messages、settings、revision hook、stream descriptor             | 移除重复缓存、unknown 兜底和纯转发 hook                                               | i18n/settings/stream 单元测试                   |
| 数据路径 | evidence read、image utils/input/upload                                  | 窄读证据；File/Blob 上传和对象 URL 生命周期                                           | SQL 捕获、图片/上传测试                         |
| 后台编排 | exchange-rate、jobs、orchestration、instrumentation                      | 事务唯一入队，移除事件 Set/Symbol 生命周期，显式依赖                                  | 汇率定向集成 17/17                              |
| 测试治理 | Vitest projects、OpenAI mock、旧 wrapper tests                           | Node/happy-dom 分流；mock 仅保留当前协议                                              | 单元和集成门禁                                  |

## 导出保留规则

全项目 Knip 阶段检查所有导出，包括测试直接调用的纯函数。生产阶段只排除两种逐符号标签：

- `@testOnly`：生产文件内的纯函数或 adapter factory，为低层行为/契约测试提供直接入口。
  删除对应测试后，全项目阶段仍会报告该导出。
- `@publicContract`：框架不能静态追踪或需要保持兼容的 API v1/Server Action 边界。

不得使用目录级忽略掩盖候选；每个 Knip 告警仍需确认动态入口、公开契约和测试价值。

## 成本与性能记录

- 证据读取有测量：固定两次 SELECT，捕获 SQL 不含 `ledger_entries`；返回 DTO 仅含
  `id/text/files/status/createdAt`。
- 翻译有测量：同一 QueryClient 中 preload 与 mounted consumer 共用一次请求；父级已有
  完整 namespace 时为零请求。
- 浏览器图片内部流程不再进行 base64 编解码，对象 URL 释放有生命周期测试。
- 其余改动未建立改造前后 SQL、字节数或耗时对照，因此不宣称整体性能提升。

## 独立后续任务

AI 策略评测需要脱敏标注集、固定模型与参数、多次重复实验、准确率/成本/延迟指标和明确
验收阈值。需分别测量第二次解析触发率、解析分歧率、仲裁调用率、JSON 修复率，以及重复
检测的文本和视觉调用率。完成这些证据前，不调整现有提示词、策略或阈值。

## 最终验证

- `npm test`：251 个单元测试文件、1,600 个用例通过。
- `npm run test:integration`：99 个集成测试文件、598 个用例通过；每个 worker 从完整
  migration journal 建立隔离 schema。
- `npm run check`：格式、架构、测试架构、Knip、ESLint、TypeScript、i18n、覆盖率和生产
  构建全部通过。
- 覆盖率全量运行：350 个文件、2,198 个用例；statements 79.17%、branches 70.19%、
  functions 81.46%、lines 80.81%，未降低仓库阈值。
- Next.js 生产构建通过；受保护路由客户端体积为 208,046 gzip bytes，低于 220,000 预算。

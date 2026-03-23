# Cashier 编码模式

本文档只记录长期稳定、应当被持续遵守的工程规则。实现细节、运行手册、环境变量表、历史解释以代码和测试为准，不在这里维护平行说明。

## 0. 文档治理

- 活文档只保留三份：`docs/architecture/PRD.md`、`docs/architecture/UI.md`、`docs/architecture/coding-patterns.md`
- `PRD.md` 只描述当前产品范围、核心流程和领域术语，不记录实现细节
- `UI.md` 只描述视觉与交互规范
- `coding-patterns.md` 只记录 durable engineering rules
- 运行时细节、环境变量、任务注册、HTTP 边界和缓存行为以代码与测试为准；不要维护平行的描述性 Markdown 镜像

## 1. 模块边界

- `src/modules/{domain}/actions.ts`、`queries.ts`、`use-cases.ts`、`tasks.ts` 只做顶层导出，不承载实现逻辑
- `application/` 是业务实现层；`server-actions/` 是鉴权与输入校验边界；依赖方向只能是 `server-actions -> application`
- 跨模块调用只通过模块顶层公共入口，不要 deep import `application/` 或 `server-actions/`
- 输入 contract 归 `contract-schemas.ts` 所有；边界校验放在 schema 和 server action，不把重复校验散落到调用方

## 2. 服务端边界

- 需要登录态或账本权限的内部读写走 Server Actions，并使用对应 access wrapper
- API v1 route handlers 必须复用 `src/app/api/v1/_shared/route-helper.ts`，统一处理 service credential 鉴权、限流和错误响应
- 业务错误使用 `src/lib/errors.ts` 中的标准错误类型；Server Actions 直接抛错，HTTP 边界负责转成响应

## 3. 查询与缓存

- React Query key 统一定义在 `src/lib/query-keys.ts`，不要在组件或 hook 中手写字符串数组
- 通用 source-document 列表合同只保留 cursor pagination；workspace stream 如需一次取回有限集合，必须使用显式的 bounded collection key 和 caller-owned `limit`
- 乐观更新统一通过 `useLedgerMutation` 和 Query Cache 完成；失效放在 `onSettled`，不要用本地 `useState` 维护服务端真值

## 4. 后台任务

- 任务注册集中在 `src/lib/flow/task-registry.ts`；不要在其他位置零散调用 `engine.register`
- 提交任务时，关联实体必须把 `entityType` 和 `entityId` 作为一等元数据传入，供任务队列、取消、回溯和序列化使用
- 任务执行与编排规则以 `src/lib/flow/` 下的实现为准，不额外维护 Markdown 版任务注册清单

## 5. 数据与配置

- 账本隔离和软删除过滤必须在查询条件中落实，不依赖取回后再做内存过滤
- 业务日期字段使用 `yyyy-MM-dd` 字符串，时间与时区换算在边界层处理
- 环境变量定义的唯一事实源是 `src/lib/env/catalog.ts`；不要维护手工同步的 Markdown 变量表

## 6. 客户端状态

- TanStack Query 管理服务端状态
- Zustand 只管理轻量客户端 UI 状态
- 异步处理状态轮询统一复用 `useSmartPolling`，不要在业务组件中手写轮询机制

## 7. 测试

- 测试文件只放在 `tests/unit/` 与 `tests/integration/`
- unit tests 负责纯逻辑、组件、governance；integration tests 保持真实边界覆盖
- 架构和文档约束要落成自动化 governance tests，避免依赖人工巡检

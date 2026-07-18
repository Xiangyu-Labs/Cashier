# 应用层原始规格差距分析

日期：2026-07-17

## 结论

`prepare-production-ready-application-layer` 的 88/88 任务已经完成，说明本次批准的“本地应用层迁移、兼容、回填、切换演练和契约冻结”已经完成；它不等于
`2026-07-09-vercel-cloudflare-rewrite-design.md` 中所有产品目标都已经实现。

对照原始详细规格和当前 `main`，核心账务流程、revision 模型、恢复能力、授权文件读取、Stream/Details/Stats
一致性及大部分加载优化已经完成，但仍有 12 组明确的业务或上层差距。其中：

- P0：金额精度、服务凭证安全。
- P1：重解析候选确认、失败/异常恢复动作、诊断语义、主币种锁定、API v1 最终契约。
- P2：上传边界、Stream 分页、乐观插入、轮询退避、Header 计数。
- 另有一项人工浏览器验收被明确豁免，因此只能标记为“未验证”，不能标记为缺陷或已通过。

本报告只统计业务层、应用层和前端层。Neon、R2、Queue/Worker、Vercel、生产数据跨 provider
迁移和正式生产切换不计入本文差距。

## 判定口径

原始产品目标以以下两份文档为依据：

1. `docs/superpowers/specs/2026-07-09-vercel-cloudflare-rewrite-design.md`：详细业务和产品目标。
2. `docs/superpowers/specs/2026-07-13-managed-infrastructure-remaining-work-design.md`：后续基础设施迁移范围，并引用和保留上述业务边界。

当前实现以 `main` 分支代码、冻结契约 `cashier-application-contracts@1.0.0`、自动化测试及
`docs/operations/application-contract-*.md` 为依据。

分类含义：

- **缺失**：原始规格明确要求，当前没有可用业务流程。
- **部分实现**：底层能力或部分界面存在，但完整语义、边界或用户动作没有实现。
- **兼容偏差**：为保留现有客户端或旧行为而有意没有到达原始最终目标。
- **未验证**：自动化证据存在，但人工可视化验收被豁免。

## 明确差距

### GAP-01 P0：账务金额仍经过 JavaScript `number`

**原始要求**：应用和 API 边界使用规范 decimal string；账务计算不得经过 JavaScript `number`；使用统一 decimal
库和按币种精度 half-up 舍入。

**当前证据**：冻结的 projection contract 已使用字符串，但解析、费用分摊、汇率、手工录入和账目修改仍包含
`number`、`Number(...)`、`parseFloat(...)`、`toFixed(...)` 和浮点运算。例如：

- `src/application/adapters/sqlite/business-ports.ts`
- `src/application/adapters/sqlite/mutate-ledger-entries.ts`
- `src/application/adapters/sqlite/exchange-rate.ts`
- `src/modules/source-document/application/parse-source-document/result-mapper.ts`
- `src/modules/source-document/application/parse-source-document/parser-schema.ts`
- `src/modules/source-document/hooks/useQuickEntryFormController.ts`

**判定**：部分实现。现有测试通过不等于满足原始精度不变量，浮点误差可能影响分摊、换汇、筛选和统计。

**建议**：单独建立 P0 OpenSpec change，统一 decimal value object、舍入策略、parser 映射、手工录入和汇率计算，并增加边界值、重复分摊和多币种回归测试。

### GAP-02 P0：Service Credential 仍以明文持久化并可重复读取

**原始要求**：token 只在创建时显示一次；数据库仅保存 token hash、prefix、创建信息和撤销时间；无效 bearer
尝试按 IP 和 token prefix 限流，不记录完整 token。

**当前证据**：

- `src/persistence/schema/ledger.ts` 的 `service_credentials.key` 保存完整 key。
- `src/application/adapters/sqlite/business-ports.ts` 用完整 key 等值查询，并在列表 DTO 中返回 `row.key`。
- `src/modules/ledger/ui/ServiceCredentialSection.tsx` 在凭证列表中持续显示完整 key，而非只在创建时显示。
- `src/app/api/v1/_shared/route-helper.ts` 先认证再限流，因此无效 bearer 尝试不会进入现有 API v1 限流；限流键还是完整 token。

**判定**：缺失。这是安全和产品契约差距，不应等到 provider 迁移时再顺带解决。

**建议**：单独建立 P0 OpenSpec change，设计兼容迁移、hash/prefix 查询、一次性显示、无效认证限流和已有明文凭证轮换方案。

### GAP-03 P1：成功重解析会立即覆盖现有账目，没有候选确认

**原始要求**：已有 active revision 时，成功重解析应保留为 completed pending candidate，显示“新解析结果待确认”；用户明确 Accept 后才原子替换账目，或 Abandon 后保留原账目。

**当前证据**：`src/application/adapters/sqlite/ledger-projections.ts` 的 `activateRevision()` 在解析成功时直接替换 projection、设置新 active revision 并清空 pending。代码中没有 candidate accept/abandon 的 command、action 或 UI。

**判定**：缺失。失败或异常重解析能保护旧 active 结果，但成功重解析仍会自动覆盖人工修订后的正式账目。

**建议**：新增 P1 OpenSpec change，补 completed-candidate 状态、Accept/Abandon 事务、确认文案、并发保护和 UI。

### GAP-04 P1：失败/异常账单的恢复动作不完整

**原始要求**：失败和异常卡片均提供 Retry、Edit retry、Manual entry、Delete；直接 Retry 复用快照，Edit retry
打开预填表单，Manual entry 用当前证据手动完成。

**当前证据**：

- contract 会为失败/异常返回 `retry`、`edit_retry`、`manual_correction`、`delete`。
- UI 没有读取 `supportedActions`，也没有 `manual_correction` 入口。
- Stream 卡片的单个“Retry”菜单项实际打开 `SourceDocumentEditRetryDialog`；没有独立的一键 Retry 动作。
- Detail modal 提供 Edit Retry 和 Delete，但没有 Manual entry。

**判定**：部分实现。底层 revision/retry/manual projection 能力存在，但用户无法按原始规格完成全部恢复操作，且 Retry 文案与实际行为不一致。

**建议**：与 GAP-03 合并为“source-document review and recovery” P1 change，并覆盖 pending revision 的互斥规则和证据继承。

### GAP-05 P1：异常/失败代码和界面诊断信息被过度简化

**原始要求**：异常使用 `insufficient_evidence`、`currency_required`、`amount_conflict`、
`unsupported_document`；系统失败使用 `queue_enqueue_failed`、`queue_exhausted`、`ai_api_failed`、
`ai_schema_invalid`、`exchange_rate_failed`、`storage_failed`、`database_failed`。失败卡片显示直接标签、稳定代码和短解释。

**当前证据**：当前仅保留通用应用错误，如 `VALIDATION_FAILED`、`PROCESSING_UNAVAILABLE`、
`STORAGE_UNAVAILABLE`；anomaly 主要是自由文本 `anomalyReason`。`SourceDocumentCardHeader` 只显示 anomaly reason，
没有渲染 DTO 中的 `errorCode`，也没有上述细粒度失败码。

**判定**：部分实现。状态和脱敏边界已实现，但产品诊断语义及截图可诊断能力未达到原始规格。

**建议**：新增 P1/P2 change，区分业务 anomaly code、稳定 failure code 和公开 application error，补 parser/dispatcher 映射、i18n 文案及卡片展示。

### GAP-06 P1：有账目后主币种仍可修改

**原始要求**：workspace 一旦存在 active ledger entries，主币种只读；已有账本更换报告币种必须走另行设计的 rebase，避免 Stats 汇总混合币种事实。

**当前证据**：`src/modules/ledger/ui/CurrencySection.tsx` 始终渲染可用 `<select>`；设置更新后
`src/application/adapters/sqlite/business-ports.ts` 会重算 active entries。

**判定**：明确偏离。当前“直接重算”可能是保留旧行为，但不是原始规格批准的锁定模型或显式 rebase。

**建议**：先作产品决策。若原始不变量仍有效，建立 P1 change 同时在 UI 和应用服务层锁定；若接受重算，则必须把它正式定义为有审计、失败原子性和汇率快照规则的 rebase。

### GAP-07 P1：API v1 尚未到达原始最终契约

**原始要求**：`multipart/form-data`；总计 4 MB；最多 3 张图；单图 3 MB；文本 10k；成功返回
`202 Accepted`，仅含 `sourceDocumentId` 和 `acceptedAt`，不暴露 revision/task/status。

**当前证据**：`src/app/api/v1/source-documents/route.ts` 读取 JSON 并返回 HTTP 201；响应还包含
`revisionId`、`revisionState` 及兼容期内的 deprecated `status`。共享输入允许 10 张图、单图 10 MB，路由没有明确的 4 MB 总体限制。

**判定**：兼容偏差。当前 fixture 和兼容期是本次 88/88 change 明确接受的，但原始 API 最终目标尚未实现。

**建议**：在兼容期结束前建立 API v1 contract change，确认是原地收敛 v1 还是发布新版本，并覆盖 multipart、413、幂等 content hash 和响应字段迁移。

### GAP-08 P2：Web 上传的总量、像素和真实文件验证不完整

**原始要求**：Web 最多 10 张；原图 20 MB、标准化后 4 MB、revision 总计 20 MB、16 MP；服务端验证 magic bytes、可解码性、可信 MIME、SHA-256、大小和像素。

**当前证据**：`src/application/adapters/local/stored-files.ts` 实现了 session、ownership、expiry、文件数、
单文件 10 MB、声明 MIME、长度和 SHA-256 校验；没有 revision 总字节限制、16 MP 检查或明显的 magic-byte/decode
验证，且大小与原始产品限制不一致。

**判定**：部分实现。R2 的具体签名和 Worker 验证属于后续基础设施，但 provider-neutral 限制和产品边界仍需先明确。

**建议**：在接入 R2 前先冻结统一 upload policy contract；由 local/R2 adapters 运行同一验证套件，避免 provider 切换改变产品行为。

### GAP-09 P2：Stream 主路径仍最多一次加载 1000 条，不是约 20 条游标分页

**原始要求**：Stream 首屏约 20 个 source documents，并使用 keyset/cursor “load more”；避免 broad bootstrap payload。

**当前证据**：底层 `list-source-document-page` 已支持默认 20 和 cursor，但实际 Stream 使用
`useSourceDocumentCollection` 与 `getLedgerPageBootstrap`，两处 `STREAM_COLLECTION_LIMIT` 都是 1000；当前 Stream
没有使用对应的分页加载流程。Details 的 50 条 cursor pagination 已实现。

**判定**：部分实现。小 fixture 的 payload 测量通过，但不能证明大历史账本达到原始性能目标。

**建议**：P2 performance change，将 pending/attention 与 completed history 分开查询，Stream completed history 使用
20 条 cursor pagination，并用 1k/10k 历史 fixture 测量首屏响应和 hydration 大小。

### GAP-10 P2：新提交没有真正乐观插入 Stream

**原始要求**：提交后立即把新的 processing source document 乐观插入 Stream 顶部。

**当前证据**：`useSourceDocumentSubmitMutations.ts` 的 create `onOptimisticUpdate` 只保存原 pending cache 用于回滚，
没有向 Stream/pending cache 插入临时记录；完成后依赖 query invalidation 获取服务端结果。Retry 只乐观更新 detail 状态。

**判定**：缺失。功能可用，但慢网络下的即时反馈没有达到原始交互目标。

**建议**：并入 GAP-09 的 P2 performance/UX change，使用稳定 client submission ID 或 mutation placeholder，并验证失败回滚和服务端记录去重。

### GAP-11 P2：处理刷新固定为 3 秒，没有长任务退避

**原始要求**：开始时每 2–3 秒轮询；持续 processing 后退避到约 10–15 秒；没有相关 processing 项时停止。

**当前证据**：`revision-state-refresh.ts` 已实现共享 coordinator、focus/visibility/online/offline 和终态停止，但所有轮询始终使用固定 `3000ms`，没有退避状态。

**判定**：部分实现。集中刷新和停止条件已经完成，缺少原始规格的长任务请求降载。

**建议**：并入 GAP-09，增加按 revision age 或连续轮询次数退避，并在新提交、focus、reconnect 时恢复快速刷新。

### GAP-12 P2：Header 的轻量 processing/attention 计数未实现

**原始要求**：Header counts 是轻量查询面，展示 processing 和 attention 数量，并在相关状态完成后定向刷新。

**当前证据**：当前 `Header.tsx` 只显示品牌和新增按钮。collection 内部会计算 queued/processing/anomaly/failed
数量，但没有 Header query/DTO 或 Header 展示。

**判定**：缺失。这不影响账务正确性，但原始导航信息架构没有完成。

**建议**：P2 UI change，定义小型 counts DTO，避免为计数加载 Stream 全量数据，并纳入集中 refresh invalidation。

## 已实现的原始上层目标

以下内容有代码和自动化证据，不应再次列为缺口：

- source-document 稳定身份、immutable revisions、active/pending 指针及历史保留。
- 首次解析、失败、异常、retry/edit retry 的 revision 创建及旧 active result 保护。
- durable processing intent、claim/lease、重启恢复、重复投递和 stale completion 防护。
- manual/quick entry、账目编辑/删除和 active ledger projection 原子事务。
- Stream、Details、Stats 读取 active projection，并排除 pending/failed/anomaly/deleted 数据。
- stored-file identity、upload session/finalization、所有权校验和授权文件读取。
- Details 每页 50 条的 cursor pagination、bounded DTO 和敏感响应清理。
- 页面 Suspense、重 tab/modal 动态加载及独立 server fetch 并行化。
- 集中刷新、无 processing 时停止轮询、focus/visibility/online/offline 行为。
- PWA 保留 manifest/icons，禁用 authenticated/API/RSC/protected image runtime caching。
- OTP、分类、Settings、API 幂等基础能力及 zh/en、主题等现有产品能力。
- 本地 Docker migration/backfill、幂等重启、回滚、完整性和数据 reconciliation。

## 未验证项

任务 8.6/8.7 的桌面和移动浏览器人工验收被用户于 2026-07-16 明确豁免。自动化测试覆盖了焦点、Escape、
键盘图片导航、announcement、label、touch target、offline/focus/reconnect 等契约，但没有实际截图或真实 viewport
交互记录。

因此当前不能据实确认以下内容，也不能仅凭此判定代码有缺陷：

- 真实桌面和移动 viewport 下没有文字、按钮或 modal 重叠。
- processing/anomaly/failed/retry 的最终视觉层级和文案达到预期。
- 图片预览、键盘导航、焦点恢复和触控操作的实际体验。
- “same Warm Ledger, new engine”的最终视觉一致性。

## 不属于本文的后续工作

以下内容仍由 `migrate-managed-infrastructure-foundation` 负责，不应被误报为本次上层业务缺失：

- Neon/Postgres adapters、schema 和生产数据迁移。
- R2 私有对象、signed upload/read、临时对象 lifecycle。
- Cloudflare Queue/Worker/DLQ、跨服务签名和 provider retry。
- Vercel hosting、域名、preview/staging/production 配置。
- 多 provider 可观测性、备份恢复、secret rotation 和正式生产 cutover。

但 provider 接入不得自行改变本文中的业务契约。若 provider 限制要求修改 API、上传、错误、金额或 UI 行为，必须先建立并批准新的 OpenSpec change。

## 推荐后续顺序

1. **P0 correctness/security**：GAP-01 金额 decimal 化；GAP-02 service credential hash/一次性显示/无效认证限流。
2. **P1 document lifecycle**：GAP-03、04、05，完成候选确认、恢复动作和稳定诊断语义。
3. **P1 bookkeeping/API decision**：GAP-06 主币种锁定或正式 rebase；GAP-07 API v1 最终契约。
4. **P2 bounded upper layer**：GAP-08 至 12，统一上传 policy、Stream 分页、乐观插入、刷新退避和 Header counts。
5. 上述业务契约稳定后，再实施 managed-provider adapters 和生产迁移，避免基础设施迁移期间重复改上层。

不建议把这 12 组差距塞回已完成的 88/88 change。应至少拆成“账务精度与凭证安全”“source-document review/recovery”“bounded upper-layer quality”三个新的 OpenSpec changes；API v1 是否单独拆分取决于兼容期和真实客户端迁移策略。

## 主要证据来源

- `docs/superpowers/specs/2026-07-09-vercel-cloudflare-rewrite-design.md`
- `docs/superpowers/specs/2026-07-13-managed-infrastructure-remaining-work-design.md`
- `openspec/changes/prepare-production-ready-application-layer/tasks.md`
- `docs/operations/application-contract-handoff.md`
- `docs/operations/application-contract-release.md`
- `docs/operations/application-layer-final-quality-evidence.md`
- `docs/operations/application-layer-local-switch-rehearsal.md`

# Cashier Remaining Product Completion Specification

**Status:** Approved

## Problem

Cashier 已完成 Postgres 数据层、R2 文件存储、source-document revision 模型和主要账务流程，但当前实现仍存在一组会影响金额正确性、凭证安全、重解析保护、失败恢复、大数据量性能和处理体验的缺口。

这些缺口需要在不恢复旧功能、不引入 Cloudflare Worker/Queue、不改变现有 API v1 契约的前提下统一补齐。处理模型继续使用 Postgres 持久化 processing intent 与 Next.js `after()`，并明确其 request-bound 恢复语义。

## Goals

- 所有持久化账务金额、换汇、分摊和汇总计算使用 decimal string 与统一的十进制定点运算，不经过 JavaScript 浮点数。
- Service Credential 仅在创建时显示一次完整 token，数据库只保存不可逆 hash、可识别 prefix 和 suffix，并对无效认证尝试实施安全限流。
- 已有正式账目的 source document 成功重解析后形成待确认候选，只有用户接受后才替换 active projection。
- 失败和异常 source document 提供与其状态匹配的一键重试、编辑后重试、手工修正和删除操作。
- 用户界面展示稳定、脱敏且可操作的异常代码和处理失败代码。
- 账本存在 active entries 后锁定主币种，避免无审计的历史金额重算。
- Web 上传在客户端和服务端执行一致的文件数、字节、像素、格式和解码安全限制。
- Stream 使用有界首屏和 cursor pagination，不再加载最多 1000 条历史记录作为主路径。
- 新提交立即在 Stream 中显示可回滚、可去重的乐观 processing 项。
- revision 状态刷新从快速轮询逐步退避，并在无活动任务、离线或页面不可见时停止。
- Header 通过轻量查询展示 processing 和 attention 数量。
- Postgres processing intent 在 `after()` 未执行或进程中断后，可由后续相关用户请求发现并重新调度。

## Non-Goals

- Cloudflare Worker、Cloudflare Queue、DLQ、跨服务签名或任何 Cloudflare 后台处理运行时。
- 新增兼容 API 版本，或将 API v1 改为 `multipart/form-data`、`202 Accepted` 或新的响应结构。
- 改变 API v1 已有业务请求和响应契约。
- Vercel Cron、常驻进程或无人访问时的后台处理时效保证。
- SQLite 到 Postgres、local files 到 R2 的一次性生产数据迁移、域名切换、正式流量切换或生产回滚执行。
- 已完成的 Postgres、R2、source-document revision、授权文件读取、Details pagination、Stats active projection 或 PWA 基础能力重写。
- 主币种 rebase。若未来允许修改已产生账目的账本主币种，需要单独设计审计、汇率快照和失败原子性。
- 恢复已删除的任务中心、批量任务控制、导出、账户删除或其他退役功能。
- 仅为本次改动进行全面视觉重设计。

## Background

当前运行时使用 Postgres 保存账本、source document、revision、ledger projection、processing intent 和应用设置，使用 R2 保存 source-document 文件。新建或重试 source document 时，数据库事务先提交 pending revision 与 processing intent，随后 Server Action 通过 Next.js `after()` 执行该 intent。

该架构已经具备 revision claim、重复执行防护、stale completion 防护和 active projection 原子替换等基础能力，但 `after()` 只与当前请求生命周期关联。若回调没有执行或运行实例中断，数据库中的 intent 仍可保留，但当前主路径没有完整的请求触发恢复机制。

账务表使用 Postgres numeric/string 字段保存金额，但多个应用服务、parser mapper、手工录入、换汇和 UI view model 仍通过 `number`、`Number`、`parseFloat` 或 `toFixed` 计算。Service Credential 仍保存并返回完整 key。Stream、恢复动作、诊断代码、上传限制和刷新策略也只实现了部分目标行为。

## Decisions

### Processing Runtime

**Choice:** 使用 Postgres processing intent 加 Next.js `after()` 的 request-bound 模型，并由后续相关请求恢复可重试 intent。

**Rationale:** 当前产品规模没有引入外部 Queue/Worker 的明确需求。持久化 intent 保留幂等和恢复依据，而页面、提交、重试和状态查询请求可以重新调度过期工作。系统明确不承诺在完全无人访问时自动恢复。

### API Evolution

**Choice:** 保留当前 API v1，不新增 v2，也不改变 v1 的请求格式、成功状态码或响应字段。

**Rationale:** 当前没有 multipart 外部上传或新 API 版本的真实产品需求。无调用方需求时引入新版本会增加维护和迁移成本。本次只修复不应依赖版本升级的凭证与认证安全问题。

### Main Currency

**Choice:** 账本一旦存在 active ledger entries，主币种在 UI 和应用服务层均不可修改。

**Rationale:** 直接修改并重算历史账目缺少明确的汇率快照、审计和失败恢复语义。锁定主币种是当前最小且可验证的正确性边界。

### Reparse Completion

**Choice:** 有 active revision 的 source document 成功重解析后保留 completed candidate，用户 Accept 后才原子激活，或通过 Abandon 放弃候选。

**Rationale:** 自动覆盖会丢失用户对当前正式账目的人工修改。候选确认使新的 AI 结果可审查，同时保持现有 active projection 持续可用。

### Specification Boundary

**Choice:** 使用一份 spec 定义剩余产品能力，并按独立边界实施和验证。

**Rationale:** 这些缺口共同决定 source-document 到正式账目的完整可靠性，但不要求在实现中形成单个大提交。统一规格可以避免金额、revision、UI 和刷新行为之间出现矛盾。

## Design

### Decimal Money Model

新增共享 money/decimal 模块，使用仓库依赖中选定的任意精度十进制库。模块接收和返回规范 decimal string，并集中提供：

- 金额解析、规范化和合法性校验。
- 按 ISO 货币精度执行 half-up 舍入；没有单独配置时默认两位小数。
- 汇率乘除、金额换算、合计和比较。
- 费用按多条 entry 分摊，并将舍入余数确定性地分配，使分摊结果之和严格等于原费用。
- 面向 UI 的格式化转换；只允许在纯展示型百分比、图表坐标等非账务事实中使用 `number`。

parser schema、result mapper、quick/manual entry、ledger entry mutation、exchange-rate service、Stats 聚合前处理和 API/application contracts 均传递 decimal string。数据库 numeric 字段继续作为持久化边界，不把读取值转换为 `number` 后再参与账务计算。

### Service Credential Security

Service Credential 使用随机高熵 token。创建响应是唯一一次返回完整 token 的接口；列表和后续读取只返回 id、name、prefix、suffix、createdAt、lastUsedAt 和 revoked/deleted 状态。界面将凭证显示为 `prefix••••suffix`，帮助用户区分凭证，但 prefix 和 suffix 不参与认证。

数据库增加 `token_hash`、`token_prefix` 和 `token_suffix`，停止新增明文 key。`token_hash` 使用带服务端 pepper 的确定性 HMAC-SHA-256 计算并承担唯一认证标识；prefix 和 suffix 仅用于展示且不要求唯一。认证流程对请求中的完整 token 计算同一 HMAC，并使用常量时间比较验证结果。日志、错误、rate-limit key 和 DTO 不得包含完整 token 或 token hash。

现有明文凭证通过增量迁移原地回填：迁移脚本读取完整 key，计算 `token_hash`、`token_prefix` 和 `token_suffix`，验证每条记录均完成且 hash 无冲突后删除或清空明文字段。现有 token 在迁移后继续有效，不要求用户默认轮换。只有凭证疑似泄漏、无法安全回填或迁移验证失败时，才撤销对应凭证并要求用户创建新 token。

`API_KEY_PEPPER` 作为独立运行时 secret 管理，不存入数据库或代码仓库。所有认证实例和迁移脚本必须使用同一 pepper；pepper 的备份、访问控制和未来轮换必须纳入运行手册。丢失 pepper 会使现有 token 无法认证，因此不得在没有凭证轮换方案的情况下直接更换。

API v1 在认证成功前和成功后分别限流：

- 无效或格式错误的 bearer 使用 IP 加安全派生的 token-prefix fingerprint 限流。
- 有效凭证使用 credential id 加 IP 限流。
- 限流与日志均不得保存完整 bearer token。

### Reparse Candidate Lifecycle

首次成功解析在没有 active revision 时继续直接激活。有 active revision 时，成功重解析执行以下状态转换：

1. pending revision 完成解析并保存 immutable candidate entries。
2. revision 标记为 completed candidate，但 active revision 和 active ledger entries 保持不变。
3. source document 暴露 `candidate_pending` 展示状态和 Accept、Abandon 操作。
4. Accept 在单个数据库事务中验证 candidate 仍为当前 pending revision，替换 projection，设置新的 active revision，并清除 pending pointer。
5. Abandon 将 candidate 标记为 abandoned，并清除 pending pointer，不修改 active revision 或 ledger entries。

同一 source document 在存在 processing 或 completed candidate 时不得再创建新的 retry revision。Accept、Abandon、Delete 和并发 Retry 使用 compare-and-set 条件，重复请求保持幂等，stale 请求返回稳定冲突错误。

### Failure and Anomaly Recovery

source-document read model 根据真实可执行能力返回 `supportedActions`，UI 必须使用该字段决定菜单和按钮：

- `retry`：直接使用最近失败或异常 revision 的 immutable evidence/settings snapshot 创建新 revision，无需打开编辑表单。
- `edit_retry`：打开预填表单，用户修改文本、日期或允许修改的证据后创建新 revision。
- `manual_correction`：使用当前 source document 及其文件证据打开手工录入流程；完成后创建 manual revision 并原子激活。
- `delete`：软删除 source document，并保证任何 stale processing completion 无法重新激活它。

Stream card 和 Detail modal 使用相同 action contract、权限检查和状态转换。操作文案必须与行为一致，一键 Retry 不得打开 Edit Retry 对话框。

### Stable Diagnostic Codes

revision outcome 区分 anomaly code、processing failure code 和公开 application error：

- Anomaly codes 至少包括 `insufficient_evidence`、`currency_required`、`amount_conflict`、`unsupported_document`。
- Processing failure codes 至少覆盖 AI provider failure、AI schema invalid、exchange-rate failure、storage failure、database/processing unavailable 和 request-bound execution interruption。
- API/application errors 继续使用稳定、脱敏的现有错误 envelope，不暴露 prompt、AI 原始输出、provider payload、R2 key、SQL 或 token。

Stream 和 Details 对失败或异常显示本地化短标签、稳定代码与简短解释。未知代码使用安全 fallback 文案，同时保留代码用于支持诊断。

### Main Currency Lock

设置查询增加 `mainCurrencyMutable` 或等价能力字段，其值由是否存在 active ledger entries 决定。存在 active entries 时：

- 设置页把主币种控件显示为只读，并解释当前账本已有正式账目。
- 应用服务拒绝直接更新主币种，即使请求绕过 UI。
- 其他设置仍可独立更新。
- 并发创建首条账目与修改主币种时，通过事务或条件更新保证不会产生混合主币种状态。

### Upload Policy

定义 provider-neutral upload policy，并由 Web 客户端预检、server action/API application layer 和 R2 adapter 共享测试。Web 默认限制为：

- 每个 revision 最多 10 张图片。
- 单个原始文件最大 20 MB。
- 标准化后的单个文件最大 4 MB。
- 一个 revision 标准化文件总计最大 20 MB。
- 单图最大 16 megapixels。
- 文本最大 20,000 字符。

服务端不信任浏览器声明的 MIME、尺寸或文件名。上传完成或 finalize 前必须验证 magic bytes、可信 MIME、可解码性、实际字节数、像素数、SHA-256、display order、ownership、session expiry 和 revision 总量。失败对象不得关联到 source document，错误响应不得暴露 R2 object key。

该 policy 不改变 API v1 的请求格式；API v1 继续沿用现有契约和已配置限制。

### Bounded Stream Loading

Stream 数据分成轻量 active-work 区域和 completed history：

- processing、candidate、anomaly 和 failed 等需要用户关注的记录通过有界 attention query 获取。
- completed history 首屏默认 20 条，使用稳定 keyset cursor 加载更多。
- 客户端合并分页时按 sourceDocumentId 去重，并维持明确的排序规则。
- ledger bootstrap 不再携带最多 1000 条 Stream 历史记录。
- 查询 DTO 不包含 revision evidence、内部 processing fields 或文件 provider keys。

使用 1,000 和 10,000 条历史 source-document fixture 验证首屏查询数量、返回条数、序列化 payload 和分页正确性。

### Optimistic Submission

Web 提交开始后使用 client submission id 创建临时 processing item，并立即插入 Stream 顶部。服务端成功响应后，使用 sourceDocumentId 替换临时 identity；后续 query refresh 不得出现重复记录。

上传、验证或创建失败时回滚临时项并显示可操作错误。页面切换、重复点击、mutation retry 和服务端响应早于缓存更新等竞态不得永久保留 placeholder。

### Adaptive Refresh

集中 revision refresh coordinator 根据连续 processing 时长或轮询次数选择刷新间隔：

- 新提交、用户 Retry、窗口重新获得焦点或网络恢复时使用 2 至 3 秒快速刷新。
- 持续 processing 后逐步退避，最长间隔在 10 至 15 秒之间。
- 没有 processing/candidate transition、页面不可见或设备离线时停止定时刷新。
- attention count、Stream active-work query 和当前打开的 detail 使用同一轮状态信号进行定向失效，避免各组件独立轮询。

### Header Counts

新增轻量 counts query，至少返回 `processingCount` 和 `attentionCount`。该查询使用数据库聚合，不加载完整 source-document collection。

Header 在桌面和移动布局中展示 counts；零值不制造视觉噪音。创建、完成、失败、异常、Accept、Abandon、Retry、manual correction 和 Delete 后只失效相关 counts 与列表查询。

### Request-Bound Processing Recovery

processing intent 继续在创建 pending revision 的同一事务中持久化。`after()` 只尝试执行本次请求创建的 intent，不扫描无关账本。

以下经过认证且与账本相关的请求可以执行有界恢复检查：ledger page bootstrap、Stream active-work query、source-document detail query、新提交和 Retry。恢复检查只选择当前账本内满足以下条件的少量 intent：

- intent 未完成且没有有效 lease，或 lease 已过期。
- revision 仍是 source document 的当前 pending revision。
- source document 未删除，revision 未处于 terminal state。
- intent 未超过配置的 request-bound 重试上限。

请求返回前只 claim/调度，不同步等待 AI 处理完成。被调度的 intent 通过 `after()` 执行。重复请求和并发实例依赖数据库 claim token、lease 和 current pending revision 条件保证至多一个有效 completion。

若 request-bound 重试上限耗尽，revision 转为稳定失败状态并向用户提供 Retry/Edit Retry/Manual Correction，而不是无限保持 processing。系统文档明确说明：完全无人访问时不会自动恢复或提供后台完成 SLA。

## Interfaces and Data Flow

主要接口调整如下：

- Money contracts：账务输入、输出、parser result、exchange rate 和 projection amount 使用规范 decimal string。
- Service Credential create result：包含一次性 `token`；list/read DTO 只包含 `prefix` 和 `suffix`，不包含 token 或 hash。
- Source-document DTO：增加 candidate 展示状态、稳定 anomaly/failure code、真实 `supportedActions`，不包含内部 lease 或 provider material。
- Candidate commands：`acceptCandidate(sourceDocumentId, revisionId)` 与 `abandonCandidate(sourceDocumentId, revisionId)`，均要求 ledger ownership 和 current-pending CAS。
- Recovery commands：一键 retry、edit retry、manual correction 和 delete 共用状态校验与 idempotency 规则。
- Settings DTO：包含主币种是否可修改的 capability；update command 在服务端重复校验。
- Upload policy：客户端预检与服务端验证共享常量和独立 contract tests，但服务端结果具有最终权威。
- Stream queries：attention query 与 cursor-based completed-history query 分离。
- Header counts query：只返回数字聚合。
- Processing recovery：相关 authenticated read/write request 调用 bounded recovery selector，再用 `after()` 调度已 claim intent。

Source-document 重解析的数据流为：Retry 创建 immutable pending revision 和 intent，`after()` 解析，成功后保存 completed candidate，用户审查后 Accept 原子替换 projection，或 Abandon 保留原 active projection。

## Errors and Edge Cases

- 非法 decimal、指数形式、NaN、Infinity、超出数据库精度或货币精度的输入在写入前被拒绝。
- 分摊、负数、零金额、极小汇率和多次换汇不得产生浮点漂移或无法解释的余数。
- 凭证创建响应丢失后无法重新读取完整 token；用户必须撤销或轮换。
- 旧明文凭证迁移不得把完整 token 或 token hash 写入日志、migration report 或客户端响应；任何未成功回填的记录都会阻止删除明文字段。
- Prefix 和 suffix 只能用于显示与人工识别，不能用于认证、唯一性判断或作为无效 bearer 的限流键。
- `API_KEY_PEPPER` 缺失或不一致时应用必须启动失败，不能退回明文认证或静默创建无法验证的新凭证。
- 无效 bearer 限流不能允许攻击者通过随机 token 制造无限高基数持久化键。
- Candidate 在 Accept 前被删除、替换或放弃时，旧 Accept 请求返回稳定冲突且不修改 projection。
- Stale processing completion 不得覆盖更新的 candidate、active revision、manual correction 或已删除记录。
- Manual correction 与正在 processing/candidate 状态冲突时必须明确拒绝或先执行 Abandon，不能产生两个 current pending revisions。
- 未知 anomaly/failure code 必须安全显示，不能导致 card 或 detail 渲染失败。
- 主币种锁定必须同时覆盖 UI、Server Action/application service 和并发写入。
- 图片伪造 MIME、损坏编码、解码炸弹、超像素、超总量、重复 display order 或过期 session 时 finalize 失败且不创建 source document。
- Cursor 指向已删除或排序字段相同的记录时仍需稳定分页，不重复、不跳过可见记录。
- 乐观项与服务端项乱序到达时按 client submission id/sourceDocumentId 去重。
- 网络离线、页面隐藏和 React remount 不得生成重复 polling timers。
- Recovery selector 必须限制每次请求的扫描和调度数量，避免历史积压拖慢正常页面请求。
- `after()` 再次中断时 intent 保持可恢复；达到上限后转为用户可操作失败，而不是无限重试。

## Compatibility and Rollout

使用增量数据库迁移增加 credential hash/prefix/suffix、candidate lifecycle 所需字段或约束，以及必要的诊断字段。凭证迁移先回填并验证所有现有明文 key，再切换认证读取，最后删除或清空明文字段并收紧非空和唯一约束。迁移必须可在现有 Postgres 数据上执行，并保留现有 token 的有效性及 source-document revision 历史。

API v1 请求格式、成功状态码和响应结构保持不变。凭证列表停止返回完整 key，改为显示 prefix 与 suffix；正常迁移不要求用户轮换现有凭证。只有疑似泄漏或无法安全回填的凭证需要单独撤销和轮换。

功能可以按以下独立边界逐步启用，但每个边界必须在启用前通过对应测试：decimal money、credential security、candidate/recovery、upload policy、bounded Stream/refresh、request-bound recovery。任何阶段都不得依赖 Cloudflare Worker/Queue。

部署前运行 schema migration；Web runtime 启动时不隐式执行 migration。旧代码与新 schema 的短暂兼容仅限发布窗口，不长期维护双写。

## Acceptance Criteria

- 金额、分摊、换汇、编辑和 Stats 回归测试证明账务计算不使用 JavaScript 浮点运算，并覆盖典型浮点陷阱与货币舍入边界。
- 任意费用分摊后的规范 decimal 合计严格等于原费用。
- 新 Service Credential 的数据库记录和列表响应均不含完整 token；完整 token 只出现在创建响应一次，列表仅显示 prefix 与 suffix 组成的掩码标识。
- 迁移前创建的有效 token 在 hash/prefix/suffix 回填并删除明文字段后仍可通过 API v1 认证，无需默认轮换。
- 数据库只使用 `token_hash` 唯一识别凭证；仅凭 prefix、suffix 或两者组合无法通过认证。
- 无效 bearer 在认证前受到 IP 加安全 fingerprint 限流，日志和限流存储中不存在完整 token。
- 有 active revision 的重解析成功后，原 ledger entries 保持不变，直到用户 Accept。
- Accept 原子切换 active revision 和 ledger projection；Abandon 保留原 projection；重复或 stale 操作不产生额外修改。
- Failed 和 anomaly 状态在 Stream 与 Details 中均按 `supportedActions` 提供 Retry、Edit Retry、Manual Correction 和 Delete，且各动作行为与标签一致。
- 用户界面显示稳定、本地化、脱敏的 anomaly/failure code 和简短说明，未知代码有 fallback。
- 存在 active ledger entries 时，UI 不允许修改主币种，绕过 UI 的更新请求也被拒绝。
- Web 上传拒绝超文件数、超单文件、超 revision 总量、超像素、伪造 MIME、损坏图片、checksum 不符和过期 session，且失败时不创建 source document。
- Stream 首屏 completed history 最多返回 20 条，并能通过 cursor 完整加载 1,000 和 10,000 条 fixture，无重复或遗漏。
- ledger bootstrap 不再包含最多 1000 条 Stream 历史 collection。
- 新提交在服务端响应前显示于 Stream 顶部；失败能回滚；成功与刷新后不出现重复项。
- 长时间 processing 的刷新间隔会从 2 至 3 秒退避到 10 至 15 秒；无活动项、离线或页面不可见时停止。
- Header counts 使用独立聚合查询，并在相关状态转换后正确更新而不加载完整 Stream。
- 模拟 `after()` 未运行或 lease 过期后，下一次相关账本请求能有界重新调度 intent，并最终只应用一次有效 completion。
- 模拟连续 request-bound 执行失败后，revision 在配置上限处转为稳定、可重试的失败状态。
- 自动化测试证明系统运行和验收不需要 Cloudflare Worker、Cloudflare Queue、Vercel Cron 或额外 API 版本。
- 桌面和移动 viewport 的 Stream、Header、candidate actions、错误文案和对话框不存在不可操作的遮挡或文本溢出。

## Open Questions

None.

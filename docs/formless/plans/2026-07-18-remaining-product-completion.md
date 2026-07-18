# Cashier Remaining Product Completion Implementation Plan

**Status:** Draft

**Source Spec:** `docs/formless/specs/2026-07-18-remaining-product-completion.md`

## Goal

补齐 Cashier 已批准的金额正确性、凭证安全、source-document 审查恢复、上传边界、Stream 有界体验和 request-bound processing recovery，并保持现有 API v1 契约不变。

## Background

Cashier 当前使用 Postgres/Drizzle 保存账本、source document、revision、ledger projection、processing outbox 和设置，使用 R2 保存文件。创建和重试先在同一事务中写入 pending revision 与 processing intent，再由 Next.js `after()` 调用 in-process revision processor。

当前 contracts 已以 string 表达多数持久化金额，但多个应用服务和 UI view model 仍用 JavaScript `number` 参与账务计算。Service Credential 仍持久化完整 key，API v1 在认证成功后才按完整 key 使用进程内限流。成功重解析会立即激活并替换 projection，Stream 主路径一次读取最多 1000 条，上传验证、乐观插入、刷新退避、Header counts 和 request-triggered intent recovery 均不完整。

本计划只实现 approved spec 中的产品与运行时能力。不实施 Cloudflare Worker/Queue、Vercel Cron、API v2、API v1 breaking change、生产数据跨 provider 迁移或正式流量切换。

## Architecture

金额边界新增基于 `decimal.js` 的共享 decimal/money 模块，应用和持久化 contracts 使用规范 decimal string；只有图表坐标、百分比等纯展示边界可以转换为 `number`。

Service Credential 使用 domain-separated HMAC-SHA-256：完整 token 只在创建结果中出现，数据库保存 hash、prefix 和 suffix。迁移采用 additive schema、可重复 backfill、短期 legacy fallback、明文清除四阶段；不要求现有用户默认轮换。API v1 保持现有 payload/status/response，认证限流改为 Postgres 原子窗口桶，桶键只保存 HMAC 派生值。

Source-document lifecycle 保留 `completed` 作为 revision 处理结果，并新增 `abandoned` terminal outcome。若 completed pending revision 对应的 document 已有 active revision，则 read model 推导 `candidate_pending`，不立即替换 active projection。Accept/Abandon 使用 current-pending compare-and-set。异常和失败代码使用独立的稳定业务代码类型，不复用公开 application error code。

Stream 拆为有界 attention query 和 completed-history infinite query。创建 mutation 使用 client submission id 插入 placeholder；共享 refresh coordinator 管理快速刷新、退避和停止条件；Header counts 走独立聚合查询。

Request-bound recovery 在 Postgres outbox 上记录有界 schedule attempts 和下一次可调度时间。经过认证的账本请求只选择当前账本内少量 recoverable intents，并用 `after()` 调度现有单 intent executor。选择、claim、lease、stale pending guard 和 terminal exhaustion 均由数据库条件保护。

## Constraints

- approved spec 中的 API v1 请求格式、HTTP 成功状态和响应字段不得改变。
- 不得引入 Cloudflare Worker、Cloudflare Queue、DLQ、Vercel Cron 或常驻 drain loop。
- Web runtime 不得在启动时隐式运行数据库 migration；schema 继续由显式 Drizzle migration runner 管理。
- 账务事实不得通过 JavaScript `number`、`parseFloat`、`Number` 或 `toFixed` 参与计算；纯展示数值除外。
- 完整 Service Credential、credential hash、pepper、AI 原始输出、provider payload、SQL 和 R2 key 不得进入客户端 DTO 或日志。
- prefix 和 suffix 只用于显示，不能用于认证、唯一性判断或限流身份。
- Existing source-document ownership、current pending guard、active projection 原子性和 soft-delete stale-completion 防护必须保留。
- 每个数据库读面必须有界；恢复扫描不能随历史数据量线性增长。
- 只修改与本计划有关的文件，不恢复退役能力，不重写已完成的 Postgres/R2 边界。

## Context Map

- `docs/formless/specs/2026-07-18-remaining-product-completion.md` - 已批准的行为、非目标、边界情况和验收标准。
- `CLAUDE.md` - 仓库分层、Server Action、hook、测试和环境配置约定。
- `src/application/contracts/index.ts` - provider-neutral application ports、revision outcomes、actions、money/settings/credential contracts。
- `src/application/current.ts` - 当前 Postgres、R2 和 in-process adapters 的组合边界。
- `src/persistence/schema/ledger.ts` - ledger entries、settings metadata 和 service credential schema。
- `src/persistence/schema/source-document.ts` - source document、revision、files 和 revision-entry schema。
- `src/persistence/schema/application-model.ts` - processing attempts、outbox、upload session 和 idempotency schema。
- `src/persistence/postgres-migrations/` - 当前生产 Postgres migration 历史；新增 schema 只能追加。
- `scripts/migrate-database.mjs` - 显式 migration runner 和 advisory-lock 约束。
- `src/application/adapters/postgres/business-ports.ts` - settings、credential、currency 和其他业务 port 的当前实现。
- `src/application/adapters/postgres/ledger-projections.ts` - revision activation、manual projection 和 active ledger entry 事务。
- `src/application/adapters/postgres/revisions.ts` - pending revision 生命周期和 terminal outcome guards。
- `src/application/adapters/postgres/submissions.ts` - pending revision、attempt 和 outbox 的原子创建。
- `src/application/adapters/postgres/processing-intents.ts` - intent claim、lease、completion 和 retry ownership。
- `src/application/adapters/in-process/current-processing.ts` - `after()` 调用的单 intent executor；不得恢复全局 drain loop。
- `src/modules/source-document/document-contracts.ts` - Stream/detail DTO、supported actions 和 diagnostics 的客户端边界。
- `src/modules/source-document/application/queries/` - bounded list、detail、attention 和 read-model composition。
- `src/modules/source-document/hooks/` - Stream collection、optimistic mutation 和共享刷新协调器。
- `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts` - 当前 Stream 1000 条 bootstrap 和服务端预取边界。
- `src/modules/workspace/ui/Header.tsx` - Header counts 的目标 UI。
- `src/application/adapters/local/stored-files.ts` - 当前 R2 upload plan、target、finalization 和 ownership 校验。
- `src/lib/storage/image-processing.ts` - Sharp 解码、像素限制和标准化处理。
- `src/app/api/v1/_shared/route-helper.ts` - API v1 bearer 认证与限流顺序。
- `src/lib/env/startup.ts`, `src/lib/env/runtime.ts`, `.env.example` - pepper、上传限制和 recovery 配置的唯一环境边界。
- `tests/helpers/application-contract-suites.ts` - adapter contract suite 的复用模式。
- `vitest.unit.config.ts`, `vitest.integration.config.ts`, `package.json` - 可执行验证入口。

## Tasks

### Task 1: Establish Decimal Money Contracts And Replace Floating-Point Bookkeeping

**Outcome:**

所有账务输入、解析、换汇、分摊、projection、编辑和 Stats 汇总使用规范 decimal string 与统一 half-up 舍入，账务计算路径不再依赖 JavaScript 浮点数。

**Context:**

从 `src/application/contracts/index.ts`、ledger/source-document DTO、currency services、parser result mapper、quick/manual entry、Postgres business ports 和 stats adapters 开始。当前数据库 numeric 字段已经以 string mode 暴露，但中间层仍有 `Number(...)`、`parseFloat(...)` 和 `toFixed(...)`。

**Files:**

- Create: `src/lib/money/decimal.ts`
- Create: `src/lib/money/currency-precision.ts`
- Create: `tests/unit/lib/money/decimal.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/application/contracts/index.ts`
- Modify: `src/modules/ledger/contracts.ts`
- Modify: `src/modules/source-document/document-contracts.ts`
- Modify: `src/modules/currency/**`
- Modify: `src/modules/source-document/application/parse-source-document/**`
- Modify: `src/modules/source-document/application/use-cases/create-quick-entry.ts`
- Modify: `src/modules/source-document/hooks/useQuickEntryFormController.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentEntryMutations.ts`
- Modify: `src/application/adapters/postgres/business-ports.ts`
- Modify: `src/application/adapters/postgres/exchange-rate.ts`
- Modify: `src/application/adapters/postgres/ledger-projections.ts`
- Modify: `src/application/adapters/postgres/mutate-ledger-entries.ts`
- Modify: `src/application/adapters/postgres/ledger-reads/**`
- Modify: `src/modules/stats/**`
- Modify: affected currency, ledger, source-document and stats tests under `tests/unit/` and `tests/integration/`

**Decisions and Boundaries:**

- Add `decimal.js` as the sole arbitrary-precision implementation; do not introduce multiple decimal libraries.
- Canonical persisted/application amount is a non-exponent decimal string without redundant leading zeros; negative values remain allowed where current bookkeeping permits them.
- Currency rounding uses ISO minor-unit precision with half-up rounding and a two-decimal fallback for unknown configured currencies.
- Exchange rates retain six decimal places at their contract/storage boundary unless an existing wider database value is required for intermediate calculation; round money only at the currency boundary, not after every arithmetic operation.
- Fee allocation uses deterministic remainder distribution so allocated values sum exactly to the source amount.
- Stats DTO totals that are bookkeeping facts become decimal strings. Chart-only adapters may convert those strings to finite numbers immediately before rendering and must not feed the converted value back into mutations or persistence.
- Do not mechanically remove `number` from percentages, counts, timestamps, pixel dimensions or chart coordinates.

**Interfaces:**

- Consumes: Postgres numeric strings, parser structured results, exchange-rate responses and current ledger/source-document mutation inputs.
- Produces: shared parse/normalize/add/subtract/multiply/divide/compare/allocate/round functions and decimal-string contracts used by Tasks 3, 5 and 7.

**Verification:**

- Unit tests cover `0.1 + 0.2`, repeated allocation, negative/zero amounts, JPY-like zero precision, three-decimal currencies, very small exchange rates, invalid exponent/NaN/Infinity input and database precision overflow.
- Run focused unit suites for money, currency, parser mapper, quick entry and stats.
- Run focused integration suites for entry mutations, exchange-rate recalculation, settings currency workflow and stats conversion.
- Run `npm run tsc` and use `rg -n "Number\(|parseFloat\(|toFixed\("` over the listed bookkeeping modules to inspect every remaining occurrence and document why any display-only occurrence is valid.

**Escalate if:**

- Existing persisted values exceed Postgres numeric precision/scale or a supported currency requires a precision rule not representable by the chosen currency map.
- An external provider contract requires exponent notation or binary floating-point values at a business boundary.

### Task 2: Secure Service Credentials And Migrate Existing Tokens In Place

**Outcome:**

新旧 Service Credential 均通过 HMAC hash 认证，完整 token 只在创建时返回一次，列表显示 prefix/suffix，现有 token 无需默认轮换，API v1 的无效与有效认证请求均受跨实例安全限流。

**Context:**

先读 credential schema、`ServiceCredentialPort`、Postgres adapter、credential use cases/UI、startup env、API v1 route helper 和 current in-memory limiter。迁移必须允许现有明文 token 原地回填，并在验证后清空明文字段。

**Files:**

- Create: `src/lib/security/service-credential-token.ts`
- Create: `src/application/adapters/postgres/api-rate-limit.ts`
- Create: `scripts/migrations/hash-service-credentials.mjs`
- Create: `tests/unit/lib/security/service-credential-token.test.ts`
- Create: `tests/unit/scripts/hash-service-credentials.test.ts`
- Modify: `src/persistence/schema/ledger.ts`
- Modify: `src/persistence/schema/application-model.ts`
- Create: additive migration(s) under `src/persistence/postgres-migrations/`
- Modify: `src/application/contracts/index.ts`
- Modify: `src/application/adapters/postgres/business-ports.ts`
- Modify: `src/modules/ledger/contracts.ts`
- Modify: `src/modules/ledger/application/use-cases/create-service-credential.ts`
- Modify: `src/modules/ledger/application/queries/list-service-credentials.ts`
- Modify: `src/modules/ledger/ui/ServiceCredentialSection.tsx`
- Modify: `src/app/api/v1/_shared/route-helper.ts`
- Modify: `src/lib/ratelimit.ts`
- Modify: `src/lib/env/startup.ts`
- Modify: `src/lib/env/runtime.ts`
- Modify: `.env.example`
- Modify: credential, API v1, env and migration tests under `tests/unit/` and `tests/integration/`

**Decisions and Boundaries:**

- Hash is lowercase hex `HMAC-SHA-256(API_KEY_PEPPER, "credential:v1:" + token)`; comparison and lookup never use prefix/suffix.
- Persist `tokenHash`, `tokenPrefix` and `tokenSuffix`; keep the legacy plaintext column nullable only for the bounded migration window.
- The backfill script has explicit `backfill`, `verify` and `clear-plaintext` modes. It is resumable, never logs token/hash, refuses plaintext clearing if any active row lacks a valid hash/prefix/suffix, and reports only counts/credential ids safe for operations.
- New code creates hash-only credentials. During the migration window authentication may fall back to legacy plaintext only for rows without `tokenHash`; remove that fallback in the same task after backfill verification evidence is available. Do not dual-write new plaintext tokens.
- `API_KEY_PEPPER` is startup-required in all non-test runtimes. Tests set an isolated value. Missing pepper must fail startup validation.
- Invalid bearer rate-limit bucket is derived from a domain-separated HMAC of normalized client IP plus one of a fixed number of token shards derived from the presented bearer. This bounds attacker-created bucket cardinality while avoiding raw IP/token storage.
- Valid bearer rate-limit bucket is derived from credential id plus normalized client IP. Postgres performs atomic fixed-window increments; the process-local limiter is not authoritative for API v1.
- API v1 handler keeps its current response shapes and calls pre-auth invalid-attempt limiting before credential lookup, then valid-credential limiting after lookup.

**Interfaces:**

- Consumes: existing `ServiceCredentialPort`, current full tokens, trusted client-IP extraction and API v1 request wrapper.
- Produces: separate create DTO containing one-time `token`, list/read DTO containing only `prefix`/`suffix`, hash authentication helper, migration script, and Postgres rate-limit port used by API v1.

**Verification:**

- Unit tests prove deterministic domain-separated HMAC, masked display, no authentication by prefix/suffix, missing-pepper startup failure and bounded invalid-token bucket cardinality.
- Migration tests cover partial rerun, mixed migrated/unmigrated rows, duplicate/conflict refusal, verification failure, plaintext clearing and continued authentication with the original token.
- Integration tests inspect database rows and DTOs to prove no new plaintext token is stored or listed, existing tokens still authenticate after backfill, revoked tokens fail, and API v1 fixture/status/response remain unchanged.
- Concurrency test proves Postgres rate-limit increments enforce a shared limit across parallel callers.
- Run focused credential/API/env/migration suites, `npm run tsc`, and a sensitive-data response/log scan.

**Escalate if:**

- Production cannot supply one stable `API_KEY_PEPPER` to both migration and all runtime instances.
- Existing credential keys do not have a parseable format with enough undisclosed entropy after displaying the selected prefix/suffix lengths.
- The deployment process cannot provide the bounded backfill-and-clear ordering without old application instances continuing to write plaintext.

### Task 3: Implement Reparse Candidate Persistence And Atomic Accept/Abandon

**Outcome:**

成功重解析不再自动覆盖已有 active ledger projection；它形成可审查 candidate，Accept 原子替换，Abandon 保留原账目，所有并发和 stale 操作由 current-pending CAS 阻止。

**Context:**

从 application revision contracts、source-document/revision schema、submission adapter、revision processor、`activateRevision` 和 read-model status derivation开始。首次解析仍直接激活；只有已有 active revision 的 completed pending revision 成为 candidate。

**Files:**

- Modify: `src/application/contracts/index.ts`
- Modify: `src/persistence/schema/source-document.ts`
- Create: additive migration under `src/persistence/postgres-migrations/`
- Modify: `src/application/adapters/postgres/revisions.ts`
- Modify: `src/application/adapters/postgres/ledger-projections.ts`
- Modify: `src/application/adapters/postgres/read-models.ts`
- Modify: `src/application/adapters/in-process/revision-processor.ts`
- Create: `src/modules/source-document/application/use-cases/accept-source-document-candidate.ts`
- Create: `src/modules/source-document/application/use-cases/abandon-source-document-candidate.ts`
- Create: `src/modules/source-document/server-actions/candidates.ts`
- Modify: `src/modules/source-document/actions.ts`
- Modify: `src/modules/source-document/types.ts`
- Modify: `src/modules/source-document/document-contracts.ts`
- Modify: relevant application contract, processing, source-document query and concurrency tests.

**Decisions and Boundaries:**

- Persist revision outcomes `queued | processing | completed | anomaly | failed | abandoned`; `candidate_pending` is a source-document read status derived from completed pending revision plus non-null active revision, not a persisted processing outcome.
- Extend supported actions with `accept_candidate` and `abandon_candidate`. A candidate cannot expose Retry or Manual Correction until it is abandoned or otherwise resolved.
- Parser completion stores immutable revision entries first. With no active revision it activates as today; with an active revision it marks the pending revision completed and leaves active projection untouched.
- Accept transaction verifies ledger ownership, non-deleted document, exact current pending revision, pending outcome completed and existing active revision before replacing projection and clearing pending.
- Abandon transaction performs the same ownership/current-pending checks, marks revision abandoned and clears pending without touching active entries.
- Repeated Accept/Abandon of the already-resolved revision is idempotent only when the recorded terminal state proves the same result; otherwise return stable conflict.
- Delete, manual mutation and new retry cannot silently bypass an unresolved candidate.

**Interfaces:**

- Consumes: current pending revision creation, processor result entries, projection activation transaction and ownership wrappers.
- Produces: candidate-aware source-document DTO/status, `acceptCandidate(sourceDocumentId, revisionId)` and `abandonCandidate(sourceDocumentId, revisionId)` application commands used by Task 4 UI and Task 7 queries.

**Verification:**

- Integration tests cover first parse activation, successful reparse preserving prior entries, Accept atomic replacement, Abandon preservation, duplicate calls, concurrent Accept/Abandon, stale candidate ids, delete races and newer pending revision protection.
- Contract/read-model tests prove candidate status and actions are derived without leaking revision evidence or lease data.
- Run focused application contract, processing dispatcher, source-document submission/query and ledger projection suites plus `npm run tsc`.

**Escalate if:**

- Existing revision-entry storage cannot hold candidate entries without creating visible active ledger rows; do not duplicate candidate facts into active projection as a workaround.
- Any current client treats every `completed` pending revision as automatically active outside the identified read-model boundary.

### Task 4: Complete Recovery Actions, Stable Diagnostics And Candidate UI

**Outcome:**

Stream 和 Details 根据 `supportedActions` 提供真实的一键 Retry、Edit Retry、Manual Correction、Accept、Abandon 和 Delete，并显示稳定、本地化、脱敏的 anomaly/failure code。

**Context:**

依赖 Task 3 的 candidate contracts。先读 retry use case、quick/manual projection、source-document DTO mapper、card header/menu、detail modal、mutation hooks和 zh/en catalogs。当前 Retry 菜单混合了直接重试与编辑重试，`manual_correction` 未进入 UI，`errorCode` 也未完整渲染。

**Files:**

- Modify: `src/application/contracts/index.ts`
- Modify: `src/application/adapters/in-process/revision-processor.ts`
- Modify: `src/application/adapters/postgres/revisions.ts`
- Modify: `src/application/adapters/postgres/read-models.ts`
- Modify: `src/modules/source-document/application/parse-source-document/**`
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.ts`
- Create: `src/modules/source-document/application/use-cases/create-manual-correction.ts`
- Modify: `src/modules/source-document/server-actions/retry.ts`
- Create: `src/modules/source-document/server-actions/manual-correction.ts`
- Modify: `src/modules/source-document/actions.ts`
- Modify: `src/modules/source-document/document-contracts.ts`
- Modify: `src/modules/source-document/ui/SourceDocumentCardHeader.tsx`
- Modify: `src/modules/source-document/ui/SourceDocumentDetailModal.tsx`
- Modify: `src/modules/source-document/ui/processing-status.tsx`
- Modify: `src/modules/source-document/hooks/useSourceDocumentSubmitMutations.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentDetailMutations.ts`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: source-document UI, accessibility, parser, use-case and integration tests.

**Decisions and Boundaries:**

- Define separate unions for anomaly codes and processing failure codes. Do not widen `ApplicationErrorCode` to carry business outcomes.
- Minimum anomaly codes: `insufficient_evidence`, `currency_required`, `amount_conflict`, `unsupported_document`.
- Minimum failure codes distinguish AI provider unavailable, AI schema invalid, exchange-rate failure, storage failure, processing/database unavailable and request-bound retry exhaustion. Map unknown legacy values to a safe fallback without discarding the stored code.
- Direct Retry inherits immutable evidence/settings snapshot and schedules immediately; Edit Retry is the only action that opens the prefilled edit dialog.
- Manual Correction creates a manual completed revision from current source evidence and atomically activates it, subject to Task 3 pending/candidate mutual exclusion.
- Both Stream and Details render commands from `supportedActions`; do not infer permissions solely from visual status.
- UI shows a short localized label, stable code and concise explanation, never raw provider messages.

**Interfaces:**

- Consumes: Task 3 candidate commands/status, existing retry submission port, manual projection transaction and source-document DTOs.
- Produces: stable diagnostic code contracts, complete recovery commands and shared action rendering behavior used by Task 7 invalidation/counts.

**Verification:**

- Unit tests cover parser/provider error mapping, unknown-code fallback, exact supported-action matrices and Retry versus Edit Retry behavior.
- Integration tests cover evidence inheritance, manual correction activation, candidate/pending mutual exclusion, stale completion protection and delete races.
- Component/accessibility tests exercise all actions in Stream and Details, focus restoration, disabled/loading states and mobile labels.
- Run focused source-document/parser/UI suites, `npm run validate:i18n`, and `npm run tsc`.

**Escalate if:**

- A provider failure cannot be mapped to a stable sanitized category without exposing provider-specific material.
- Manual correction requires editing stored image bytes rather than reusing trusted stored-file identities.

### Task 5: Lock Main Currency After The First Active Ledger Entry

**Outcome:**

账本存在 active ledger entries 后，主币种在设置 DTO、UI 和服务端事务中均不可修改，其他设置仍可正常保存。

**Context:**

Task 1 的 decimal contracts 应先完成。阅读 settings port/adapter、`update-ledger` use case、settings view、CurrencySection 和现有 currency recalculation tests。当前更新主币种会直接触发 active entries 重算。

**Files:**

- Modify: `src/application/contracts/index.ts`
- Modify: `src/application/adapters/postgres/business-ports.ts`
- Modify: `src/modules/ledger/contracts.ts`
- Modify: `src/modules/ledger/application/queries/get-ledger-settings-view.ts`
- Modify: `src/modules/ledger/application/use-cases/update-ledger.ts`
- Modify: `src/modules/ledger/server-actions/settings.ts`
- Modify: `src/modules/ledger/hooks/useLedgerSettings.ts`
- Modify: `src/modules/ledger/ui/CurrencySection.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: settings, currency workflow and concurrent ledger-entry tests.

**Decisions and Boundaries:**

- Settings view exposes `mainCurrencyMutable`; it is false when at least one non-deleted ledger entry belongs to the current active revision of a non-deleted source document.
- Update command ignores no attempted main-currency change: if requested value differs while locked, return a stable conflict; unchanged value may accompany other setting updates.
- The lock check and settings update use one transaction/conditional write so concurrent creation of the first active entry cannot race with a main-currency change.
- Remove automatic historical rebase from the normal settings path. Keep any reusable recalculation service only if another approved workflow still uses it.
- UI renders the existing currency value read-only with localized explanation; it does not merely disable a select while leaving the server permissive.

**Interfaces:**

- Consumes: Task 1 money contracts, current settings port and active ledger visibility rules.
- Produces: `mainCurrencyMutable` capability and server-enforced conflict semantics.

**Verification:**

- Integration tests cover empty ledger mutation, locked ledger rejection, unchanged main currency with other settings, soft-deleted/non-active rows, and concurrent first-entry creation.
- Component tests verify the locked control remains readable and other settings remain editable.
- Run focused settings/currency/ledger tests, `npm run validate:i18n`, and `npm run tsc`.

**Escalate if:**

- A retained workflow outside Settings depends on silently rebasing all historical active entries when main currency changes.

### Task 6: Enforce A Shared Provider-Neutral Web Upload Policy

**Outcome:**

Web submission applies the same file-count, original-size, normalized-size, revision-total, pixel, MIME, decode, checksum, ordering, ownership and expiry rules on client preflight and authoritative server validation.

**Context:**

Read upload contracts, R2-backed stored-file adapter, upload target route, Sharp processing and client submission uploader. Current limits differ across layers, decode failures can return original bytes, and total revision bytes/pixels are not uniformly enforced.

**Files:**

- Create: `src/modules/source-document/upload-policy.ts`
- Modify: `src/application/contracts/index.ts`
- Modify: `src/application/adapters/local/stored-files.ts`
- Modify: `src/lib/storage/image-processing.ts`
- Modify: `src/modules/source-document/contract-schemas.ts`
- Modify: `src/modules/source-document/application/use-cases/prepare-inline-images.ts`
- Modify: `src/modules/source-document/hooks/source-document-submission-upload.ts`
- Modify: `src/app/api/stored-files/upload-targets/[sessionId]/[targetId]/route.ts`
- Modify: `src/lib/env/startup.ts`
- Modify: `src/lib/env/runtime.ts`
- Modify: `.env.example`
- Modify: upload, image-processing, stored-file adapter and route tests.

**Decisions and Boundaries:**

- Web defaults are 10 files, 20 MB original per file, 4 MB normalized per file, 20 MB normalized total per revision, 16 megapixels per file and 20,000 text characters.
- Public upload-plan contract advertises enforceable file count and per-file limits; server finalization remains authoritative for totals and trusted metadata.
- Sharp metadata/decode failure is terminal validation failure. Do not return unverified original bytes after processing errors.
- Determine trusted MIME from decoded content/output, not request headers or filename. Supported formats must be explicit and match client preflight.
- Compute SHA-256 over actual uploaded/normalized bytes and verify any declared checksum before R2 association.
- Enforce total normalized bytes and unique display order transactionally before finalization. Failed files never become source-document evidence; orphan cleanup retains current controlled behavior.
- Do not change API v1 request shape or introduce multipart handling. Keep any API-v1-specific existing limits separate from this Web policy.

**Interfaces:**

- Consumes: existing upload plan/target/finalization ports, Sharp and R2 object store.
- Produces: shared Web upload policy constants/validators and trusted stored-file metadata used by source-document submission.

**Verification:**

- Unit tests cover exact boundary sizes, aggregate overflow, pixel overflow, MIME spoofing, corrupt/truncated images, decode bombs, checksum mismatch, duplicate ordering and unsupported formats.
- Integration tests prove invalid uploads create no source document or readable stored-file relationship and never expose R2 keys.
- Run focused image/upload/stored-file/API route suites and `npm run tsc`.

**Escalate if:**

- R2 upload flow cannot provide actual bytes to the authoritative validation boundary before a stored file is finalized.
- Supported HEIC/TIFF behavior differs across deployed Sharp runtimes and cannot be made deterministic with the current dependency.

### Task 7: Replace Broad Stream Loading With Paginated, Optimistic And Adaptive UI

**Outcome:**

Stream 首屏只加载有界 attention 数据和 20 条 completed history，支持 cursor load-more、乐观新提交、共享退避刷新和轻量 Header counts，并在桌面/移动保持可操作布局。

**Context:**

依赖 Task 3/4 的 candidate/actions/diagnostics。阅读 current collection/page queries、pending query、bootstrap、query keys、collection hook、submit mutations、refresh coordinator、Header 和 LedgerEntriesTab。当前 bootstrap/hook 使用 1000 条 collection，已有 20 条 page query 可复用。

**Files:**

- Modify: `src/application/contracts/index.ts`
- Modify: `src/application/adapters/postgres/read-models.ts`
- Create: `src/modules/source-document/application/queries/get-source-document-counts.ts`
- Modify: `src/modules/source-document/application/queries/get-pending-source-documents.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-page.ts`
- Retire or narrow: `src/modules/source-document/application/queries/list-source-document-collection.ts`
- Modify: `src/modules/source-document/document-contracts.ts`
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/modules/source-document/actions.ts`
- Modify: `src/lib/query-keys.ts`
- Modify: `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentCollection.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentSubmitMutations.ts`
- Modify: `src/modules/source-document/hooks/revision-state-refresh.ts`
- Modify: `src/modules/source-document/hooks/source-document-detail-cache.ts`
- Modify: `src/modules/workspace/ui/Header.tsx`
- Modify: `src/modules/workspace/ui/LedgerEntriesTab.tsx`
- Modify: completed-group/load-more UI under `src/modules/workspace/ui/`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: query, bootstrap, hook, component, accessibility and i18n tests.

**Decisions and Boundaries:**

- Attention query contains queued, processing, candidate, anomaly and failed records and is independently bounded. Completed history uses existing keyset cursor with a default page size of 20.
- Use TanStack `useInfiniteQuery` for completed pages. Merge attention and completed results by sourceDocumentId with explicit status priority and stable server ordering.
- Bootstrap prefetches attention, counts and only the first completed page; it must not hydrate the legacy 1000-item collection.
- Create mutation generates a stable client submission id before upload starts and inserts one placeholder at the top of attention cache. Server success replaces it using returned sourceDocumentId; rollback removes it; refetch deduplicates both ids.
- Placeholder never enters persisted DTOs or API v1 responses and cannot be selected for destructive actions before server identity exists.
- Refresh coordinator starts at 3 seconds, backs off through deterministic stages to at most 15 seconds, resets on new submission/focus/reconnect and stops when no refreshable states, offline or hidden.
- Header counts DTO is exactly the small aggregate needed by navigation, at minimum `processingCount` and `attentionCount`; do not derive it by loading documents.
- Mutations invalidate attention, relevant completed pages, counts and detail selectively. Avoid global query invalidation where a bounded prefix exists.

**Interfaces:**

- Consumes: Task 3/4 statuses/actions, existing keyset read adapter, TanStack Query cache and mutation wrapper.
- Produces: attention DTO, completed infinite-page DTO, counts DTO, optimistic placeholder type and shared refresh signals used by Task 8 recovery-triggering reads.

**Verification:**

- Query/integration tests seed 1,000 and 10,000 source documents and prove first-page bounds, stable cursor ordering, no duplicate/skip across equal timestamps and bounded serialized bootstrap payload.
- Hook tests cover optimistic success replacement, upload/create rollback, server/cache response reordering, duplicate invalidation and load-more merging.
- Refresh tests use fake timers for fast interval, backoff, focus/reconnect reset, hidden/offline stop and single-coordinator behavior.
- Header/component tests verify zero/nonzero counts, targeted invalidation, text fit and controls on mobile and desktop.
- Run focused source-document query/hook/workspace UI suites, `npm run validate:i18n`, `npm run tsc`, then perform browser screenshots at representative desktop/mobile viewports for Stream, Header, candidate actions and diagnostics.

**Escalate if:**

- Existing date/amount filters cannot be represented by the current keyset cursor without unstable ordering; do not fall back to an unbounded collection.
- Attention records can exceed the chosen hard bound under realistic use; define an explicit attention pagination or operational cap before implementation continues.

### Task 8: Add Bounded Request-Triggered Processing Recovery And Final Integration Evidence

**Outcome:**

Pending processing intents survive missed/interrupted `after()` execution and are rescheduled by later authenticated ledger requests with bounded retries, while duplicate/stale work applies at most one valid completion and exhausted work becomes user-actionable failure.

**Context:**

Depends on Task 4 diagnostic/recovery actions and Task 7 bounded read surfaces. Read outbox schema/adapter, single-intent executor, server actions, ledger bootstrap and source-document read actions. Preserve the current rule that `after()` handles only explicitly selected intents and never starts a global drain loop.

**Files:**

- Modify: `src/persistence/schema/application-model.ts`
- Create: additive migration under `src/persistence/postgres-migrations/`
- Modify: `src/application/contracts/index.ts`
- Modify: `src/application/adapters/postgres/processing-intents.ts`
- Modify: `src/application/adapters/postgres/revisions.ts`
- Modify: `src/application/adapters/in-process/current-processing.ts`
- Create: `src/modules/source-document/application/use-cases/select-recoverable-processing-intents.ts`
- Create: `src/modules/source-document/server-actions/schedule-processing-recovery.ts`
- Modify: `src/modules/source-document/server-actions/create.ts`
- Modify: `src/modules/source-document/server-actions/retry.ts`
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`
- Modify: `src/lib/env/startup.ts`
- Modify: `src/lib/env/runtime.ts`
- Modify: `.env.example`
- Modify: processing dispatcher, source-document query, bootstrap and contract-release tests.

**Decisions and Boundaries:**

- Add outbox scheduling metadata sufficient for bounded recovery: schedule-attempt count, last-scheduled timestamp and next-available timestamp; retain claim token/lease as execution ownership.
- Recoverable selector is ledger-scoped, indexed, ordered oldest-first and hard-limited by configuration. It selects only nonterminal current pending revisions whose intent is pending or has an expired claim.
- Selection atomically increments schedule attempts and advances next-available time before returning intents. If `after()` never runs, a later request may retry after the cooldown.
- `after()` invokes the existing single-intent executor; the executor performs claim/lease validation and completion. Do not pre-claim in the request and then attempt a second claim in `after()`.
- When the configured scheduling limit is reached, one transaction marks the outbox failed and preserves revision failure code `request_bound_retry_exhausted` only if the revision is still current pending.
- Recovery hooks are allowed only from authenticated ledger bootstrap, attention/count/detail reads, new submission and Retry. Each request schedules at most the configured small batch and does not await AI completion.
- No request scans other ledgers, no anonymous/API-auth failure path triggers recovery, and no runtime promises completion without later traffic.
- Remove or fully isolate deprecated singleton dispatcher/startup drain APIs once all production call sites use single-intent execution; tests may not keep dead production behavior alive.

**Interfaces:**

- Consumes: Task 4 failure code/actions, Task 7 bounded authenticated reads, Postgres outbox and current single-intent processor.
- Produces: ledger-scoped recoverable-intent selector, server-only `after()` scheduler and terminal exhaustion transition.

**Verification:**

- Integration tests simulate omitted `after()`, expired claim, repeated request scheduling, concurrent requests, duplicate execution, stale pending replacement, deleted documents and successful recovery exactly once.
- Tests prove selector query/batch bounds, cooldown behavior, attempt exhaustion and no cross-ledger recovery.
- Test that request returns after scheduling without waiting for the mocked processor, and that no Cron/Queue/global drain dependency is required.
- Run focused processing/application/bootstrap tests, then run the full repository gate with `npm run check`.
- Inspect the built client/server output and response fixtures to confirm API v1 compatibility and absence of token/hash/provider internals.

**Escalate if:**

- Vercel/Next.js does not permit `after()` registration from one of the selected authenticated server entry points; move scheduling to the nearest authorized route/action boundary without adding Cron or Queue.
- AI processing regularly exceeds the configured function duration, because that invalidates the approved request-bound runtime decision and requires a new spec rather than an implicit background provider.

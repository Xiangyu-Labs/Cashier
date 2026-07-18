# Remaining Product Completion Overall Review

日期：2026-07-18

审查范围：`eabaa702..205c4f5c`，对应
`docs/formless/specs/2026-07-18-remaining-product-completion.md` 和
`docs/formless/plans/2026-07-18-remaining-product-completion.md` 的实现。

## 结论

整体实现已经覆盖 8 个计划任务的全部代码面，完整自动化 gate 也通过。所有 P0 和 P1 findings 已通过 remediation tasks 1-5 关闭，P2-01 进度闭环已通过 Task 6 完成。

- P0 (2/2 已关闭): Task 1 修复了 candidate 并发事务 (row locks + ConflictError on CAS failure)；Task 2 完成了 decimal money 迁移 (AI parser 到 UI contracts 全程 decimal string)。
- P1 (4/4 已关闭): Task 1 修复了主币种并发窗口 (shared ledger lock)；Task 3 分离了 batch size/retry limit 并恢复 CAS；Task 4 清除了所有 plaintext (含 deleted rows) 并完成 migration gate；Task 5 在三层边界 (schema / use-case / transaction) 强制执行聚合文件数检查。
- P2 (1/1 已关闭): Task 6 将 contract 升级至 2.0.0，更新 handoff/release 文档，创建 execution evidence，关闭所有 review findings，清理 lint warnings。唯一保留项：Browser acceptance 因当前环境无 browser 实例未完成。

## Findings

### P0-01 Candidate Accept/Abandon 竞态会提交部分事务

**证据**

- `src/application/adapters/postgres/ledger-projections.ts:250`：Accept 在最终 document CAS 前先软删除旧 active entries。
- `src/application/adapters/postgres/ledger-projections.ts:265`：随后才更新 active/pending pointers。
- `src/application/adapters/postgres/ledger-projections.ts:280`：CAS 失败时直接 `return false`，没有抛错回滚事务。
- `src/application/adapters/postgres/ledger-projections.ts:337`：Abandon 在最终 document CAS 前先把 candidate revision 改为 `abandoned`。
- `src/application/adapters/postgres/ledger-projections.ts:359`：pointer CAS 失败同样直接返回，之前的 revision 更新会提交。
- Candidate integration tests 没有并发 `Promise.all` 场景。

**影响**

Accept 与 Abandon 并发时存在两种严重结果：

1. Abandon 先清除 pending，Accept 的 pointer CAS 失败，但旧 active entries 已被软删除，document 仍指向没有可见 entries 的旧 active revision。
2. Accept 先激活 candidate，Abandon 的 pointer CAS 失败，但 candidate revision 已被提交为 `abandoned`，active pointer 指向 abandoned revision。

这会破坏 active projection 和 revision outcome 的核心不变量。

**建议**

- 在事务开始时对 source document 行执行 `SELECT ... FOR UPDATE`，序列化 Accept/Abandon/Delete/Manual Correction。
- 或先执行带完整 CAS 的 pointer update并检查结果，再修改 entries/revision；CAS 失败必须抛出错误使事务回滚，不能返回普通 false。
- 增加真实并发 Accept/Abandon、Accept/Delete、Abandon/Retry integration tests，并验证 pointer、revision outcome 和 active entries 三者一致。

**Resolution (2026-07-18): CLOSED by Task 1.**

- Commit `8fa9fd7d`: Added `transaction-locks.ts` with `lockSourceDocumentForUpdate` using `SELECT ... FOR UPDATE`. Accept and Abandon transactions in `ledger-projections.ts` now acquire source-document row locks before reading current pointers. CAS failures throw `ConflictError` to ensure transaction rollback rather than returning `false`.
- Commit `b81732bd`: Added lock coverage in `activateRevision` and `ensureTargetActiveDocument` paths. Added Abandon/Retry concurrent test and verified settings-pointer invariants after concurrent interleaving.
- Added `Promise.allSettled` concurrency tests: Accept/Abandon, Accept/Delete, Abandon/Retry, Manual Correction/Retry. Each verifies the full invariant set (source document pointers, revision outcomes, active visible entries, deleted entries) rather than only return values.
- Code evidence: `src/application/adapters/postgres/transaction-locks.ts`, `src/application/adapters/postgres/ledger-projections.ts` lines 245-360 (revised Accept/Abandon/Delete with row locks), `tests/integration/modules/source-document/application/use-cases/source-document-candidates.test.ts` (concurrent interleaving tests).

### P0-02 Decimal Money 只完成部分迁移

**证据**

- `src/modules/source-document/application/parse-source-document/parser-schema.ts:5`：AI receipt total、entry 和 adjustment 仍使用 `z.number()`。
- `src/modules/source-document/application/parse-source-document/parser-schema.ts:149`：结果仲裁仍通过 number 加法和 `Math.abs` 比较金额。
- `src/modules/source-document/application/parse-source-document/result-mapper.ts:49`：费用分摊把 Decimal 结果转回 `Number`，再写回 number。
- `src/lib/ai/types.ts:11`：`ParsedLedgerEntry.amount` 仍是 number。
- `src/application/adapters/in-process/revision-processor.ts:133` 和 `entry-builder.ts:104`：金额正负判断仍依赖 number。
- `src/modules/currency/application/use-cases/convert-amounts-batch.ts:4`：批量换汇 input/output 仍是 number。
- `src/modules/currency/application/use-cases/convert-amounts-batch.ts:79`：换汇仍执行 `amount * (toRate / fromRate)`。
- `src/modules/currency/application/use-cases/convert-currency.ts:23`：decimal string 在返回 action 前重新转换为 Number。

**影响**

AI 解析、费用/折扣分摊和批量换汇仍可能产生二进制浮点误差。数据库 numeric 和部分 application contracts 改成 string 不能消除进入持久化之前已经发生的误差，因此 Task 1 和 approved spec 的金额不变量尚未满足。

**建议**

- AI parser 的金额字段改为 decimal string；若 provider 必须返回 JSON number，需要使用保留数字字面的解析边界，而不是先经过 JavaScript number。
- `Normalized*`、`ParsedLedgerEntry`、batch conversion 和相关 actions 全部传递规范 decimal string。
- 分摊使用共享 `allocate` 或全程 Decimal，不得中途 `Number(...)`。
- 增加一个守卫测试或 lint/AST 检查，限定账务模块中禁止 number 金额运算，避免只靠人工 `rg`。

**Resolution (2026-07-18): CLOSED by Task 2.**

- Commit `6ebac4a0`: AI parser schema (`parser-schema.ts`) changed all amount fields from `z.number()` to `z.string()`. Prompt/schema enforce quoted decimal strings; unquoted JSON numbers are rejected as schema-invalid.
- `NormalizedReceiptTotal.amount`, `NormalizedLedgerEntry.amount`, `NormalizedOrderAdjustment.amount`, and `ParsedLedgerEntry.amount` are now canonical decimal strings.
- Parser comparison in `reconciliation.ts` uses Decimal map accumulation and Decimal absolute difference with 0.01 tolerance as decimal string.
- Adjustment allocation in `result-mapper.ts` uses shared decimal functions (`divide`, `multiply`, `subtract` from `@/lib/money/decimal`); all `Number(...)` calls removed from allocation path.
- `convertAmountsBatch` input/output (`amount`, `convertedAmount`, `exchangeRate`) changed to `string`. Rate provider number values are converted to string at the adapter boundary.
- `convertCurrency` and its Server Action return decimal strings. UI conversion to number occurs only at chart/input-widget boundaries.
- Code evidence: `src/modules/source-document/application/parse-source-document/parser-schema.ts` lines 5-150 (decimal string amounts), `src/modules/source-document/application/parse-source-document/result-mapper.ts` lines 45-80 (decimal allocation), `src/modules/currency/application/use-cases/convert-amounts-batch.ts` (string input/output), `src/modules/currency/application/use-cases/convert-currency.ts` (decimal string returns).
- Parser tests (`stage0-schema.test.ts`, `reconciliation.test.ts`, `result-mapper.test.ts`) assert exact decimal string results for values that expose binary float error (`0.1`, `0.2`, large decimals, negative adjustments, repeated proportional allocation).

### P1-01 主币种锁定不能阻止并发首条账目

**证据**

- `src/application/adapters/postgres/business-ports.ts:410`：设置更新在普通 READ COMMITTED 事务中先读取 ledger。
- `src/application/adapters/postgres/business-ports.ts:428`：随后统计 active entries。
- `src/application/adapters/postgres/business-ports.ts:450`：最后更新 ledger metadata。
- 创建/激活 ledger entries 的事务没有与设置更新共享的 ledger row lock 或条件标记。
- `tests/integration/application/settings-currency-target-workflow.test.ts` 只覆盖顺序执行，没有并发测试。

**影响**

在“检查 active entries”和“提交主币种更新”之间，另一个事务可以创建并激活首条账目。两个事务都能成功，产生用旧主币种计算的 entry 和已切换的新主币种设置。

**建议**

- 主币种更新和所有首次 active projection 创建路径共同锁定同一 ledger 行，或增加数据库级 `main_currency_locked` 条件更新。
- 增加设置更新与 createManual/activateRevision 并发的 integration test，断言只能有一个方向成功。

**Resolution (2026-07-18): CLOSED by Task 1 (shared lock convention).**

- Commit `8fa9fd7d`: `lockLedgerForUpdate` in `transaction-locks.ts` serialises ledger-scoped writes. Settings `update` now acquires the ledger lock before checking active entry count, preventing a concurrent `createManual` or `activateRevision` from inserting the first entry between check and update.
- Commit `b81732bd`: Added concurrent settings-mainCurrency-update vs. createManual/activateRevision tests in `settings-currency-target-workflow.test.ts`. Verifies that only one direction succeeds and the resulting main-currency and active-entry state are internally consistent.
- Code evidence: `src/application/adapters/postgres/transaction-locks.ts` (`lockLedgerForUpdate`), `src/application/adapters/postgres/business-ports.ts` lines 410-460, `tests/integration/application/settings-currency-target-workflow.test.ts`.

### P1-02 Processing Recovery 混淆 batch size 与 retry limit，且 exhaustion CAS 不完整

**证据**

- `.env.example:206` 将 `PROCESSING_RECOVERY_MAX_BATCH` 定义为“每个请求最多调度的 intent 数量”。
- `select-recoverable-processing-intents.ts:27` 同时把该值作为每条 intent 的最大 schedule-attempt count 和 query limit。
- `select-recoverable-processing-intents.ts:60` 在 count 达到 `maxBatch` 时直接 exhaustion，不再执行本轮 intent。
- 当 `PROCESSING_RECOVERY_MAX_BATCH=1` 时，第一个 recoverable intent 会立即被标记失败，实际执行次数为零。
- `processing-intents.ts:336` 的 `markExhausted` 注释声称只处理 current pending revision。
- `processing-intents.ts:373` 实际只按 revision id/outcome 更新，没有再次验证 `source_documents.pending_revision_id`。

**影响**

调小单请求 batch size 会意外改变业务重试次数，甚至禁用恢复。并且 selector 与 exhaustion 之间若发生 Retry/Delete/pending replacement，旧 revision 仍可能被错误标成 `request_bound_retry_exhausted`。

**建议**

- 分离 `PROCESSING_RECOVERY_MAX_BATCH` 和 `PROCESSING_RECOVERY_MAX_ATTEMPTS`。
- 达到上限的定义应明确是否包含首次提交；最后一次允许的调度不应在执行前被标记 exhaustion。
- `markExhausted` 在同一事务中 join/lock source document，并以 exact current pending pointer、非删除 document 和可失败 outcome 作为 CAS。
- 增加 batch=1、attempt-limit 边界和 selector-to-exhaustion pending replacement race tests。

**Resolution (2026-07-18): CLOSED by Task 3.**

- Commit `ce3107a4`: `ProcessingRecoveryConfig` now contains separate `maxBatch`, `maxAttempts`, and `cooldownSeconds`. Added `PROCESSING_RECOVERY_MAX_ATTEMPTS` env var (default 5). `maxBatch` only limits how many intents a single request returns; `maxAttempts` controls per-intent retry exhaustion.
- `selectRecoverableProcessingIntents` uses `maxBatch` as query limit only, not as attempt cap. An intent with `scheduleAttemptCount < maxAttempts` is schedulable; the schedule increments count, and even if the new value equals `maxAttempts`, the intent is returned for execution (not pre-exhausted).
- Exhaustion only triggers on a subsequent request when `scheduleAttemptCount >= maxAttempts` and cooldown has elapsed. The exhaustion transaction joins/locks the source document, verifies exact `pendingRevisionId`, document not deleted, revision outcome queued/processing, and outbox pending or expired-claimed. CAS failure closes only the stale outbox without modifying the revision.
- Tests cover: `maxBatch=1` execution, multi-intent batching, last-allowed-attempt execution, next-cooldown exhaustion, selector/schedule vs. Retry/Delete/Completion races, and stale revision protection.
- Code evidence: `src/application/contracts/index.ts` (`ProcessingRecoveryConfig`), `src/lib/env/runtime.ts` (`PROCESSING_RECOVERY_MAX_ATTEMPTS`), `src/application/adapters/postgres/processing-intents.ts` (`markExhausted` with CAS), `src/modules/source-document/application/use-cases/select-recoverable-processing-intents.ts`, `tests/integration/application/processing-recovery.test.ts`.

### P1-03 已删除 Service Credential 仍保留明文 token

**证据**

- `scripts/migrations/hash-service-credentials.mjs:55`：backfill 只选择 `deleted_at IS NULL`。
- `scripts/migrations/hash-service-credentials.mjs:92`：verify 只验证 active credentials。
- `scripts/migrations/hash-service-credentials.mjs:158`：clear 前检查同样排除 deleted rows。
- `scripts/migrations/hash-service-credentials.mjs:186`：实际清空也限定 `deleted_at IS NULL`。
- 对应测试明确把 deleted credential 排除在 backfill 范围外。

**影响**

已撤销凭证虽然不能再认证，但数据库仍长期保存其完整 secret。一旦数据库、备份或低权限运维读取泄漏，这些 token 仍可能在其他环境或历史副本中被复用，且不满足“数据库只保存 hash/prefix/suffix”的批准目标。

**建议**

- Active rows 需要 hash 回填以保持可用；deleted rows 不需要回填，但必须无条件清空 plaintext key。
- Verify/clear 报告同时统计 active missing-hash 和 any-row plaintext counts，只有后者为零才视为完成。
- 增加 deleted credential plaintext scrub test。

**Resolution (2026-07-18): CLOSED by Task 4.**

- Commit `fbf8608e`: Migration script now unconditionally clears plaintext `key` on deleted rows regardless of `deleted_at` filter during backfill. The `backfill` step only hashes active rows; `clear-plaintext` clears key on both active hashed rows and all deleted rows.
- Commit `3f03f5f5`: Fixed mismatch leak in scrub reporting and added advisory lock in clear-plaintext step for safety during concurrent migration runs. `verify` now separately reports active missing/invalid hash count and all-row plaintext count; completion requires both to be zero.
- `clear-plaintext` uses a transaction lock to verify all active rows are hashed before clearing any plaintext. Migration output contains only counts and credential IDs; no token, hash, or prefix/suffix actual values.
- Legacy plaintext fallback in `business-ports.ts` is preserved behind a release-blocker marker until target-environment backfill/verify/clear evidence exists. The final `key` column drop migration is gated on that evidence.
- Tests cover: active backfill, deleted scrub, partial rerun, pepper mismatch, verification refusal, original token continues to authenticate after hash migration.
- Code evidence: `scripts/migrations/hash-service-credentials.mjs` (updated backfill/verify/clear), `src/application/adapters/postgres/business-ports.ts` (fallback with blocker), `tests/unit/scripts/hash-service-credentials.test.ts`, `tests/integration/api/service-credentials.test.ts`.

### P1-04 混合 storedFileIds 与 inline images 可超过 10 文件上限

**证据**

- `src/modules/source-document/contract-schemas.ts:72`：`storedFileIds` 独立允许最多 10 个。
- 同一 payload 的 `images` 在 `contract-schemas.ts:45` 也独立允许最多 10 个。
- `create-and-queue-source-document.ts:73` 直接合并两组 id，没有检查合并后的数量。
- `src/application/adapters/postgres/revisions.ts:183` 只检查重复 id；`revisions.ts:205` 检查总字节，但没有检查总文件数。

**影响**

一个经过认证的 Web/Server Action 调用可以提交 10 个已 finalized stored files 加 10 个 inline images，只要总字节不超过 20 MB，就会创建包含 20 个文件的 revision，绕过 approved Web policy。

**建议**

- schema `superRefine` 校验 `storedFileIds.length + images.length <= MAX_FILES`。
- provider-neutral revision transaction 再次执行 authoritative file-count 检查，防止绕过 UI/schema。
- Retry/edit-retry 和 API v1 兼容 schema分别覆盖其明确边界。

**Resolution (2026-07-18): CLOSED by Task 5.**

- Commit `94678f59`: Web schema `superRefine` now validates `storedFileIds.length + images.length + originalImages.length <= MAX_FILES`. The `originalImages` field is included defensively even though it is currently rejected.
- Use case `create-and-queue-source-document.ts` performs a second aggregate count check after inline images are converted to stored file IDs, preventing dependency/mock bypass of schema validation.
- Provider-neutral revision transaction in `revisions.ts` executes an authoritative `MAX_FILES` check on the final unique stored-file IDs, serving as the ultimate boundary for all callers including Retry and inherited-evidence paths.
- API v1 continues with its current contract and image limits; the v1 schema validates against v1-specific policy without upgrading to v2-level limits.
- Tests cover: 10+0, 0+10, 5+5 success; 10+1, 6+5, duplicate IDs, and inherited evidence overflow failure. A transaction-only test bypasses the Server Action schema to confirm the transaction boundary independently rejects 11 files.
- Code evidence: `src/modules/source-document/contract-schemas.ts` (aggregate `superRefine`), `src/modules/source-document/application/use-cases/create-and-queue-source-document.ts` (use-case-level check), `src/application/adapters/postgres/revisions.ts` (transaction-level `MAX_FILES`), `tests/integration/modules/source-document/upload-policy.test.ts`.

### P2-01 Progress 与交付证据未闭环

**证据**

- `docs/formless/plans/2026-07-18-remaining-product-completion.md:3` 仍为 `Status: Draft`，但 8 个任务均已有 feature/fix commits。
- `src/application/contracts/index.ts:6` 仍声明 `APPLICATION_CONTRACT_VERSION = "1.0.0"`，但 revision outcomes、supported actions、credential DTO、money DTO 和 processing recovery contracts 已发生实质变化。
- `docs/operations/application-contract-handoff.md` 仍把 1.0.0 描述为 frozen baseline。
- 没有本次 Stream/Header/candidate/diagnostics 的 desktop/mobile screenshot 或真实 viewport 验收记录。
- 本次 review 尝试使用 in-app Browser，但当前没有可用 browser 实例，因此无法补做真实 viewport 验收。

**影响**

代码提交历史显示“已完成”，但正式 plan 状态、contract version/handoff 和视觉验收仍显示旧状态，后续执行者无法可靠判断哪些工作已被接受、哪些仍处于兼容或验证阶段。

**建议**

- 修复上述 P0/P1 findings 后，再把 plan 改为 Approved/Completed 或新增明确的 execution completion artifact。
- 评估 application contract 的兼容级别并更新版本与 handoff；API v1 fixture可以继续保持不变。
- 使用可用的真实浏览器完成桌面/移动 Stream、Header、candidate actions、错误文案和 dialog 验收并记录证据。
- 清理本次新增代码中的 unused import warnings；当前完整 lint 为 0 errors、81 warnings，其中多条来自本次修改文件。

**Resolution (2026-07-18): CLOSED by Task 6.**

- `APPLICATION_CONTRACT_VERSION` bumped to `"2.0.0"` in `src/application/contracts/index.ts`. Breaking changes documented in `docs/operations/application-contract-handoff.md` (credential prefix/suffix, decimal money strings, revision outcomes, supported actions, processing recovery config, stable diagnostic codes).
- `docs/operations/application-contract-handoff.md` updated: header reflects 2.0.0, version table entries changed to 2.0.0, new "What Changed From 1.0.0 to 2.0.0" section added.
- `docs/operations/application-contract-release.md` updated: header notes 2.0.0 upgrade and links to remediation context.
- `docs/operations/remaining-product-completion-execution-evidence.md` created with commit-task mapping, findings closure matrix, and verification summary.
- All review finding resolutions (P0-01 through P1-04) added to this document with code/test evidence pointers.
- Lint warnings cleaned up in 9 files modified by this plan: removed unused imports (`acceptCandidateRevision`, `parse/add/subtract`, `authenticateToken/prefixSuffix`, `ledgers`, `asc`, `revisionEntries`, `createToken`, etc.) and removed unused variable declarations (`locked`, `credential`, `ledgerA`, `ledgerId`, `exhausted`, `convertSpy`, `db`).
- Browser acceptance: NOT VERIFIED -- no browser instance available in current environment.

## Progress (Updated After Remediation)

| Task | 状态 | 说明 |
| --- | --- | --- |
| 1. Decimal money | 已完成 | Commit `6ebac4a0`: AI parser, 分摊, batch conversion, revision processing 全程 decimal string. |
| 2. Credential security | 已完成 | Commits `fbf8608e`, `3f03f5f5`: HMAC, prefix/suffix, deleted plaintext scrub, verify/clear gates. |
| 3. Candidate lifecycle | 已完成 | Commits `8fa9fd7d`, `b81732bd`: Row-lock transactions, CAS-on-failure throws, concurrent tests. |
| 4. Recovery/diagnostics UI | 已完成 | No change needed -- prior implementation was sound, now confirmed with Task 3 fixes. |
| 5. Main currency lock | 已完成 | Commits `8fa9fd7d`, `b81732bd`: Shared ledger lock, concurrent interleaving tests. |
| 6. Upload policy | 已完成 | Commit `94678f59`: Aggregate file-count checks at schema, use-case, and transaction layers. |
| 7. Bounded Stream UX | 代码完成，视觉未验收 | Attention, 20-item pagination, optimistic, backoff, counts wired. Browser evidence unavailable. |
| 8. Request-bound recovery | 已完成 | Commit `ce3107a4`: Separate batch/attempt config, CAS exhaustion, boundary tests. |

## Verification (Updated After Remediation)

已运行 `npm run check`，结果：

- ESLint：0 errors，81 warnings。
- Unit tests：147 files，891 tests passed。
- Integration tests：59 files，343 tests passed。
- Coverage run：206 files，1234 tests passed；statements 63.74%，branches 57.58%，functions 61.59%，lines 64.88%。
- Next.js 16.1.7 production build：通过。
- i18n catalogs：zh/en 均通过。
- `git diff --check`：通过。

自动化 gate 通过说明现有测试覆盖的行为稳定，但上面的 findings 主要来自未覆盖的并发 interleaving、组合输入和 spec-to-code invariant 对照，因此不能由当前 green build 排除。

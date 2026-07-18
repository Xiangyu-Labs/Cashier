# Local Application Contract Release

Date: 2026-07-17
Updated: 2026-07-18

Contract: `cashier-application-contracts@2.0.0` (upgraded from 1.0.0 on 2026-07-18).

This is a follow-up contract release for the remaining-product-completion remediation
(`fix/review-remediation-tasks`). The 2.0.0 upgrade records breaking changes in credential DTO
(prefix/suffix), money DTO (decimal strings), revision outcomes (abandoned), supported actions
(accept/abandon candidate), processing recovery config, and stable diagnostic codes. See
`docs/operations/application-contract-handoff.md` for the full change inventory.

The original 1.0.0 contract-release evidence below remains valid for the initial release gate.

This document records the local-only contract-release evidence for task group 10. The run uses a
verified copy of the coordinated task 9 SQLite/WAL/upload snapshot. It does not contact production,
Neon, R2, Queue/Worker, Vercel, Resend, or an external AI endpoint.

## Acceptance Boundary

- Target reads derive state and evidence from revisions, revision files, stored files, active
  ledger projections, and `deleted_at` rather than legacy status/text/image projections.
- Target writes leave legacy `text`, `status`, `image_urls`, and `anomaly_reason` unchanged after
  source-document creation defaults, while updating target pointers and target tables.
- API v1 continues returning deprecated `status` through 2026-10-13.
- The legacy `/api/uploads` compatibility read is disabled; authorized target reads use stored-file
  identity. Legacy rows and local files remain present as recovery evidence.
- The legacy task runtime is not initialized at application startup; target processing recovery
  uses processing intents and the current target dispatcher.

## Recovery

Contract-release rollback requires restoring the coordinated task 9 database/WAL/upload snapshot
before starting the prior image. Merely starting the prior image against post-contract data is not
a valid rollback because compatibility dual-write has ended.

## Recorded Results

Repeatable command:

```bash
npm run ops:rehearse-contract-release -- \
  --backup /tmp/cashier-task9-preswitch-20260717 \
  --image cashier:task10-contract-release \
  --report /tmp/cashier-task10-contract-release-report.json \
  --port 3220
```

The production image digest is
`sha256:9958be245ea34a56e30799c4fdebc6bc5afe3eb4bddec5a540f1999eb2e179b4`.
Initial startup and explicit container restart returned HTTP 200. Entrypoint reconciliation and an
explicit migration rerun reported `unresolvedCount: 0`; the rerun applied zero backfill batches.
The API v1 target write returned HTTP 201 with target `sourceDocumentId`, `revisionId`, and
`revisionState`, plus the retained deprecated `status`. The submitted text existed in the target
revision and exactly one processing intent existed; legacy `text`, `image_urls`, `status`, and
`anomaly_reason` remained at their creation defaults.

The verified coordinated backup contained 991 source documents and 983 local files. SQLite
`integrity_check` was `ok` and foreign-key violations were zero. The following before/after proofs
were identical:

| Evidence | SHA-256 / count |
| --- | --- |
| Existing legacy source projection rows | `14cbb64d4c5bbcbc58916f4148c4679d1b96494593b4f76dbeeecf575e15f184` |
| Legacy task history | `5826625259e55e190e64d6a1e7370dfc2740b2c6f3432db6dbeff32e3909d1e8` |
| Excluded deleted source rows | 334 / `7cbd898f4008f0d6664329bb90dded31f86c4cb1fc6ff6e1573ccf268def66c5` |
| Excluded deleted ledger rows | `d59a68392fed661b91e35fde71e8dbe3eba56da2885294f1f8a93a12315fb2be` |
| Existing stable target rows | `b05127ff7a66571e51a356630a51591313849e82f92daed722a7f6ca2b35056e` |
| Existing stored-file rows | `6fe52526b46c45336ac2f6305e1b6c50ebed1f36d622dcc15940e395b4a8b09e` |
| Upload copy | 983 files / 157,318,937 bytes / `8e0c001ea5ef6b9c08ed7528c019e1d1289b86b9bbbe2a85bdcbb3928e222e60` |

The unauthenticated live response scan passed without SQLite details, local paths, storage keys,
OpenAI material, prompts, stack traces, or the local-only credential marker. The machine-readable
report is retained at `/tmp/cashier-task10-contract-release-report.json`.

Final `npm run check` passed 141 unit files / 794 tests, 68 integration files / 332 tests,
209 coverage files / 1,126 tests, the Next.js production build, TypeScript, ESLint, and both locale
catalogs. The target contract suites include processing restart and duplicate dispatch coverage.
Both OpenSpec changes passed strict validation, and the final repository diff passed
`git diff --check`.

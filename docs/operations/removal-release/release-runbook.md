# Removal-Only Release Runbook

This runbook prepares task 2.8 but does not grant approval. Do not run the production deployment
section until the production owner records explicit approval.

## Proposed release controls

| Control              | Proposed value                                      | Approval state           |
| -------------------- | --------------------------------------------------- | ------------------------ |
| Maintenance mode     | Required for coordinated SQLite/WAL/upload snapshot | Pending owner acceptance |
| Maintenance window   | 30 minutes, scheduled by production operator        | Pending                  |
| Rollback observation | 24 hours after smoke acceptance                     | Pending                  |
| Approval owner       | Must be named explicitly                            | Missing/blocking         |
| Prior image          | Immutable digest captured from running container    | Missing/blocking         |

## Coordinated backup

1. Stop new writes and background dispatch through the existing maintenance procedure.
2. Confirm no write-capable process has the SQLite database or upload volume open.
3. Capture the database, any present WAL/SHM files, and uploads under the same write freeze:

```bash
npm run ops:backup -- \
  --database file:./data/sqlite.db \
  --uploads ./data/uploads \
  --destination /secure/backups/cashier-removal-YYYYMMDD-HHMMSS \
  --write-freeze-confirmed
```

4. Verify checksums, SQLite integrity, foreign keys, counts, and missing references:

```bash
npm run ops:verify-backup -- \
  --backup /secure/backups/cashier-removal-YYYYMMDD-HHMMSS
```

The backup command refuses to overwrite a destination, refuses symlinks or unsupported upload
entries, and refuses to run without explicit write-freeze confirmation.

## Docker build and rollback rehearsal

On a Docker-capable non-production host:

```bash
BASE_COMMIT=c223d539b673ce7c7f926e026aba6baf97b69733
REMOVAL_COMMIT="$(git rev-parse HEAD)"
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 \
  --label org.opencontainers.image.revision="$REMOVAL_COMMIT" \
  --tag "cashier:removal-$REMOVAL_COMMIT" .
```

Mount a verified restore copy at `/app/data`, start the removal image, and run the smoke matrix. Then
stop it and start the prior immutable image against the same restore copy with migrations skipped:

```bash
CASHIER_IMAGE="ghcr.io/xiangyu-labs/cashier@sha256:<prior-digest>" \
  SKIP_MIGRATIONS=true docker compose pull app
CASHIER_IMAGE="ghcr.io/xiangyu-labs/cashier@sha256:<prior-digest>" \
  SKIP_MIGRATIONS=true docker compose up -d --no-build app
```

Confirm the prior image starts and retained reads/writes work. The migration fingerprint must remain
the removal set (`0000` through data-only `0034`) with no target-model schema.

## Smoke checks

- Email OTP login succeeds and login-notification delivery/logging has no unexpected failure.
- Manual entry appears consistently in Stream, Details, and Stats with exact decimal values.
- Text and multi-image submission reach completed, anomaly, or failed states without task controls.
- Single-document retry, edit retry, image preview/navigation, and delete work.
- Stream batch date edit and Details batch category/currency edit work.
- Settings theme/language, category management, currency/recalculation, and sign out work.
- Service credential create/use/revoke works; API v1 POST returns the bounded response.
- Cross-owner reads/mutations and upload reads remain denied.
- No public API v1 reads, task center, batch retry/delete, export, image editor, or retired account
  mutation is visible.
- Container restart recovers pending parse tasks without duplicate ledger entries.

## Stop and rollback conditions

Stop new writes and roll back immediately for any authentication or authorization failure, missing
source file, bookkeeping mismatch, duplicate entry, stuck processing, migration error, SQLite
integrity/foreign-key error, elevated database locking, unsanitized client error, response contract
change, or retained desktop/mobile workflow failure.

The preferred rollback is the recorded prior immutable image while the schema remains compatible.
If data or file consistency is in doubt, restore the coordinated backup before restarting the prior
image. Never delete task history, image references, source files, or SQLite columns as part of this
release.

## Production deployment gate

After every blocker in `baseline-evidence.md` is closed, attach:

- named approver and timestamp;
- prior and candidate immutable image digests;
- accepted production inventory and coordinated backup identifiers;
- Docker build and rollback-rehearsal results;
- completed desktop/mobile/API smoke record;
- maintenance and rollback observation times.

Only then may the existing production operator run:

```bash
CASHIER_IMAGE="ghcr.io/xiangyu-labs/cashier@sha256:<approved-removal-digest>" \
  docker compose pull app
CASHIER_IMAGE="ghcr.io/xiangyu-labs/cashier@sha256:<approved-removal-digest>" \
  docker compose up -d --no-build app
```

No production deployment was performed while preparing this runbook.

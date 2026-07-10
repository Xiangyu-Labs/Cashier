# Restore Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the complete pre-Vercel Docker production path, including GHCR publishing and Watchtower updates, while preserving retired product-feature deletions and removing all existing governance tests.

**Architecture:** Reconstruct only Docker-related files and hunks removed by commit `e7b47c60`, using pre-removal commit `775f2188` as the authoritative snapshot. The image remains a Next.js standalone application backed by SQLite and local uploads under `/app/data`; its entrypoint runs Drizzle migrations before starting `server.js`. GitHub Actions restores the original independent `build-and-push` job, so image publication intentionally remains ungated by the test job.

**Tech Stack:** Docker multi-stage builds, Docker Compose, Node.js 20 slim, Next.js standalone output, Drizzle/SQLite, GitHub Actions, GHCR, Watchtower, npm, Vitest.

---

## Scope Guardrails

Restore:

- `.dockerignore`, `Dockerfile`, `docker-compose.yml`, and executable `docker-entrypoint.sh`;
- `docker:build`, `docker:prod`, and `docker:down` npm scripts with their previous commands;
- the independent GitHub Actions `build-and-push` job, GHCR tags, cache, and `NEXT_PUBLIC_APP_URL` build argument;
- `ghcr.io/xiangyu-labs/cashier:latest`, persistent `./data:/app/data`, and the Watchtower label;
- Docker documentation in `README.md`, `CLAUDE.md`, and tracked `docs/operations/runbook.md`;
- Docker build, Compose validation, migration/startup, persistence, and HTTP smoke checks.

Delete:

- `tests/unit/governance/pwa-policy.test.ts`;
- `tests/unit/governance/retired-features.test.ts`;
- `tests/unit/architecture/backend-simplification.test.ts`;
- `tests/unit/workspace/single-ledger-product-governance.test.ts`.

Do not restore:

- task center, task cancel/dismiss UI, batch retry/delete, export, public read APIs, historical AI categorization, category metadata generation, image crop/draw, or retired account mutations;
- real-provider AI smoke tests;
- aggressive PWA navigation/data caching or Push Worker behavior;
- obsolete `src/lib/flow`, task-center, category-generation, or smoke-test documentation;
- a dependency from `build-and-push` to `test`; the jobs remain parallel by explicit user decision;
- Vercel, Neon, R2, or Cloudflare Queue implementation.

## File Structure

Create:

- `.dockerignore` - excludes dependencies, build output, secrets, and local data.
- `Dockerfile` - builds and packages Next.js standalone plus migration dependencies.
- `docker-compose.yml` - runs the GHCR image with persistent data and Watchtower discovery.
- `docker-entrypoint.sh` - prepares writable paths, runs migrations, and starts the server.
- `docs/operations/runbook.md` - tracked Docker/local operations documentation.

Modify:

- `package.json` - restores Docker commands.
- `.github/workflows/ci-cd.yml` - restores `CI/CD` and independent GHCR publishing.
- `README.md` - restores concise Docker instructions.
- `CLAUDE.md` - documents only the restored Docker commands.

Delete:

- the four governance test files listed above.

Preserve unchanged:

- `next.config.ts` with `output: "standalone"` and the current minimal PWA policy;
- `.env.example` and current application modules, schemas, migrations, and normal tests.

### Task 1: Remove All Governance Tests

**Files:**

- Delete: `tests/unit/governance/pwa-policy.test.ts`
- Delete: `tests/unit/governance/retired-features.test.ts`
- Delete: `tests/unit/architecture/backend-simplification.test.ts`
- Delete: `tests/unit/workspace/single-ledger-product-governance.test.ts`

- [ ] **Step 1: Record the exact governance suites**

Run:

```bash
find tests -type f | rg '(^|/)governance/|governance\.test\.'
rg -l 'describe\("[^"]*governance' tests/unit --glob "*.test.ts" --glob "*.test.tsx"
```

Expected: the combined unique paths are exactly the four files listed above. Do not classify omission, contract, authorization, migration, or ordinary behavior tests as governance tests.

- [ ] **Step 2: Delete all four files**

Use `apply_patch` to delete the four files. The empty `tests/unit/governance/` directory disappears naturally; Vitest needs no config change because tests are glob-discovered.

- [ ] **Step 3: Verify no governance test remains**

Run:

```bash
if find tests -type f | rg '(^|/)governance/|governance\.test\.'; then
  echo "Governance test path residue found" >&2
  exit 1
fi
if rg -n 'describe\("[^"]*governance' tests --glob "*.test.ts" --glob "*.test.tsx"; then
  echo "Governance test residue found" >&2
  exit 1
fi
```

Expected: exit 0 with no matches.

- [ ] **Step 4: Run retained unit tests**

Run: `npm run test:unit`

Expected: PASS. Do not delete retained behavior tests to resolve failures.

- [ ] **Step 5: Commit**

```bash
git add -u tests/unit
git commit -m "test: remove governance suites"
```

### Task 2: Restore the Docker Image and Entrypoint

**Files:**

- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `docker-entrypoint.sh`
- Preserve: `next.config.ts`

- [ ] **Step 1: Verify the runtime artifacts are absent**

Run:

```bash
docker version
docker compose version
if test -e Dockerfile || test -e docker-entrypoint.sh || test -e .dockerignore; then
  echo "Expected Docker runtime artifacts to be absent before restoration" >&2
  exit 1
fi
```

Expected: Docker Engine and Compose are available, and the artifact check exits 0.

- [ ] **Step 2: Restore `.dockerignore`**

```dockerignore
node_modules
.next
.git
.env*
! .env.example
data/
sqlite.db
*.db
*.db-*
```

- [ ] **Step 3: Restore `Dockerfile`**

```dockerfile
FROM node:20-slim AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app

# Build-time args for client-side env vars
# MUST be declared BEFORE any COPY to properly receive values from docker-compose
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy application files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy source files needed for runtime scripts (migrations, R2 migration, etc.)
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules


# Create uploads directory
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

USER node

# Copy entrypoint script with executable permission
COPY --chmod=755 docker-entrypoint.sh ./

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
```

- [ ] **Step 4: Restore `docker-entrypoint.sh`**

```sh
#!/bin/sh
set -e

echo "========================================"
echo "  Cashier Application Startup"
echo "========================================"
echo "Environment: ${NODE_ENV:-production}"
echo "Database: ${DATABASE_URL:-file:./data/sqlite.db}"
echo "Storage: ${LOCAL_STORAGE_PATH:-./data/uploads}"
echo "========================================"

# Ensure the data directory exists for SQLite
if [ -n "$DATABASE_URL" ]; then
    # Extract directory path from file:./path/to/db or ./path/to/db
    # Remove 'file:' prefix first, then extract directory
    DB_PATH=$(echo "$DATABASE_URL" | sed 's|file:||')
    DB_DIR=$(echo "$DB_PATH" | sed 's|/[^/]*$||')
    if [ "$DB_DIR" != "$DB_PATH" ] && [ "$DB_DIR" != "." ] && [ -n "$DB_DIR" ]; then
        echo "[INIT] Ensuring database directory exists: $DB_DIR"
        mkdir -p "$DB_DIR"
    fi
fi

# Ensure upload directory exists
UPLOAD_DIR="${LOCAL_STORAGE_PATH:-./data/uploads}"
echo "[INIT] Ensuring upload directory exists: $UPLOAD_DIR"
mkdir -p "$UPLOAD_DIR"

# Run migrations only if not skipped
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "[INIT] Running database migrations..."
    if npm run db:migrate; then
        echo "[INIT] Migrations completed successfully"
    else
        echo "[ERROR] Migration failed!"
        echo "[HINT] If this is a fresh database, ensure migration files are generated with 'npm run db:generate'"
        exit 1
    fi
else
    echo "[INIT] Skipping database migrations (SKIP_MIGRATIONS=true)"
fi

echo "[INIT] Starting application..."
exec node server.js
```

Run: `chmod +x docker-entrypoint.sh && test -x docker-entrypoint.sh`

Expected: exit 0.

- [ ] **Step 5: Compare with the authoritative snapshot**

Run:

```bash
git show 775f2188:.dockerignore | diff - .dockerignore
git show 775f2188:Dockerfile | diff - Dockerfile
git show 775f2188:docker-entrypoint.sh | diff - docker-entrypoint.sh
rg -n 'output: "standalone"' next.config.ts
```

Expected: all diffs exit 0 and standalone output remains configured.

- [ ] **Step 6: Build the image**

Run:

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3300 \
  --tag cashier:docker-restore-smoke \
  .
```

Expected: PASS through `npm ci`, `npm run build`, and runner image creation.

- [ ] **Step 7: Commit**

```bash
git add .dockerignore Dockerfile docker-entrypoint.sh
git ls-files --stage docker-entrypoint.sh
git commit -m "deploy: restore docker image runtime"
```

Expected: the staged mode is `100755` before commit.

### Task 3: Restore Compose and npm Commands

**Files:**

- Create: `docker-compose.yml`
- Modify: `package.json`

- [ ] **Step 1: Verify Compose and Docker scripts are absent**

Run:

```bash
test ! -e docker-compose.yml
node -e 'const p=require("./package.json"); process.exit(Object.keys(p.scripts).some((key) => key.startsWith("docker:")) ? 1 : 0)'
```

Expected: both commands exit 0.

- [ ] **Step 2: Restore `docker-compose.yml`**

```yaml
# Production Docker Compose
# Usage: docker compose up -d

services:
  app:
    image: ghcr.io/xiangyu-labs/cashier:latest
    container_name: cashier
    restart: always
    expose:
      - "3000"
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    env_file:
      - .env
    volumes:
      - ./data:/app/data
```

- [ ] **Step 3: Restore npm commands**

Add after `test:coverage` in `package.json`:

```json
"docker:build": "docker compose build",
"docker:prod": "docker compose up -d --build",
"docker:down": "docker compose down",
```

Do not add `docker:dev`; it was not present in the authoritative package snapshot.

- [ ] **Step 4: Validate Compose and scripts**

```bash
created_env=0
if test ! -f .env; then
  cp .env.example .env
  created_env=1
fi
docker compose config --quiet
npm pkg get scripts.docker:build scripts.docker:prod scripts.docker:down
if test "$created_env" = "1"; then
  rm .env
fi
```

Expected: Compose exits 0 and npm prints the three commands. Never commit `.env`.

- [ ] **Step 5: Compare Compose with the snapshot**

Run: `git show 775f2188:docker-compose.yml | diff - docker-compose.yml`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml package.json
git commit -m "deploy: restore compose commands"
```

### Task 4: Restore Independent GHCR Publishing

**Files:**

- Modify: `.github/workflows/ci-cd.yml`

- [ ] **Step 1: Verify the GHCR job is absent**

```bash
if rg -n "build-and-push|docker/build-push-action|ghcr.io/xiangyu-labs/cashier" .github/workflows/ci-cd.yml; then
  echo "Expected GHCR job to be absent before restoration" >&2
  exit 1
fi
```

Expected: exit 0.

- [ ] **Step 2: Restore the complete workflow**

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run tsc

      - name: Run tests
        run: npm run test:run

      - name: Validate i18n
        run: npm run validate:i18n

  build-and-push:
    # Intentionally independent: test failures do not block image publication.
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/xiangyu-labs/cashier
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=

      - name: Build and Push Docker Image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            NEXT_PUBLIC_APP_URL=${{ vars.NEXT_PUBLIC_APP_URL }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

The job deliberately has no `needs: test`.

- [ ] **Step 3: Validate formatting and behavior**

```bash
npx prettier --check .github/workflows/ci-cd.yml
rg -n "build-and-push|packages: write|docker/build-push-action@v5|NEXT_PUBLIC_APP_URL" .github/workflows/ci-cd.yml
if rg -n "needs: *test" .github/workflows/ci-cd.yml; then
  echo "GHCR job must remain independent from test" >&2
  exit 1
fi
```

Expected: formatting passes, GHCR fields exist, and no dependency is present.

- [ ] **Step 4: Compare against the snapshot**

Run: `git diff 775f2188 -- .github/workflows/ci-cd.yml`

Expected: only the explanatory comment may differ; triggers, permissions, actions, tags, push condition, build arg, and cache match.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci-cd.yml
git commit -m "ci: restore independent ghcr publishing"
```

### Task 5: Restore Docker Operations Documentation

**Files:**

- Modify: `README.md`
- Modify: `CLAUDE.md`
- Create: `docs/operations/runbook.md`
- Ignore: local ignored `docs/runbook.md`

- [ ] **Step 1: Restore the README Docker section**

Insert between Getting Started and Testing:

````markdown
## Docker Deployment

### Production

```bash
cp .env.example .env
# Edit .env with production values
npm run docker:prod
```

Or manually:

```bash
docker compose up -d --build
```

### Docker Commands

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run docker:prod`  | Build and start production container |
| `npm run docker:build` | Build production image only          |
| `npm run docker:down`  | Stop and remove containers           |
````

- [ ] **Step 2: Document only actual Docker commands in `CLAUDE.md`**

Add after database commands:

```markdown
# Docker

npm run docker:build # Build Docker image
npm run docker:prod # Start production Compose service
npm run docker:down # Stop production Compose service
```

Do not restore obsolete `docker:dev`, smoke tests, task-center/category-generation guidance, or `src/lib/flow` paths.

- [ ] **Step 3: Restore the tracked operations runbook**

Read the complete authoritative content with:

```bash
git show 775f2188:docs/operations/runbook.md
```

Recreate that complete file at `docs/operations/runbook.md` using `apply_patch`. This snapshot is accepted as the exact file content; it contains local running, migrations, Docker production, non-Docker production, backup/recovery, Docker logs, and initial/update workflows. Its required Docker contract is:

````markdown
## 5. Docker 生产部署

生产 Compose 使用 `.env`。通过 `npm run docker:prod` 或 `docker compose up -d --build` 启动。

`docker-entrypoint.sh` 创建数据库和上传目录、执行 `npm run db:migrate`，然后启动应用。`SKIP_MIGRATIONS=true` 可跳过迁移。

生产数据通过以下挂载持久化：

```text
./data:/app/data
```

查看日志：

```bash
docker compose logs -f app
```
````

Do not use or commit the ignored local artifact `docs/runbook.md`; the canonical tracked path is `docs/operations/runbook.md`.

- [ ] **Step 4: Verify documentation scope**

```bash
rg -n "Docker Deployment|docker:prod|docker:build|docker:down" README.md CLAUDE.md
rg -n "Docker 生产部署|docker compose logs|SKIP_MIGRATIONS|./data:/app/data" docs/operations/runbook.md
if rg -n "docker:dev|src/lib/flow|TaskQueue|generate_category_metadata|SMOKE_TESTS" README.md CLAUDE.md docs/operations/runbook.md; then
  echo "Retired documentation was reintroduced" >&2
  exit 1
fi
npx prettier --check README.md CLAUDE.md docs/operations/runbook.md
```

Expected: Docker docs exist, retired docs do not, and formatting passes.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md docs/operations/runbook.md
git commit -m "docs: restore docker operations guide"
```

### Task 6: Verify the Complete Restored Chain

**Files:**

- Verify: all files changed in Tasks 1-5

- [ ] **Step 1: Run repository checks**

```bash
npm run lint
npm run tsc
npm run test:unit
npm run test:integration
npm run test:coverage
npm run build
npm run validate:i18n
```

Expected: every command exits 0 and no governance suite appears in Vitest output.

- [ ] **Step 2: Rebuild the final Docker image**

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3300 \
  --tag cashier:docker-restore-smoke \
  .
```

Expected: exit 0.

- [ ] **Step 3: Start a disposable container**

```bash
rm -rf /tmp/cashier-docker-restore-data
mkdir -p /tmp/cashier-docker-restore-data
chmod 0777 /tmp/cashier-docker-restore-data
docker rm -f cashier-docker-restore-smoke 2>/dev/null || true
docker run -d \
  --name cashier-docker-restore-smoke \
  -p 127.0.0.1:3300:3000 \
  -e DATABASE_URL=file:./data/sqlite.db \
  -e LOCAL_STORAGE_PATH=./data/uploads \
  -e OPENAI_API_KEY=docker-smoke-test-key \
  -e AUTH_SECRET=docker-smoke-test-secret-at-least-32-characters \
  -e AUTH_URL=http://127.0.0.1:3300 \
  -e NEXT_PUBLIC_APP_URL=http://127.0.0.1:3300 \
  -v /tmp/cashier-docker-restore-data:/app/data \
  cashier:docker-restore-smoke
```

Expected: command prints a container ID.

- [ ] **Step 4: Verify migrations, persistence, and HTTP startup**

```bash
for attempt in $(seq 1 60); do
  if curl -sS -o /dev/null http://127.0.0.1:3300; then
    break
  fi
  sleep 1
done
curl -sS -o /dev/null http://127.0.0.1:3300
docker logs cashier-docker-restore-smoke > /tmp/cashier-docker-restore.log 2>&1
test -f /tmp/cashier-docker-restore-data/sqlite.db
test -d /tmp/cashier-docker-restore-data/uploads
rg -n "Migrations completed successfully|Starting application" /tmp/cashier-docker-restore.log
```

Expected: HTTP succeeds, SQLite/upload paths exist in the mount, and logs confirm migrations completed before startup.

- [ ] **Step 5: Clean up only disposable resources**

```bash
docker rm -f cashier-docker-restore-smoke
docker image rm cashier:docker-restore-smoke
rm -rf /tmp/cashier-docker-restore-data /tmp/cashier-docker-restore.log
```

Expected: exit 0. Do not remove the user's real `.env`, `data/`, Compose service, or GHCR image.

- [ ] **Step 6: Audit the final diff**

```bash
git status --short
git diff --check 11331c54..HEAD
git diff --name-only 11331c54..HEAD
if find tests -type f | rg '(^|/)governance/|governance\.test\.'; then
  echo "Governance test path residue found" >&2
  exit 1
fi
if rg -n 'describe\("[^"]*governance' tests --glob "*.test.ts" --glob "*.test.tsx"; then
  echo "Governance test residue found" >&2
  exit 1
fi
```

Expected implementation changes are limited to:

```text
.dockerignore
.github/workflows/ci-cd.yml
CLAUDE.md
Dockerfile
README.md
docker-compose.yml
docker-entrypoint.sh
docs/operations/runbook.md
package.json
tests/unit/architecture/backend-simplification.test.ts (deleted)
tests/unit/governance/pwa-policy.test.ts (deleted)
tests/unit/governance/retired-features.test.ts (deleted)
tests/unit/workspace/single-ledger-product-governance.test.ts (deleted)
```

The plan document itself may also appear if it is committed on the implementation branch.

- [ ] **Step 7: Commit verification fixes only when needed**

If verification required tracked fixes:

```bash
git add -A
git commit -m "deploy: verify restored docker chain"
```

If the worktree is already clean after Task 5, do not create an empty commit.

## Final Acceptance

- `docker build` completes from a clean checkout with only `NEXT_PUBLIC_APP_URL` as a build argument.
- The image starts as non-root `node`, uses `/app/data`, runs Drizzle migrations, and starts `server.js`.
- A mounted `./data` persists SQLite and uploads across container replacement.
- Compose uses `ghcr.io/xiangyu-labs/cashier:latest`, `.env`, the data mount, and Watchtower label.
- `docker:build`, `docker:prod`, and `docker:down` match the pre-removal commands.
- GitHub Actions builds PR images without pushing and pushes `latest` plus SHA tags on `main`.
- `build-and-push` remains independent from `test`, as explicitly requested.
- README, CLAUDE.md, and tracked operations runbook document Docker without restoring retired product behavior.
- All four governance tests are deleted and no test suite containing `governance` remains.
- Normal unit, integration, coverage, build, and i18n checks pass.
- Docker remains the active production path until the Vercel production path is implemented and accepted.

# Phase 0 and Phase 1 Platform Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an isolated migration worktree and prove, with disposable staging resources, that Vercel, Neon, Cloudflare R2, Cloudflare Queues, and a Cloudflare Worker can support Cashier's target transaction, upload, authentication, image-decoding, retry, and DLQ assumptions without touching production.

**Architecture:** Keep `main` and its Docker application unchanged. Build a separate Vercel probe function, a separate Cloudflare Worker, and one shared probe contract package on `codex/vercel-cloudflare-migration`; use a tiny non-business Postgres schema and dedicated staging resources to exercise the real cross-provider path. Default CI runs only deterministic unit, type, and build checks; an explicit authenticated smoke command performs real cloud calls and writes a sanitized validation report.

**Tech Stack:** Git worktrees, npm workspaces, TypeScript, Vitest, Vercel Functions, Cloudflare Workers/Wrangler, Cloudflare R2, Cloudflare Queues/DLQ, Neon Postgres, Drizzle ORM, `@neondatabase/serverless`, AWS S3 signing SDK, `@cf-wasm/photon`, Zod.

---

## Scope Guardrails

This plan implements only roadmap Phase 0 and Phase 1.

It creates:

- an isolated migration branch and worktree;
- a disposable platform-probe schema, not Cashier's target business schema;
- a Vercel staging probe API, not the current Next.js application;
- a Cloudflare staging Worker with R2, Queue, and DLQ bindings;
- ordinary unit/contract tests and an explicit real-service smoke script;
- a sanitized platform-validation report.

It does not:

- change `main` after the plan document itself;
- publish a migration image to GHCR `latest`;
- connect the existing `src/` application to Neon, R2, Queue, or Worker;
- migrate or read production SQLite rows or local uploads;
- create target business tables;
- add a governance, omission, filesystem, or architecture test;
- remove Docker, SQLite, local storage, or the in-process task runtime;
- use production domains, production secrets, or production Cloudflare/Neon resources.

## Staging Resource Names

Use these names consistently:

```text
Git branch:       codex/vercel-cloudflare-migration
Git worktree:     /Users/xiangyu/Projects/Cashier-vercel-cloudflare
Neon project:     cashier-migration-staging
Neon branch:      platform-probe
Neon database:    cashier_probe
R2 bucket:        cashier-migration-probe-staging
Queue:            cashier-migration-probe-staging
DLQ:              cashier-migration-probe-dlq-staging
Worker:           cashier-migration-probe-staging
Vercel project:   cashier-migration-probe
Vercel region:    sin1
```

All resources must be empty or disposable. If one of these globally scoped names is unavailable, stop and update this
plan and every checked-in binding together before creating a differently named resource.

## Required Runtime Variable Names

Never put real values in Git or command arguments that are printed by shell tracing.

```text
PROBE_DATABASE_URL
INTERNAL_WORKER_SECRET
PLATFORM_PROBE_TOKEN
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_ENDPOINT
R2_BUCKET
WORKER_BASE_URL
PROBE_BASE_URL
PRODUCTION_APP_ORIGIN
```

`INTERNAL_WORKER_SECRET` and `PLATFORM_PROBE_TOKEN` must be independent random 32-byte values. Generate them locally
with `openssl rand -base64 32` and enter them only through Wrangler/Vercel secret prompts or an ignored local env file.

## File Structure

Create:

```text
apps/platform-probe-web/
  api/probe.ts                     Vercel HTTP entrypoint
  src/db.ts                        Node/Vercel Neon connection lifecycle
  src/env.ts                       Vercel-only environment validation
  src/r2.ts                        R2 PUT capability signing
  src/service.ts                   Authenticated create/dispatch/status/replay actions
  src/worker-client.ts             Signed internal Worker client
  tests/service.test.ts            Vercel probe contract tests with fakes
  .env.example                     Non-secret configuration contract
  package.json
  tsconfig.json
  vercel.json

apps/worker/
  src/auth.ts                      HMAC verification and persisted replay rejection
  src/db.ts                        Worker-scoped Neon connection lifecycle
  src/image-probe-core.ts          Runtime-neutral byte/hash/decode/pixel validation
  src/image-probe.ts               Photon adapter for the workerd runtime
  src/index.ts                     Fetch, Queue, and DLQ handlers
  src/types.ts                     Worker binding types
  tests/auth.test.ts               Signature and replay contract tests
  tests/image-probe.test.ts        JPEG/PNG decode and rejection tests
  .dev.vars.example                Non-secret local contract
  package.json
  tsconfig.json
  wrangler.jsonc

packages/platform-probe/
  src/contracts.ts                 Shared request, response, message, and status schemas
  src/schema.ts                    Drizzle probe-only tables
  src/signing.ts                   Web Crypto SHA-256/HMAC helpers
  src/index.ts                     Public exports
  sql/0000_platform_probe.sql      Disposable probe schema
  tests/signing.test.ts            Cross-runtime signing tests
  package.json
  tsconfig.json

scripts/platform-smoke/
  setup-database.mjs               Apply the disposable probe schema
  reset-database.mjs               Drop only probe tables
  run.mjs                          Real end-to-end staging validation and report writer

docs/platform/
  phase-0-baseline.md              Approved production-isolation baseline
  phase-1-validation.md            Sanitized output generated by the smoke script
```

Modify:

```text
.gitignore                         Ignore Worker local secrets and smoke scratch files
package.json                       Register npm workspaces and probe commands
package-lock.json                  Lock probe dependencies
tsconfig.json                      Exclude separately checked probe workspaces
Dockerfile                         Make the retained migration-branch Docker build workspace-aware
.github/workflows/ci-cd.yml        Add probe checks to PR CI without changing GHCR push conditions
```

## Probe Protocol

The smoke script calls the Vercel probe API with `Authorization: Bearer $PLATFORM_PROBE_TOKEN`.

Supported actions:

```ts
type ProbeAction =
  | { action: "createUpload"; contentType: "image/jpeg" | "image/png"; byteSize: number; sha256Base64: string }
  | { action: "dispatch"; runId: string; forceFailure?: boolean }
  | { action: "status"; runId: string }
  | { action: "replayAuth" };
```

Vercel signs internal Worker requests with these headers:

```text
x-cashier-timestamp: Unix milliseconds
x-cashier-nonce: UUID
x-cashier-signature: lowercase HMAC-SHA256 hex
```

The canonical signing input is:

```text
timestamp + "." + nonce + "." + lowercase_sha256_hex(body_bytes)
```

The Worker accepts a timestamp within 300 seconds, verifies the HMAC, then inserts the nonce into
`platform_probe_nonces`. A duplicate nonce returns `409` and does not enqueue a message.

## Task 1: Create the Isolated Worktree and Record the Baseline

**Files:**

- Create in migration worktree: `docs/platform/phase-0-baseline.md`

- [ ] **Step 1: Invoke the worktree workflow**

Use `superpowers:using-git-worktrees` before running any worktree command. Work from
`/Users/xiangyu/Projects/Cashier` and confirm the approved starting commit:

```bash
git status --short
git rev-parse HEAD
git worktree list
```

Expected: status is empty and only the current `main` worktree exists. Review `git log --oneline -5` and confirm the
roadmap and this plan are present before creating the migration branch.

- [ ] **Step 2: Create the branch and worktree**

```bash
BASE_COMMIT=$(git rev-parse main)
git worktree add \
  /Users/xiangyu/Projects/Cashier-vercel-cloudflare \
  -b codex/vercel-cloudflare-migration \
  "$BASE_COMMIT"
cd /Users/xiangyu/Projects/Cashier-vercel-cloudflare
git branch --show-current
```

Expected: `codex/vercel-cloudflare-migration`.

- [ ] **Step 3: Verify the untouched application baseline**

```bash
npm ci
npm run lint
npm run tsc
npm run test:run
npm run build
docker build --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3300 -t cashier:migration-baseline .
```

Expected: every command exits 0. Do not delete retained tests to obtain a green baseline.

- [ ] **Step 4: Write the baseline record**

Create `docs/platform/phase-0-baseline.md` with this exact structure:

```markdown
# Phase 0 Migration Baseline

Date: 2026-07-11
Baseline source: parent of the commit that first adds this document
Branch: codex/vercel-cloudflare-migration
Worktree: /Users/xiangyu/Projects/Cashier-vercel-cloudflare

## Verification

- `npm ci`: passed
- `npm run lint`: passed
- `npm run tsc`: passed
- `npm run test:run`: passed
- `npm run build`: passed
- Docker image `cashier:migration-baseline`: built successfully

## Production Isolation

- GitHub Actions publishes GHCR images only for a push to `main`.
- Pull requests build but do not push Docker images.
- This branch uses only migration staging resources.
- No production environment file, SQLite database, upload directory, domain, or secret is used.
```

- [ ] **Step 5: Verify the GHCR condition directly**

```bash
rg -n 'branches: \[main\]|push:.*github.event_name.*push.*github.ref.*refs/heads/main' .github/workflows/ci-cd.yml
```

Expected: both the `main` trigger and the `push` expression are present.

- [ ] **Step 6: Commit the baseline record**

```bash
git add docs/platform/phase-0-baseline.md
git commit -m "docs: record migration worktree baseline"
```

## Task 2: Add Isolated npm Workspace Boundaries

**Files:**

- Create: `apps/platform-probe-web/package.json`
- Create: `apps/platform-probe-web/tsconfig.json`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `packages/platform-probe/package.json`
- Create: `packages/platform-probe/tsconfig.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Modify: `Dockerfile`

- [ ] **Step 1: Add workspace declarations and commands**

Add this top-level property to `package.json` after `"private": true`:

```json
"workspaces": [
  "apps/*",
  "packages/*"
]
```

Add these scripts without changing existing application scripts:

```json
"probe:check": "npm run check --workspace @cashier/platform-probe && npm run check --workspace @cashier/platform-probe-web && npm run check --workspace @cashier/platform-worker",
"probe:test": "npm run test --workspace @cashier/platform-probe && npm run test --workspace @cashier/platform-probe-web && npm run test --workspace @cashier/platform-worker",
"probe:db:setup": "node scripts/platform-smoke/setup-database.mjs",
"probe:db:reset": "node scripts/platform-smoke/reset-database.mjs",
"probe:smoke": "node scripts/platform-smoke/run.mjs"
```

- [ ] **Step 2: Create the shared-package manifest**

Create `packages/platform-probe/package.json`:

```json
{
  "name": "@cashier/platform-probe",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts",
    "./signing": "./src/signing.ts"
  },
  "scripts": {
    "check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "drizzle-orm": "0.45.2",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 3: Create the Vercel-package manifest**

Create `apps/platform-probe-web/package.json`:

```json
{
  "name": "@cashier/platform-probe-web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "3.1085.0",
    "@aws-sdk/s3-request-presigner": "3.1085.0",
    "@cashier/platform-probe": "0.0.0",
    "@neondatabase/serverless": "1.1.0",
    "drizzle-orm": "0.45.2",
    "ws": "8.21.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/ws": "8.18.1",
    "@vercel/node": "5.8.23",
    "typescript": "^5.9.3",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 4: Create the Worker-package manifest**

Create `apps/worker/package.json`:

```json
{
  "name": "@cashier/platform-worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "tsc --noEmit && wrangler deploy --dry-run --env staging",
    "test": "vitest run",
    "deploy:staging": "wrangler deploy --env staging"
  },
  "dependencies": {
    "@cashier/platform-probe": "0.0.0",
    "@cf-wasm/photon": "0.3.6",
    "@neondatabase/serverless": "1.1.0",
    "drizzle-orm": "0.45.2",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "5.20260711.1",
    "typescript": "^5.9.3",
    "vitest": "4.1.10",
    "wrangler": "4.110.0"
  }
}
```

- [ ] **Step 5: Create workspace TypeScript configs**

Create the three `tsconfig.json` files with `strict`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`.
Use this Vercel/shared base:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "api/**/*.ts", "tests/**/*.ts"]
}
```

For `apps/worker/tsconfig.json`, replace `types` with:

```json
"types": ["@cloudflare/workers-types", "vitest/globals"]
```

and use `"include": ["src/**/*.ts", "tests/**/*.ts"]`.

- [ ] **Step 6: Keep root TypeScript checks scoped to the current app**

Change the root `tsconfig.json` exclusion to:

```json
"exclude": [
  "node_modules",
  "apps/platform-probe-web",
  "apps/worker",
  "packages/platform-probe"
]
```

- [ ] **Step 7: Ignore only local probe secrets and scratch files**

Append to `.gitignore`:

```gitignore
# Platform probe local secrets and generated scratch data
.dev.vars
.dev.vars.*
!.dev.vars.example
/scripts/platform-smoke/.tmp/
!/docs/platform/
!/docs/platform/**
```

- [ ] **Step 8: Make the retained Docker build workspace-aware**

In the `deps` stage of `Dockerfile`, replace `COPY package*.json ./` with:

```dockerfile
COPY package*.json ./
COPY apps/platform-probe-web/package.json ./apps/platform-probe-web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/platform-probe/package.json ./packages/platform-probe/package.json
```

Do not otherwise change the Docker runtime.

- [ ] **Step 9: Install and lock workspace dependencies**

```bash
npm install
npm ci
npm run tsc
npm run build
docker build --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3300 -t cashier:migration-workspace .
```

Expected: all commands exit 0. The existing application still builds; probe checks are added only after their source
files exist.

- [ ] **Step 10: Commit the workspace boundary**

```bash
git add package.json package-lock.json tsconfig.json .gitignore Dockerfile apps packages
git commit -m "build: add isolated platform probe workspaces"
```

## Task 3: Define Probe Contracts, Tables, and Request Signing

**Files:**

- Create: `packages/platform-probe/src/contracts.ts`
- Create: `packages/platform-probe/src/schema.ts`
- Create: `packages/platform-probe/src/signing.ts`
- Create: `packages/platform-probe/src/index.ts`
- Create: `packages/platform-probe/sql/0000_platform_probe.sql`
- Create: `packages/platform-probe/tests/signing.test.ts`

- [ ] **Step 1: Write failing signing tests**

Create `packages/platform-probe/tests/signing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signInternalRequest, verifyInternalRequest } from "../src/signing";

describe("platform probe internal signing", () => {
  it("verifies the same timestamp, nonce, and body", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const body = JSON.stringify({ runId: "48a23c62-dc75-4672-b516-94d6215e2e13" });
    const signature = await signInternalRequest(secret, "1783699200000", "nonce-1", body);

    await expect(
      verifyInternalRequest(secret, "1783699200000", "nonce-1", body, signature)
    ).resolves.toBe(true);
  });

  it("rejects a changed body", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const signature = await signInternalRequest(secret, "1783699200000", "nonce-1", "original");

    await expect(
      verifyInternalRequest(secret, "1783699200000", "nonce-1", "changed", signature)
    ).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

```bash
npm run test --workspace @cashier/platform-probe
```

Expected: FAIL because `../src/signing` does not exist.

- [ ] **Step 3: Implement cross-runtime signing**

Create `packages/platform-probe/src/signing.ts`:

```ts
const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function canonical(timestamp: string, nonce: string, bodyHash: string): string {
  return `${timestamp}.${nonce}.${bodyHash}`;
}

export async function signInternalRequest(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string
): Promise<string> {
  const bodyHash = await sha256Hex(body);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    encoder.encode(canonical(timestamp, nonce, bodyHash))
  );
  return toHex(signature);
}

export async function verifyInternalRequest(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
  signatureHex: string
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(signatureHex)) return false;
  const bodyHash = await sha256Hex(body);
  const signature = Uint8Array.from(signatureHex.match(/.{2}/g) ?? [], (value) =>
    Number.parseInt(value, 16)
  );
  return crypto.subtle.verify(
    "HMAC",
    await importHmacKey(secret),
    signature,
    encoder.encode(canonical(timestamp, nonce, bodyHash))
  );
}
```

- [ ] **Step 4: Define shared contracts**

Create `packages/platform-probe/src/contracts.ts` with these exact exported schemas and inferred types:

```ts
import { z } from "zod";

export const probeStatusSchema = z.enum([
  "upload_pending",
  "uploaded",
  "queued",
  "processed",
  "dead_lettered",
]);

export const createUploadActionSchema = z.object({
  action: z.literal("createUpload"),
  contentType: z.enum(["image/jpeg", "image/png"]),
  byteSize: z.number().int().positive().max(4 * 1024 * 1024),
  sha256Base64: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
});

export const dispatchActionSchema = z.object({
  action: z.literal("dispatch"),
  runId: z.string().uuid(),
  forceFailure: z.boolean().optional(),
});

export const statusActionSchema = z.object({
  action: z.literal("status"),
  runId: z.string().uuid(),
});

export const replayAuthActionSchema = z.object({ action: z.literal("replayAuth") });

export const probeActionSchema = z.discriminatedUnion("action", [
  createUploadActionSchema,
  dispatchActionSchema,
  statusActionSchema,
  replayAuthActionSchema,
]);

export const queueMessageSchema = z.object({
  runId: z.string().uuid(),
  forceFailure: z.boolean(),
});

export type ProbeStatus = z.infer<typeof probeStatusSchema>;
export type ProbeAction = z.infer<typeof probeActionSchema>;
export type QueueMessage = z.infer<typeof queueMessageSchema>;
```

- [ ] **Step 5: Define Drizzle probe tables**

Create `packages/platform-probe/src/schema.ts`:

```ts
import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ProbeStatus } from "./contracts";

export const platformProbeRuns = pgTable("platform_probe_runs", {
  id: uuid("id").primaryKey(),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  expectedSha256Base64: text("expected_sha256_base64").notNull(),
  observedSha256Hex: text("observed_sha256_hex"),
  width: integer("width"),
  height: integer("height"),
  status: text("status").$type<ProbeStatus>().notNull(),
  forceFailure: boolean("force_failure").notNull().default(false),
  deliveryCount: integer("delivery_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformProbeNonces = pgTable("platform_probe_nonces", {
  nonce: text("nonce").primaryKey(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProbeRun = typeof platformProbeRuns.$inferSelect;
export type NewProbeRun = typeof platformProbeRuns.$inferInsert;
```

- [ ] **Step 6: Add the disposable SQL schema**

Create `packages/platform-probe/sql/0000_platform_probe.sql`:

```sql
CREATE TABLE IF NOT EXISTS platform_probe_runs (
  id uuid PRIMARY KEY,
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 4194304),
  expected_sha256_base64 text NOT NULL,
  observed_sha256_hex text,
  width integer,
  height integer,
  status text NOT NULL CHECK (status IN ('upload_pending', 'uploaded', 'queued', 'processed', 'dead_lettered')),
  force_failure boolean NOT NULL DEFAULT false,
  delivery_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_probe_nonces (
  nonce text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 7: Export the package surface**

Create `packages/platform-probe/src/index.ts`:

```ts
export * from "./contracts";
export * from "./schema";
export * from "./signing";
```

- [ ] **Step 8: Run shared checks and commit**

```bash
npm run check --workspace @cashier/platform-probe
npm run test --workspace @cashier/platform-probe
git add packages/platform-probe
git commit -m "test: define platform probe contracts"
```

Expected: TypeScript passes and both signing tests pass.

## Task 4: Implement the Vercel Probe API Test-First

**Files:**

- Create: `apps/platform-probe-web/src/env.ts`
- Create: `apps/platform-probe-web/src/db.ts`
- Create: `apps/platform-probe-web/src/r2.ts`
- Create: `apps/platform-probe-web/src/worker-client.ts`
- Create: `apps/platform-probe-web/src/service.ts`
- Create: `apps/platform-probe-web/api/probe.ts`
- Create: `apps/platform-probe-web/tests/service.test.ts`
- Create: `apps/platform-probe-web/.env.example`
- Create: `apps/platform-probe-web/vercel.json`

- [ ] **Step 1: Write failing service contract tests**

Define `ProbeServiceDependencies` in the test with fake `runs`, `signUpload`, and `callWorker` adapters. Cover these exact
behaviors in `apps/platform-probe-web/tests/service.test.ts`:

```ts
it("rejects an invalid bearer token with 401");
it("creates an upload_pending run and returns a 15 minute PUT URL");
it("marks an upload_pending run uploaded and calls the Worker once");
it("returns an existing processed run without dispatching it again");
it("sends the exact same signed request twice for replay verification");
```

Use a fixed clock (`1783699200000`), fixed UUIDs, and in-memory maps. Assert response status and JSON bodies rather than
private helper calls.

- [ ] **Step 2: Run the tests to verify RED**

```bash
npm run test --workspace @cashier/platform-probe-web
```

Expected: FAIL because `src/service.ts` does not exist.

- [ ] **Step 3: Implement strict Vercel environment parsing**

Create `apps/platform-probe-web/src/env.ts` with a Zod schema requiring:

```ts
{
  PROBE_DATABASE_URL: z.string().url().startsWith("postgresql://"),
  INTERNAL_WORKER_SECRET: z.string().min(32),
  PLATFORM_PROBE_TOKEN: z.string().min(32),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_ENDPOINT: z.string().url().startsWith("https://"),
  R2_BUCKET: z.literal("cashier-migration-probe-staging"),
  WORKER_BASE_URL: z.string().url().startsWith("https://"),
}
```

Export `getProbeEnv()` and parse `process.env` inside the request, not at module import time.

- [ ] **Step 4: Implement request-scoped Neon access**

In `apps/platform-probe-web/src/db.ts`, configure `neonConfig.webSocketConstructor = ws`, create a `Pool` inside
`withProbeDb`, pass `drizzle(pool, { schema: { platformProbeRuns } })` to the callback, and always call
`await pool.end()` in `finally`. Export a `ProbeRunsRepository` with:

```ts
create(input: NewProbeRun): Promise<ProbeRun>;
get(id: string): Promise<ProbeRun | null>;
markUploaded(id: string): Promise<ProbeRun | null>;
```

`markUploaded` must use one Drizzle interactive transaction and update only a row whose status is `upload_pending`.
Return an already `uploaded`, `queued`, `processed`, or `dead_lettered` row unchanged so dispatch is idempotent. The
Worker owns the later `uploaded` to `queued` transition.

- [ ] **Step 5: Implement checksum-bound R2 PUT signing**

In `apps/platform-probe-web/src/r2.ts`, create an S3 client with the R2 endpoint, `region: "auto"`, and the staging
credentials. Sign a `PutObjectCommand` for 900 seconds with all of these fields:

```ts
{
  Bucket: "cashier-migration-probe-staging",
  Key: `platform-probe/${runId}/input`,
  ContentType: input.contentType,
  ContentLength: input.byteSize,
  ChecksumSHA256: input.sha256Base64,
}
```

Return the URL, object key, and an ISO expiry timestamp.

- [ ] **Step 6: Implement the signed Worker client**

In `apps/platform-probe-web/src/worker-client.ts`, serialize JSON once, generate one timestamp and nonce, sign the exact
serialized body with `signInternalRequest`, and send it to `${WORKER_BASE_URL}/internal/enqueue`. For replay validation,
send the same body and the same three signature headers twice to `${WORKER_BASE_URL}/internal/auth-probe` and return both
status codes. Treat any enqueue response other than `202` as an error.

- [ ] **Step 7: Implement the probe service**

In `apps/platform-probe-web/src/service.ts`, export `createProbeService(dependencies)` with:

```ts
handle(request: Request): Promise<Response>;
```

The handler must:

1. compare the bearer token with `PLATFORM_PROBE_TOKEN` using `timingSafeEqual` after checking equal byte lengths;
2. parse `ProbeAction` with `probeActionSchema`;
3. create a UUID and database row before returning an upload URL;
4. mark a run `uploaded`, then call the Worker; a failed Worker call leaves the run `uploaded` so dispatch can retry;
5. return `404` for an unknown run;
6. return the full sanitized run for `status`;
7. return `{ firstStatus: 204, secondStatus: 409 }` for `replayAuth`.

Responses must use `Cache-Control: no-store` and never include R2 credentials, the internal secret, Neon URL, or Worker
headers.

- [ ] **Step 8: Wire the Vercel entrypoint**

Create `apps/platform-probe-web/api/probe.ts`. Convert the `VercelRequest` into a standard `Request`, call the service,
and copy status, headers, and JSON body to `VercelResponse`. Reject non-POST methods with `405` and `Allow: POST`.

Create `apps/platform-probe-web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/probe.ts": {
      "maxDuration": 30
    }
  },
  "regions": ["sin1"]
}
```

- [ ] **Step 9: Add the non-secret environment contract**

Create `apps/platform-probe-web/.env.example` using fake, non-routable values and the exact variable names from
`Required Secret Names`. Set `R2_BUCKET=cashier-migration-probe-staging`; use `example.invalid` for URLs and 32-character
fake strings for secrets.

- [ ] **Step 10: Run tests and commit**

```bash
npm run check --workspace @cashier/platform-probe-web
npm run test --workspace @cashier/platform-probe-web
git add apps/platform-probe-web
git commit -m "feat: add isolated Vercel platform probe"
```

Expected: TypeScript and all five service contract tests pass.

## Task 5: Implement the Worker, Image Validation, Queue Retry, and DLQ

**Files:**

- Create: `apps/worker/src/types.ts`
- Create: `apps/worker/src/db.ts`
- Create: `apps/worker/src/auth.ts`
- Create: `apps/worker/src/image-probe-core.ts`
- Create: `apps/worker/src/image-probe.ts`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/tests/auth.test.ts`
- Create: `apps/worker/tests/image-probe.test.ts`
- Create: `apps/worker/.dev.vars.example`
- Create: `apps/worker/wrangler.jsonc`

- [ ] **Step 1: Write failing authentication tests**

In `apps/worker/tests/auth.test.ts`, use a fake nonce repository and cover:

```ts
it("accepts a valid signature inside the five minute window");
it("rejects a timestamp older than five minutes");
it("rejects a changed body");
it("returns replay for the second use of the same nonce");
```

The public function under test is:

```ts
authenticateInternalRequest(
  request: Request,
  secret: string,
  nowMs: number,
  claimNonce: (nonce: string) => Promise<boolean>
): Promise<"accepted" | "unauthorized" | "replay">;
```

- [ ] **Step 2: Write failing image tests**

In `apps/worker/tests/image-probe.test.ts`, test `image-probe-core.ts` with an injected decoder. Use small JPEG-magic and
PNG-magic byte arrays plus a fake decoder that returns `{ width: 10, height: 20 }`; assert both accepted formats return
those dimensions and a 64-character lowercase SHA-256 value. Assert plain UTF-8 bytes are rejected as
`unsupported_magic_bytes`, a mismatched expected digest is rejected as `checksum_mismatch`, and a fake
`5000 x 5000` decode is rejected as `pixel_limit_exceeded`. Real Photon decoding in `workerd` is verified by the
Wrangler dry-run and Task 8 staging smoke path.

- [ ] **Step 3: Run the Worker tests to verify RED**

```bash
npm run test --workspace @cashier/platform-worker
```

Expected: FAIL because the Worker source files do not exist.

- [ ] **Step 4: Define Worker bindings**

Create `apps/worker/src/types.ts`:

```ts
import type { QueueMessage } from "@cashier/platform-probe";

export interface Env {
  PROBE_BUCKET: R2Bucket;
  PROBE_QUEUE: Queue<QueueMessage>;
  PROBE_DATABASE_URL: string;
  INTERNAL_WORKER_SECRET: string;
  MAX_PROBE_IMAGE_BYTES: string;
  MAX_PROBE_PIXELS: string;
}
```

- [ ] **Step 5: Implement request-scoped Worker Neon access**

Create `apps/worker/src/db.ts` using `Pool` from `@neondatabase/serverless` and
`drizzle-orm/neon-serverless`. Create and close the pool within each fetch or queue invocation. Export:

```ts
claimNonce(nonce: string): Promise<boolean>;
getRun(runId: string): Promise<ProbeRun | null>;
markQueued(runId: string, forceFailure: boolean): Promise<ProbeRun | null>;
incrementDelivery(runId: string): Promise<ProbeRun | null>;
markProcessed(runId: string, result: ImageProbeResult): Promise<boolean>;
markDeadLettered(runId: string): Promise<boolean>;
```

`claimNonce` inserts into `platform_probe_nonces` and returns `false` only for PostgreSQL unique violation `23505`.
`markProcessed` updates only `status = 'queued'`; duplicate deliveries after completion return `false` and are acked.

- [ ] **Step 6: Implement internal request authentication**

Create `apps/worker/src/auth.ts` with the function signature from Step 1. Require all three signing headers, require an
integer timestamp within 300,000 milliseconds of `nowMs`, verify HMAC before calling `claimNonce`, return `replay` when
the nonce claim is false, and never log the signature or secret.

- [ ] **Step 7: Implement Worker-side image decoding**

Create `apps/worker/src/image-probe-core.ts` with an injected decoder interface:

```ts
export interface DecodedDimensions {
  width: number;
  height: number;
}

export type DecodeImage = (bytes: Uint8Array) => DecodedDimensions;
```

Before decoding:

1. reject byte length above `MAX_PROBE_IMAGE_BYTES`;
2. accept only JPEG `ff d8 ff` or PNG `89 50 4e 47 0d 0a 1a 0a` magic bytes;
3. calculate SHA-256 and compare the base64 value to the database expectation.

Call the injected decoder, reject zero dimensions or more than `MAX_PROBE_PIXELS`, and return:

```ts
interface ImageProbeResult {
  sha256Hex: string;
  width: number;
  height: number;
}
```

Use stable error codes `image_too_large`, `unsupported_magic_bytes`, `checksum_mismatch`, `decode_failed`, and
`pixel_limit_exceeded`.

Create `apps/worker/src/image-probe.ts` using `PhotonImage` from `@cf-wasm/photon/workerd`. Its decoder calls
`PhotonImage.new_from_byteslice`, reads width and height, and always calls `free()` in `finally`, then delegates all
hash, magic-byte, byte-limit, and pixel-limit checks to `image-probe-core.ts`.

- [ ] **Step 8: Implement fetch, Queue, and DLQ entrypoints**

Create `apps/worker/src/index.ts` as an `ExportedHandler<Env, QueueMessage>`.

Fetch behavior:

- `GET /health` returns `{ "ok": true }` and `Cache-Control: no-store`.
- `POST /internal/auth-probe` authenticates and returns `204`, `401`, or `409`.
- `POST /internal/enqueue` authenticates, parses `queueMessageSchema`, marks the run queued, sends one message through
  `PROBE_QUEUE`, and returns `202`.
- all other paths return `404`.

Queue behavior:

- when `batch.queue === "cashier-migration-probe-dlq-staging"`, mark each still-queued run `dead_lettered` and ack;
- otherwise increment delivery count;
- if `forceFailure` is true, throw `new Error("forced_queue_failure")` without acking;
- load the R2 object by the database `object_key`, reject a missing object, validate and decode it, then CAS the run to
  `processed`;
- ack duplicate messages whose run is already `processed` or `dead_lettered`.

- [ ] **Step 9: Configure staging bindings**

Create `apps/worker/wrangler.jsonc`:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "cashier-migration-probe",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-11",
  "compatibility_flags": ["nodejs_compat"],
  "env": {
    "staging": {
      "name": "cashier-migration-probe-staging",
      "vars": {
        "MAX_PROBE_IMAGE_BYTES": "4194304",
        "MAX_PROBE_PIXELS": "16000000"
      },
      "r2_buckets": [
        {
          "binding": "PROBE_BUCKET",
          "bucket_name": "cashier-migration-probe-staging"
        }
      ],
      "queues": {
        "producers": [
          {
            "binding": "PROBE_QUEUE",
            "queue": "cashier-migration-probe-staging"
          }
        ],
        "consumers": [
          {
            "queue": "cashier-migration-probe-staging",
            "max_batch_size": 1,
            "max_batch_timeout": 1,
            "max_retries": 2,
            "dead_letter_queue": "cashier-migration-probe-dlq-staging"
          },
          {
            "queue": "cashier-migration-probe-dlq-staging",
            "max_batch_size": 1,
            "max_batch_timeout": 1
          }
        ]
      }
    }
  }
}
```

- [ ] **Step 10: Add the non-secret Worker contract**

Create `apps/worker/.dev.vars.example` with fake values for `PROBE_DATABASE_URL` and `INTERNAL_WORKER_SECRET`. Do not add
real `.dev.vars`.

- [ ] **Step 11: Run tests, dry-run the Worker bundle, and commit**

```bash
npm run test --workspace @cashier/platform-worker
npm run check --workspace @cashier/platform-worker
git add apps/worker
git commit -m "feat: add Cloudflare platform probe worker"
```

Expected: authentication and image tests pass; Wrangler dry-run bundles Photon and reports no binding or module errors.

## Task 6: Add Database Setup and Reset Scripts

**Files:**

- Create: `scripts/platform-smoke/setup-database.mjs`
- Create: `scripts/platform-smoke/reset-database.mjs`

- [ ] **Step 1: Implement schema setup**

Create `setup-database.mjs`. Require `PROBE_DATABASE_URL`, configure Neon WebSocket with `ws`, read
`packages/platform-probe/sql/0000_platform_probe.sql`, execute it with one `Client`, close the client in `finally`, and
print only `platform probe schema ready`. Never print the URL.

- [ ] **Step 2: Implement safe reset**

Create `reset-database.mjs`. Require `PROBE_DATABASE_URL`, then execute only:

```sql
DROP TABLE IF EXISTS platform_probe_nonces;
DROP TABLE IF EXISTS platform_probe_runs;
```

Before executing, reject a URL whose database pathname is not exactly `/cashier_probe`. Print only
`platform probe schema removed`.

- [ ] **Step 3: Verify missing-secret failure locally**

```bash
env -u PROBE_DATABASE_URL npm run probe:db:setup
env -u PROBE_DATABASE_URL npm run probe:db:reset
```

Expected: both commands exit non-zero with `PROBE_DATABASE_URL is required` and do not print any environment values.

- [ ] **Step 4: Commit the scripts**

```bash
git add scripts/platform-smoke/setup-database.mjs scripts/platform-smoke/reset-database.mjs
git commit -m "build: add disposable probe database scripts"
```

## Task 7: Provision Dedicated Staging Resources

**Files:**

- No source files changed.

- [ ] **Step 1: Authenticate CLIs without storing tokens in Git**

```bash
npx wrangler whoami
npx vercel whoami
npx neonctl me
```

Expected: each command identifies the intended staging-capable account. If authentication is missing, use the CLI's
interactive login command and rerun the identity check.

- [ ] **Step 2: Create the Neon staging project and branch**

Create `cashier-migration-staging` in region `aws-ap-southeast-1`, with `cashier_probe` as its initial database, then
create the isolated `platform-probe` branch:

```bash
npx neonctl projects create \
  --name cashier-migration-staging \
  --region-id aws-ap-southeast-1 \
  --database cashier_probe \
  --set-context
npx neonctl branches create --name platform-probe
export PROBE_DATABASE_URL="$(npx neonctl connection-string platform-probe --database-name cashier_probe --pooled --ssl require)"
```

Do not print or commit `PROBE_DATABASE_URL`.

Run:

```bash
npm run probe:db:setup
```

Expected: `platform probe schema ready`.

- [ ] **Step 3: Create Cloudflare storage and queues**

```bash
npx wrangler r2 bucket create cashier-migration-probe-staging
npx wrangler queues create cashier-migration-probe-dlq-staging
npx wrangler queues create cashier-migration-probe-staging
```

Expected: each resource is created or already exists in the staging account.

- [ ] **Step 4: Create scoped R2 S3 credentials**

In Cloudflare Dashboard, create an R2 API token restricted to Object Read & Write on
`cashier-migration-probe-staging`. Record its access key, secret, and endpoint only in the Vercel staging environment
and the ignored local smoke environment. Do not use a Cloudflare global API key.

- [ ] **Step 5: Set Worker secrets and deploy staging**

From `apps/worker`, run these commands and enter the matching values through the prompts:

```bash
npx wrangler secret put PROBE_DATABASE_URL --env staging
npx wrangler secret put INTERNAL_WORKER_SECRET --env staging
npm run deploy:staging
```

Expected: deployment name is `cashier-migration-probe-staging`; save its `workers.dev` HTTPS URL as
`WORKER_BASE_URL`.

- [ ] **Step 6: Link and configure the Vercel staging project**

```bash
cd apps/platform-probe-web
npx vercel link --yes --project cashier-migration-probe
```

Add each required Vercel variable to Production only with `npx vercel env add NAME production`. This is the production
environment of the isolated probe project, not Cashier production:

```text
PROBE_DATABASE_URL
INTERNAL_WORKER_SECRET
PLATFORM_PROBE_TOKEN
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_ENDPOINT
R2_BUCKET
WORKER_BASE_URL
```

Set `R2_BUCKET` to `cashier-migration-probe-staging`. Deploy with:

```bash
npx vercel deploy --prod --yes
```

Expected: `https://cashier-migration-probe.vercel.app`. Save it locally as `PROBE_BASE_URL` without adding it to the
Cashier production `.env`.

- [ ] **Step 7: Configure exact-origin PUT-only R2 CORS**

Create the ignored `scripts/platform-smoke/.tmp/r2-cors.json` from the origin of `PROBE_BASE_URL` with this structure:

```json
{
  "rules": [
    {
      "allowed": {
        "origins": ["https://cashier-migration-probe.vercel.app"],
        "methods": ["PUT"],
        "headers": ["content-type", "x-amz-checksum-sha256"]
      },
      "exposeHeaders": ["etag"],
      "maxAgeSeconds": 3600
    }
  ]
}
```

Generate the origin programmatically with `new URL(process.env.PROBE_BASE_URL).origin`; do not allow `*`. Apply it:

```bash
npx wrangler r2 bucket cors set cashier-migration-probe-staging \
  --file scripts/platform-smoke/.tmp/r2-cors.json \
  --force
```

Expected: Wrangler confirms the CORS policy update.

- [ ] **Step 8: Verify isolated health and resource emptiness**

```bash
curl --fail --silent --show-error "$WORKER_BASE_URL/health"
npx wrangler r2 object get cashier-migration-probe-staging/platform-probe/nonexistent --file /tmp/probe-none --remote
```

Expected: health returns `{"ok":true}`. The nonexistent object command reports not found; it must not return production
data.

## Task 8: Add the Real-Service Smoke Runner

**Files:**

- Create: `scripts/platform-smoke/run.mjs`
- Create by command: `docs/platform/phase-1-validation.md`

- [ ] **Step 1: Implement smoke input and secret validation**

At startup, `run.mjs` must require `PROBE_BASE_URL`, `PLATFORM_PROBE_TOKEN`, and the non-secret
`PRODUCTION_APP_ORIGIN`; require both origins to use HTTPS; and reject equal hostnames. It must never load the production
`.env` or print the bearer token.

- [ ] **Step 2: Implement the API helper and polling**

Implement `callProbe(action)` to POST JSON to `${PROBE_BASE_URL}/api/probe` with the bearer token and `Cache-Control:
no-store`. Implement `waitForStatus(runId, expected, timeoutMs)` with 1-second polling and a 90-second timeout. Include
the last sanitized status in timeout errors.

- [ ] **Step 3: Generate bounded test images**

Use the existing root `sharp` dependency to generate three temporary JPEGs under `scripts/platform-smoke/.tmp/`:

```text
1000 x 1000    basic decode
3000 x 3000    medium decoded-memory case
4000 x 4000    configured 16 megapixel boundary
```

For each file, compute byte length, SHA-256 base64, and SHA-256 hex. Fail locally if the encoded file exceeds the 4 MB
probe limit. Also load `tests/fixtures/images/receipt-3.png` and read its expected dimensions with `sharp.metadata()` so
the real Worker path proves both JPEG and PNG decoding.

- [ ] **Step 4: Implement direct signed upload verification**

For each generated image:

1. call `createUpload`;
2. PUT bytes directly to the returned R2 URL with the exact `Content-Type` and `x-amz-checksum-sha256` headers;
3. call `dispatch`;
4. poll for `processed`;
5. assert the Worker SHA-256 equals the local hex digest and dimensions match.

Record upload, enqueue, and processing durations without recording signed URLs or object keys.

Before the first PUT, send an R2 CORS preflight using `Origin: new URL(PROBE_BASE_URL).origin`,
`Access-Control-Request-Method: PUT`, and
`Access-Control-Request-Headers: content-type,x-amz-checksum-sha256`. Assert the response allows only that origin and
includes `PUT`.

- [ ] **Step 5: Implement duplicate, replay, and DLQ verification**

- Dispatch the already processed basic run again and assert status stays `processed`.
- Call `replayAuth` and assert `firstStatus === 204` and `secondStatus === 409`.
- Create and upload another basic image, dispatch it with `forceFailure: true`, poll for `dead_lettered`, and assert
  `deliveryCount >= 3` after primary delivery plus two retries.

- [ ] **Step 6: Write a sanitized Markdown report**

After all assertions pass, write `docs/platform/phase-1-validation.md` containing:

```markdown
# Phase 1 Platform Validation

Date: the exact value produced by `new Date().toISOString()`
Branch: codex/vercel-cloudflare-migration

## Results

- Vercel-to-Neon transaction: passed
- Worker-to-Neon conditional update: passed
- Direct checksum-bound R2 PUT: passed
- Worker R2 read and Photon decode: passed
- JPEG 1 MP, 9 MP, and 16 MP decoded-image cases: passed
- PNG fixture decoded-image case: passed
- Exact-origin R2 PUT CORS preflight: passed
- Signed Vercel-to-Worker request: passed
- Persisted nonce replay rejection: passed
- Queue delivery and duplicate idempotency: passed
- Queue retries and DLQ delivery: passed

## Measurements

A Markdown table generated from the measured byte sizes and durations, without URLs, credentials, object keys, account
IDs, or database hostnames.

## Confirmed Boundaries

- Maximum probe upload: 4 MB encoded bytes
- Maximum probe decoded pixels: 16,000,000
- Signed PUT lifetime: 900 seconds
- Internal request clock window: 300 seconds
- Queue batch size: 1
- Queue retries before DLQ: 2
```

Generate actual timestamps, sizes, and durations programmatically; do not hand-edit successful measurements.

- [ ] **Step 7: Run the smoke path**

Load only the ignored staging smoke environment, then run:

```bash
npm run probe:smoke
```

Expected: exit 0, print one concise PASS line per assertion, and create
`docs/platform/phase-1-validation.md`. Inspect the report and confirm it contains no `postgresql://`, `X-Amz-`, bearer
token, account ID, access key, object key, or `workers.dev`/`vercel.app` URL.

- [ ] **Step 8: Commit the smoke runner and evidence**

```bash
git add scripts/platform-smoke/run.mjs docs/platform/phase-1-validation.md
git commit -m "test: verify staging platform assumptions"
```

## Task 9: Add Probe Checks to PR CI Without Publishing Migration Images

**Files:**

- Modify: `.github/workflows/ci-cd.yml`

- [ ] **Step 1: Add deterministic probe checks to the existing test job**

After `Validate i18n`, add:

```yaml
      - name: Check platform probe packages
        run: npm run probe:check

      - name: Test platform probe packages
        run: npm run probe:test
```

Do not add cloud secrets, real-service smoke commands, Worker deploys, or Vercel deploys to default CI.

- [ ] **Step 2: Verify the Docker push condition remains unchanged**

```bash
rg -n 'push:.*github.event_name.*push.*github.ref.*refs/heads/main' .github/workflows/ci-cd.yml
```

Expected: exactly one match under `docker/build-push-action`; migration branch or pull request builds cannot push GHCR
images.

- [ ] **Step 3: Run the complete local checkpoint**

```bash
npm ci
npm run lint
npm run tsc
npm run test:run
npm run validate:i18n
npm run probe:check
npm run probe:test
npm run build
docker build --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3300 -t cashier:migration-phase-1 .
git diff --check
```

Expected: every command exits 0. The cloud smoke evidence from Task 8 is already fresh and is not rerun in default CI.

- [ ] **Step 4: Commit CI changes**

```bash
git add .github/workflows/ci-cd.yml
git commit -m "ci: check isolated platform probes"
```

## Task 10: Phase Review, Cleanup, and Handoff to Phase 2 Design

**Files:**

- Modify only if measurements require corrections: `docs/platform/phase-1-validation.md`
- Preserve: all Phase 0 and Phase 1 source, tests, and reports until Phase 2 selects reusable pieces

- [ ] **Step 1: Request code review**

Use `superpowers:requesting-code-review`. Review against:

```text
docs/superpowers/specs/2026-07-11-vercel-cloudflare-migration-roadmap-design.md
docs/superpowers/plans/2026-07-11-phase-0-1-platform-validation.md
```

Require the reviewer to check production isolation, secret leakage, Pool lifecycle, HMAC canonicalization, nonce replay
handling, checksum binding, Photon memory cleanup, Queue retry/DLQ semantics, and CI publish conditions.

- [ ] **Step 2: Scan tracked content for secret leakage**

```bash
git grep -nE 'postgresql://[^ ]+@|X-Amz-(Credential|Signature)|R2_SECRET_ACCESS_KEY=.+|INTERNAL_WORKER_SECRET=.+|PLATFORM_PROBE_TOKEN=.+' -- . ':!package-lock.json'
```

Expected: no real credential-bearing matches. Fake example values must be visibly non-routable and non-secret.

- [ ] **Step 3: Verify production files were not wired to target services**

```bash
BASELINE_COMMIT=$(git merge-base main HEAD)
git diff "$BASELINE_COMMIT" -- src .env.example docker-compose.yml docker-entrypoint.sh
```

Expected: no output. `Dockerfile` is allowed to contain only the workspace manifest-copy adjustment from Task 2.

- [ ] **Step 4: Verify cloud resource isolation**

```bash
npx wrangler r2 bucket list
npx wrangler queues list
npx vercel project inspect cashier-migration-probe
```

Expected: the resources named in this plan exist; no command targets the Docker production host, its filesystem, or its
domain.

- [ ] **Step 5: Run final verification before completion**

Use `superpowers:verification-before-completion`, then rerun:

```bash
npm run probe:check
npm run probe:test
npm run probe:smoke
npm run tsc
npm run test:run
npm run build
git status --short
```

Expected: all commands exit 0. `git status --short` is empty after committing any review corrections and refreshed
sanitized evidence.

- [ ] **Step 6: Record the Phase 1 decision**

If every real-service assertion passes, Phase 1 is accepted and the next design is the Phase 2 Neon/core-domain spec.
If a platform assumption fails, keep production unchanged, record the exact sanitized failure in
`docs/platform/phase-1-validation.md`, and revise the target architecture before writing the Phase 2 spec. Do not add an
ad hoc compatibility path merely to make the probe green.

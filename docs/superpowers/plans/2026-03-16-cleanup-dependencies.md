# Cleanup Dependencies and Configuration - Implementation Plan

> **For agentic workers:** REQUIRED: Use @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 9 unused dependencies and simplify configuration files to reduce bundle size and maintenance burden.

**Architecture:** Remove unused npm packages, simplify Next.js config, and clean up Docker configuration.

**Tech Stack:** npm, Next.js, Docker

---

## Chunk 1: Remove Unused Dependencies

### Task 1.1: Identify and remove web-push

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Verify web-push is not used**

Run: `grep -r "web-push" --include="*.ts" --include="*.tsx" src/`

Expected: Only import statements in types or unused files

Run: `grep -r "web-push" --include="*.js" public/`

Expected: May find push-worker.js but no actual server-side usage

- [ ] **Step 2: Remove web-push packages**

Run:
```bash
npm uninstall web-push @types/web-push
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused web-push dependencies

web-push was installed but never actually used in the application.
Removing to reduce bundle size and security surface area."
```

---

### Task 1.2: Remove react-virtuoso

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Verify it's not used**

Run: `grep -r "react-virtuoso" --include="*.ts" --include="*.tsx" src/`

Expected: No imports found

- [ ] **Step 2: Remove the package**

Run: `npm uninstall react-virtuoso`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused react-virtuoso"
```

---

### Task 1.3: Remove @radix-ui/react-toast

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Verify sonner is used instead**

Run: `grep -r "@radix-ui/react-toast" --include="*.ts" --include="*.tsx" src/`

Expected: No imports (project uses sonner for toasts)

- [ ] **Step 2: Remove the package**

Run: `npm uninstall @radix-ui/react-toast`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused @radix-ui/react-toast

Project uses sonner for toast notifications."
```

---

### Task 1.4: Remove dev dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove ts-node**

Run:
```bash
npm uninstall ts-node
```

- [ ] **Step 2: Remove supertest**

Run:
```bash
npm uninstall supertest @types/supertest
```

- [ ] **Step 3: Remove other unused dev deps**

Run:
```bash
npm uninstall @swc/helpers @types/web
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused dev dependencies

- ts-node (project uses tsx)
- supertest (no API tests using it)
- @swc/helpers (Next.js provides)
- @types/web (no usage found)"
```

---

## Chunk 2: Simplify Next.js Configuration

### Task 2.1: Update next.config.ts

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Read current config**

Run: `cat next.config.ts`

- [ ] **Step 2: Remove aggressive caching options**

Find and remove or modify:
```typescript
aggressiveFrontEndNavCaching: true,  // REMOVE - too aggressive
// cacheOnFrontEndNav: true,         // REMOVE - this is the default anyway
```

- [ ] **Step 3: Evaluate push-worker.js**

If web-push was removed and push notifications aren't used:
```typescript
// Remove or comment out:
importScripts: ["/push-worker.js"],
```

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "config: simplify Next.js PWA configuration

- Remove aggressiveFrontEndNavCaching
- Remove redundant cacheOnFrontEndNav (it's the default)
- Clean up push worker config since web-push was removed"
```

---

## Chunk 3: Simplify Docker Configuration

### Task 3.1: Optimize Dockerfile

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Read current Dockerfile**

Run: `cat Dockerfile`

- [ ] **Step 2: Remove unnecessary copies from runner stage**

In the `runner` stage, review and potentially remove:
```dockerfile
# These might not be needed at runtime:
# COPY --from=builder /app/src ./src
# COPY --from=builder /app/tsconfig.json ./tsconfig.json
# COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
```

Keep only:
```dockerfile
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY docker-entrypoint.sh ./
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "chore: optimize Dockerfile

Remove source files from production image since Next.js standalone
output includes all necessary compiled code."
```

---

## Chunk 4: Update CI/CD Configuration

### Task 4.1: Enhance GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/cd.yml`

- [ ] **Step 1: Read current workflow**

Run: `cat .github/workflows/cd.yml`

- [ ] **Step 2: Add build verification step**

Add before the deploy job or as a separate job:
```yaml
jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:run
      - run: npm run build

  deploy:
    needs: test-and-build
    runs-on: ubuntu-latest
    steps:
      # ... existing deploy steps
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "ci: add test and build verification to deployment

Ensures tests pass and build succeeds before deploying to production."
```

---

## Chunk 5: Verify and Finalize

### Task 5.1: Verify build after all changes

- [ ] **Step 1: Clean install**

Run:
```bash
rm -rf node_modules package-lock.json
npm install
```

- [ ] **Step 2: Run tests**

Run: `npm run test:run`

Expected: All tests pass

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: Build succeeds

- [ ] **Step 4: Check bundle size**

Run:
```bash
echo "Checking .next/static size:"
du -sh .next/static
```

- [ ] **Step 5: Final commit**

```bash
git commit --allow-empty -m "chore: cleanup dependencies and configuration

Removed dependencies:
- web-push, @types/web-push
- react-virtuoso
- @radix-ui/react-toast
- ts-node, supertest, @types/supertest
- @swc/helpers, @types/web

Configuration improvements:
- Simplified next.config.ts PWA settings
- Optimized Dockerfile
- Enhanced CI/CD with test/build verification

Results:
- ~9 fewer dependencies to maintain
- Smaller Docker image
- Safer deployments with CI verification"
```

---

## Verification Checklist

- [ ] **Dependency verification:**
  ```bash
  npm ls web-push 2>&1 | grep "empty"
  npm ls react-virtuoso 2>&1 | grep "empty"
  # Should show these are not installed
  ```

- [ ] **Build verification:**
  - `npm run build` succeeds
  - No missing dependency errors
  - No type errors

- [ ] **Runtime verification:**
  - `npm run dev` starts successfully
  - Key features work (login, ledger, settings)
  - No console errors about missing modules

- [ ] **Docker verification:**
  ```bash
  docker build -t cashier:test .
  docker run -p 3000:3000 cashier:test
  # App should start successfully
  ```

---

## Rollback Plan

If issues occur:

1. **Re-install specific dependency:**
   ```bash
   npm install web-push @types/web-push
   ```

2. **Revert all changes:**
   ```bash
   git revert HEAD~5..HEAD
   npm install
   ```

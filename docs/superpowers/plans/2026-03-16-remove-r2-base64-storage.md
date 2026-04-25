# 彻底删除 R2 和 Base64 存储支持 - 实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development to implement this plan.

**Goal:** 彻底删除所有 R2 和 Base64 存储相关代码，只保留本地文件系统存储。不保留任何兼容性代码。

**Architecture:** 清理后的架构只包含本地存储 (local.ts) 和简化的工具函数。

**Tech Stack:** Next.js, TypeScript, Drizzle ORM, Local Filesystem Storage

---

## Chunk 1: 删除迁移相关文件

### Task 1: 删除迁移脚本文件

**Files:**
- Delete: `scripts/migrate-on-start.ts`
- Delete: `scripts/migrate-images-to-local.ts`
- Delete: `src/lib/db/migrate-images.ts`

**Steps:**

- [ ] **Step 1: 删除 scripts/migrate-on-start.ts**

```bash
rm scripts/migrate-on-start.ts
```

- [ ] **Step 2: 删除 scripts/migrate-images-to-local.ts**

```bash
rm scripts/migrate-images-to-local.ts
```

- [ ] **Step 3: 删除 src/lib/db/migrate-images.ts**

```bash
rm src/lib/db/migrate-images.ts
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: remove migration scripts - all images now local storage"
```

---

## Chunk 2: 更新 instrumentation.ts

### Task 2: 删除图片迁移调用和 R2 日志

**Files:**
- Modify: `src/instrumentation.ts`

**Current content:**
```typescript
import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Log critical configuration status for diagnostics (safe, no secrets exposed)
    logger.info({
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: process.env.DATABASE_URL ? "configured" : "not configured",
        r2Enabled: process.env.ENABLE_R2_STORAGE === "true",
        r2Endpoint: process.env.R2_ENDPOINT ? "configured" : "not configured",
        r2Bucket: process.env.R2_BUCKET_NAME ? "configured" : "not configured",
    }, "Service configuration status");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Dynamic import to avoid Edge Runtime static analysis issues
            const { autoRegisterTasks } = await import("@/lib/flow/task-registry");
            // Auto-discover and register all task handlers
            await autoRegisterTasks();
            logger.info("Task handlers auto-registered successfully");

            // Migrate images to local storage (idempotent, runs once)
            const { migrateImagesToLocal } = await import("@/lib/db/migrate-images");
            const stats = await migrateImagesToLocal();
            if (stats.totalImages > 0) {
                logger.info({
                    total: stats.totalImages,
                    base64: stats.migratedFromBase64,
                    r2: stats.migratedFromR2,
                    local: stats.alreadyLocal,
                    failed: stats.failedImages,
                }, "Image migration completed");
            }
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}
```

**New content:**
```typescript
import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Log critical configuration status for diagnostics (safe, no secrets exposed)
    logger.info({
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: process.env.DATABASE_URL ? "configured" : "not configured",
        localStorage: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
    }, "Service configuration status");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Dynamic import to avoid Edge Runtime static analysis issues
            const { autoRegisterTasks } = await import("@/lib/flow/task-registry");
            // Auto-discover and register all task handlers
            await autoRegisterTasks();
            logger.info("Task handlers auto-registered successfully");
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}
```

**Steps:**

- [ ] **Step 1: 替换 instrumentation.ts 内容**

- [ ] **Step 2: Commit**

```bash
git add src/instrumentation.ts
git commit -m "chore: remove image migration from instrumentation"
```

---

## Chunk 3: 更新 docker-entrypoint.sh

### Task 3: 删除图片迁移步骤和环境变量

**Files:**
- Modify: `docker-entrypoint.sh`

**Current content:**
```bash
#!/bin/sh
set -e

echo "========================================"
echo "  Cashier Application Startup"
echo "========================================"
echo "Environment: ${NODE_ENV:-production}"
echo "Database: ${DATABASE_URL:-file:./data/sqlite.db}"
echo "Skip Migrations: ${SKIP_MIGRATIONS:-false}"
echo "Skip Image Migration: ${SKIP_IMAGE_MIGRATION:-false}"
echo "========================================"

# Ensure the data directory exists for SQLite
if [ -n "$DATABASE_URL" ]; then
    # Extract directory path from file:./path/to/db or ./path/to/db
    DB_DIR=$(echo "$DATABASE_URL" | sed 's/file://' | sed 's/\/[^/]*$//')
    if [ "$DB_DIR" != "$DATABASE_URL" ] && [ "$DB_DIR" != "." ] && [ -n "$DB_DIR" ]; then
        echo "[INIT] Ensuring database directory exists: $DB_DIR"
        mkdir -p "$DB_DIR"
    fi
fi

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

# Run image migration only if not skipped
if [ "$SKIP_IMAGE_MIGRATION" != "true" ]; then
    echo "[INIT] Running image migration check..."
    if npx tsx -r tsconfig-paths/register scripts/migrate-on-start.ts; then
        echo "[INIT] Image migration completed"
    else
        echo "[WARN] Image migration had issues, continuing anyway..."
    fi
else
    echo "[INIT] Skipping image migration (SKIP_IMAGE_MIGRATION=true)"
fi

echo "[INIT] Starting application..."
exec node server.js
```

**New content:**
```bash
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
    DB_DIR=$(echo "$DATABASE_URL" | sed 's/file://' | sed 's/\/[^/]*$//')
    if [ "$DB_DIR" != "$DATABASE_URL" ] && [ "$DB_DIR" != "." ] && [ -n "$DB_DIR" ]; then
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

**Steps:**

- [ ] **Step 1: 替换 docker-entrypoint.sh 内容**

- [ ] **Step 2: Commit**

```bash
git add docker-entrypoint.sh
git commit -m "chore: remove image migration from docker entrypoint"
```

---

## Chunk 4: 简化 storage/index.ts

### Task 4: 删除 base64 相关函数

**Files:**
- Modify: `src/lib/storage/index.ts`

**Current content:**
```typescript
/**
 * Storage Provider Interface
 *
 * Abstracts file storage operations to support multiple backends:
 - R2 (Cloudflare) - production
 - Memory - testing
 * Local filesystem - future option
 */

export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param key - Unique key/path for the file
   * @param data - File data as Buffer
   * @param contentType - MIME type
   * @param cacheControl - Cache-Control header (optional)
   * @returns Public URL of the uploaded file
   */
  upload(key: string, data: Buffer, contentType: string, cacheControl?: string): Promise<string>;

  /**
   * Download a file from storage
   * @param key - Key/path of the file
   * @returns File data as Buffer
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   * @param key - Key/path of the file
   * @returns Delete result with success status
   */
  delete(key: string): Promise<{ success: boolean; key: string; error?: Error }>;

  /**
   * Get the public URL for a file
   * @param key - Key/path of the file
   * @returns Full public URL
   */
  getPublicUrl(key: string): string;

  /**
   * Extract key from a public URL
   * @param url - Public URL
   * @returns Key or null if not a valid URL for this storage
   */
  extractKeyFromUrl(url: string): string | null;
}

/**
 * Check if a URL is a base64 data URL
 */
export function isBase64Url(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Check if a URL is an HTTP(S) URL
 */
export function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Check if a URL is a local upload URL (/api/uploads/)
 */
export function isLocalUploadUrl(url: string): boolean {
  return url.startsWith('/api/uploads/');
}

/**
 * Convert base64 data URL to Buffer
 */
export function base64ToBuffer(base64Url: string): { buffer: Buffer; mimeType: string } {
  const matches = base64Url.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid base64 data URL');
  }
  const [, mimeType, base64Data] = matches;
  const buffer = Buffer.from(base64Data, 'base64');
  return { buffer, mimeType };
}

/**
 * Convert Buffer to base64 data URL
 */
export function bufferToBase64(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}
```

**New content:**
```typescript
/**
 * Storage Provider Interface
 *
 * Local filesystem storage only
 */

export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param key - Unique key/path for the file
   * @param data - File data as Buffer
   * @param contentType - MIME type
   * @param cacheControl - Cache-Control header (optional)
   * @returns Public URL of the uploaded file
   */
  upload(key: string, data: Buffer, contentType: string, cacheControl?: string): Promise<string>;

  /**
   * Download a file from storage
   * @param key - Key/path of the file
   * @returns File data as Buffer
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   * @param key - Key/path of the file
   * @returns Delete result with success status
   */
  delete(key: string): Promise<{ success: boolean; key: string; error?: Error }>;

  /**
   * Get the public URL for a file
   * @param key - Key/path of the file
   * @returns Full public URL
   */
  getPublicUrl(key: string): string;

  /**
   * Extract key from a public URL
   * @param url - Public URL
   * @returns Key or null if not a valid URL for this storage
   */
  extractKeyFromUrl(url: string): string | null;
}

/**
 * Check if a URL is a local upload URL (/api/uploads/)
 */
export function isLocalUploadUrl(url: string): boolean {
  return url.startsWith('/api/uploads/');
}
```

**Steps:**

- [ ] **Step 1: 替换 storage/index.ts 内容**

- [ ] **Step 2: Commit**

```bash
git add src/lib/storage/index.ts
git commit -m "chore: remove base64 and HTTP URL utils from storage"
```

---

## Chunk 5: 简化 storage/utils.ts

### Task 5: 删除 HTTP URL 支持，只保留本地存储

**Files:**
- Modify: `src/lib/storage/utils.ts`

**Current content:**
```typescript
import { getLocalStorage } from "./local";
import { isBase64Url, isHttpUrl, isLocalUploadUrl } from "./index";
import { logger } from "@/lib/logger";

/**
 * Load image data for AI processing
 * Supports base64 data URLs, local upload URLs, and HTTP URLs
 *
 * @param url - Image URL (base64 data URL, local upload URL, or HTTP URL)
 * @returns Base64 data URL for AI API
 */
export async function loadImageForAI(url: string): Promise<string> {
  // If it's already a base64 data URL, return as-is
  if (isBase64Url(url)) {
    return url;
  }

  // If it's a local upload URL, read from local storage
  if (isLocalUploadUrl(url)) {
    const storage = getLocalStorage();
    const key = storage.extractKeyFromUrl(url);

    if (!key) {
      throw new Error(`Invalid local upload URL: ${url}`);
    }

    try {
      const buffer = await storage.download(key);
      const mimeType = inferImageMimeType(key);
      const base64 = buffer.toString("base64");
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      logger.error({ error, url, key }, "Failed to load image from local storage for AI");
      throw new Error(`Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // For any other HTTP URL, fetch directly
  if (isHttpUrl(url)) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Cashier-App/1.0" },
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || inferImageMimeType(url);
      const base64 = buffer.toString("base64");
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      logger.error({ error, url }, "Failed to fetch external image for AI");
      throw new Error(`Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error(`Unsupported image URL format: ${url.substring(0, 50)}...`);
}

/**
 * Result of loading an image for AI processing
 */
export interface LoadImageResult {
  url: string;
  dataUrl?: string;
  error?: Error;
  success: boolean;
}

/**
 * Load multiple images for AI processing
 * Uses Promise.allSettled to handle partial failures gracefully
 *
 * @param urls - Array of image URLs
 * @returns Array of load results (both successful and failed)
 */
export async function loadImagesForAI(urls: string[]): Promise<LoadImageResult[]> {
  const results = await Promise.allSettled(
    urls.map(async (url): Promise<LoadImageResult> => {
      try {
        const dataUrl = await loadImageForAI(url);
        return { url, dataUrl, success: true };
      } catch (error) {
        return {
          url,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    })
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      // This should rarely happen since we catch errors in the mapper
      return {
        url: urls[index],
        success: false,
        error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
      };
    }
  });
}

/**
 * Filter successful image loads and return data URLs
 * Throws if any images failed to load (use this when all images are required)
 *
 * @param urls - Array of image URLs
 * @returns Array of base64 data URLs
 * @throws Error if any image fails to load
 */
export async function loadImagesForAIOrThrow(urls: string[]): Promise<string[]> {
  const results = await loadImagesForAI(urls);
  const failures = results.filter(r => !r.success);

  if (failures.length > 0) {
    const errorMessages = failures.map(f => `${f.url}: ${f.error?.message}`).join("; ");
    throw new Error(`Failed to load ${failures.length} image(s): ${errorMessages}`);
  }

  return results.map(r => r.dataUrl!);
}

/**
 * Check if an image URL needs to be loaded (converted to base64)
 *
 * @param url - Image URL
 * @returns true if the URL needs to be loaded (is HTTP URL)
 */
export function needsLoading(url: string): boolean {
  return isHttpUrl(url) && !isBase64Url(url);
}

/**
 * Infer image MIME type from URL or file extension
 * Used as a fallback when the server returns generic content types like application/octet-stream
 */
export function inferImageMimeType(url: string): string {
  // Remove query parameters
  const urlWithoutQuery = url.split('?')[0];
  const ext = urlWithoutQuery.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'avif': 'image/avif',
  };

  return mimeTypes[ext || ''] || 'image/jpeg';
}
```

**New content:**
```typescript
import { getLocalStorage } from "./local";
import { isLocalUploadUrl } from "./index";
import { logger } from "@/lib/logger";

/**
 * Load image data for AI processing
 * Only supports local upload URLs
 *
 * @param url - Image URL (must be local upload URL /api/uploads/...)
 * @returns Base64 data URL for AI API
 */
export async function loadImageForAI(url: string): Promise<string> {
  if (!isLocalUploadUrl(url)) {
    throw new Error(`Invalid image URL format. Only local upload URLs (/api/uploads/...) are supported: ${url.substring(0, 50)}...`);
  }

  const storage = getLocalStorage();
  const key = storage.extractKeyFromUrl(url);

  if (!key) {
    throw new Error(`Invalid local upload URL: ${url}`);
  }

  try {
    const buffer = await storage.download(key);
    const mimeType = inferImageMimeType(key);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    logger.error({ error, url, key }, "Failed to load image from local storage for AI");
    throw new Error(`Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Result of loading an image for AI processing
 */
export interface LoadImageResult {
  url: string;
  dataUrl?: string;
  error?: Error;
  success: boolean;
}

/**
 * Load multiple images for AI processing
 * Uses Promise.allSettled to handle partial failures gracefully
 *
 * @param urls - Array of image URLs (local upload URLs only)
 * @returns Array of load results (both successful and failed)
 */
export async function loadImagesForAI(urls: string[]): Promise<LoadImageResult[]> {
  const results = await Promise.allSettled(
    urls.map(async (url): Promise<LoadImageResult> => {
      try {
        const dataUrl = await loadImageForAI(url);
        return { url, dataUrl, success: true };
      } catch (error) {
        return {
          url,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    })
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      // This should rarely happen since we catch errors in the mapper
      return {
        url: urls[index],
        success: false,
        error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
      };
    }
  });
}

/**
 * Filter successful image loads and return data URLs
 * Throws if any images failed to load (use this when all images are required)
 *
 * @param urls - Array of image URLs (local upload URLs only)
 * @returns Array of base64 data URLs
 * @throws Error if any image fails to load
 */
export async function loadImagesForAIOrThrow(urls: string[]): Promise<string[]> {
  const results = await loadImagesForAI(urls);
  const failures = results.filter(r => !r.success);

  if (failures.length > 0) {
    const errorMessages = failures.map(f => `${f.url}: ${f.error?.message}`).join("; ");
    throw new Error(`Failed to load ${failures.length} image(s): ${errorMessages}`);
  }

  return results.map(r => r.dataUrl!);
}

/**
 * Infer image MIME type from URL or file extension
 * Used as a fallback when the server returns generic content types like application/octet-stream
 */
export function inferImageMimeType(url: string): string {
  // Remove query parameters
  const urlWithoutQuery = url.split('?')[0];
  const ext = urlWithoutQuery.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'avif': 'image/avif',
  };

  return mimeTypes[ext || ''] || 'image/jpeg';
}
```

**Steps:**

- [ ] **Step 1: 替换 storage/utils.ts 内容**

- [ ] **Step 2: Commit**

```bash
git add src/lib/storage/utils.ts
git commit -m "chore: remove base64 and HTTP URL support from loadImageForAI"
```

---

## Chunk 6: 更新 .env.example

### Task 6: 清理环境变量示例

**Files:**
- Modify: `.env.example`

**Current content already clean - verify LOCAL_STORAGE_PATH is present**

确认 `.env.example` 已经有 `LOCAL_STORAGE_PATH=./data/uploads` 且没有 R2 相关变量。

**Steps:**

- [ ] **Step 1: 检查 .env.example 内容**

确保包含：`LOCAL_STORAGE_PATH=./data/uploads`

确保不包含：
- `ENABLE_R2_STORAGE`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

- [ ] **Step 2: Commit (如果有修改)**

```bash
git add .env.example
git commit -m "chore: verify .env.example only has local storage vars"
```

---

## Chunk 7: 检查 next.config.ts

### Task 7: 确保没有 R2 相关配置

**Files:**
- Check: `next.config.ts`

**Steps:**

- [ ] **Step 1: 读取 next.config.ts**

确认没有 `remotePatterns` 指向 R2 域名。

- [ ] **Step 2: 如有 R2 配置则删除**

---

## Chunk 8: 运行测试

### Task 8: 验证构建和测试通过

**Steps:**

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
npm run build
```

- [ ] **Step 2: 运行测试**

```bash
npm run test:run
```

- [ ] **Step 3: Commit (如果全部通过)**

```bash
git commit -m "test: verify build and tests pass after removing R2/base64"
```

---

## Summary

清理完成后，代码库应该只剩下：

**保留的文件：**
- `src/lib/storage/local.ts` - 本地存储实现
- `src/lib/storage/index.ts` - StorageProvider 接口 + isLocalUploadUrl
- `src/lib/storage/utils.ts` - loadImageForAI (仅支持本地 URL)
- `src/lib/storage/memory.ts` - 测试用的内存存储
- `src/lib/storage/image-processing.ts` - 图片处理
- `src/app/api/uploads/[...path]/route.ts` - 图片服务 API

**删除的文件：**
- `scripts/migrate-on-start.ts`
- `scripts/migrate-images-to-local.ts`
- `src/lib/db/migrate-images.ts`
- 所有 R2/base64 兼容代码

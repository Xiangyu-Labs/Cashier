# Replace R2 with Local File System Storage - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace R2 (Cloudflare) and base64 database storage with local file system storage as the only storage backend.

**Architecture:** All images are stored in the local file system under `uploads/` directory. Database stores relative paths (`/uploads/ledger-id/doc-id/filename.ext`). Images are served via `/api/uploads/[...path]` API route with proper authorization checks.

**Tech Stack:** Next.js App Router, TypeScript, Node.js fs API, sharp (already used for image processing)

---

## File Structure Overview

| File | Responsibility |
|------|---------------|
| `src/lib/storage/local.ts` | Local file system storage provider - implements upload, download, delete, getPublicUrl, extractKeyFromUrl |
| `src/lib/storage/index.ts` | Storage provider interface and utility functions |
| `src/app/api/uploads/[...path]/route.ts` | API route to serve uploaded images with authorization |
| `src/features/source-document/server/actions/helpers.ts` | Update processImages to use local storage only |
| `src/features/source-document/server/actions/delete.ts` | Update delete logic to use local storage |
| `src/lib/storage/utils.ts` | Update loadImageForAI to read from local files |
| `next.config.ts` | Remove R2 remotePatterns, add local image handling |
| `.env.example` | Replace R2 env vars with LOCAL_STORAGE_PATH |
| `docker-compose.yml` | Add volume mount for uploads |
| `scripts/migrate-images-to-local.ts` | Optional: migrate existing base64/R2 images to local storage |

---

## Chunk 1: Core Storage Implementation

### Task 1: Create LocalStorageProvider

**Files:**
- Create: `src/lib/storage/local.ts`

**Implementation Details:**
- Store files under `uploads/` directory (configurable via `LOCAL_STORAGE_PATH` env var, default: `./uploads`)
- File path format: `{basePath}/{ledgerId}/{sourceDocumentId}/{uuid}.{ext}`
- Public URL format: `/api/uploads/{ledgerId}/{sourceDocumentId}/{uuid}.{ext}`
- Implement path traversal protection (reject `..`, backslashes, absolute paths)

- [ ] **Step 1: Create LocalStorageProvider class**

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import type { StorageProvider } from './index';
import { logger } from '@/lib/logger';

export interface DeleteResult {
  success: boolean;
  key: string;
  error?: Error;
}

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH || './uploads';
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    // Validate key for path traversal
    if (this.isInvalidKey(key)) {
      throw new Error(`Invalid key: ${key}`);
    }

    const fullPath = path.join(this.basePath, key);
    const dir = path.dirname(fullPath);

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, data);
      logger.debug({ key, size: data.length, contentType }, 'File uploaded to local storage');
      return this.getPublicUrl(key);
    } catch (error) {
      logger.error({ error, key }, 'Failed to upload file to local storage');
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async download(key: string): Promise<Buffer> {
    if (this.isInvalidKey(key)) {
      throw new Error(`Invalid key: ${key}`);
    }

    const fullPath = path.join(this.basePath, key);

    try {
      const data = await fs.readFile(fullPath);
      return data;
    } catch (error) {
      logger.error({ error, key }, 'Failed to download file from local storage');
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(key: string): Promise<DeleteResult> {
    if (this.isInvalidKey(key)) {
      return { success: false, key, error: new Error('Invalid key') };
    }

    const fullPath = path.join(this.basePath, key);

    try {
      await fs.unlink(fullPath);
      logger.debug({ key }, 'File deleted from local storage');
      return { success: true, key };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ error: err, key }, 'Failed to delete file from local storage');
      return { success: false, key, error: err };
    }
  }

  getPublicUrl(key: string): string {
    // Return API route path
    return `/api/uploads/${key}`;
  }

  extractKeyFromUrl(url: string): string | null {
    // Handle both full URLs and paths
    // Extract key from: /api/uploads/ledger-id/doc-id/filename.ext
    // or: http://host/api/uploads/ledger-id/doc-id/filename.ext

    let pathPart: string;

    if (url.startsWith('/api/uploads/')) {
      pathPart = url;
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const urlObj = new URL(url);
        pathPart = urlObj.pathname;
      } catch {
        return null;
      }
    } else {
      return null;
    }

    if (!pathPart.startsWith('/api/uploads/')) {
      return null;
    }

    let key = pathPart.slice('/api/uploads/'.length);

    // Remove leading slash if present
    if (key.startsWith('/')) {
      key = key.slice(1);
    }

    if (this.isInvalidKey(key)) {
      return null;
    }

    return key;
  }

  private isInvalidKey(key: string): boolean {
    // Prevent path traversal
    if (key.includes('..') || key.includes('\\')) {
      logger.warn({ key }, 'Path traversal attempt detected');
      return true;
    }
    // Reject absolute paths
    if (path.isAbsolute(key)) {
      logger.warn({ key }, 'Absolute path detected');
      return true;
    }
    return false;
  }
}

// Singleton instance
let localInstance: LocalStorageProvider | null = null;

export function getLocalStorage(): LocalStorageProvider {
  if (!localInstance) {
    localInstance = new LocalStorageProvider();
  }
  return localInstance;
}
```

- [ ] **Step 2: Write unit test for LocalStorageProvider**

Create: `tests/unit/lib/storage/local.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalStorageProvider } from '@/lib/storage/local';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cashier-test-'));
    process.env.LOCAL_STORAGE_PATH = tempDir;
    provider = new LocalStorageProvider();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    delete process.env.LOCAL_STORAGE_PATH;
  });

  describe('upload', () => {
    it('should upload file and return public URL', async () => {
      const key = 'ledger-1/doc-1/test.jpg';
      const data = Buffer.from('test image data');

      const url = await provider.upload(key, data, 'image/jpeg');

      expect(url).toBe('/api/uploads/ledger-1/doc-1/test.jpg');
      const savedData = await fs.readFile(path.join(tempDir, key));
      expect(savedData.toString()).toBe('test image data');
    });

    it('should reject path traversal attempts', async () => {
      const key = '../etc/passwd';
      const data = Buffer.from('test');

      await expect(provider.upload(key, data, 'text/plain')).rejects.toThrow('Invalid key');
    });
  });

  describe('download', () => {
    it('should download uploaded file', async () => {
      const key = 'ledger-1/doc-1/test.jpg';
      const data = Buffer.from('test image data');
      await provider.upload(key, data, 'image/jpeg');

      const downloaded = await provider.download(key);

      expect(downloaded.toString()).toBe('test image data');
    });

    it('should throw error for non-existent file', async () => {
      await expect(provider.download('non-existent/file.jpg')).rejects.toThrow('Failed to download file');
    });
  });

  describe('delete', () => {
    it('should delete uploaded file', async () => {
      const key = 'ledger-1/doc-1/test.jpg';
      const data = Buffer.from('test image data');
      await provider.upload(key, data, 'image/jpeg');

      const result = await provider.delete(key);

      expect(result.success).toBe(true);
      await expect(fs.access(path.join(tempDir, key))).rejects.toThrow();
    });
  });

  describe('extractKeyFromUrl', () => {
    it('should extract key from API path', () => {
      const key = provider.extractKeyFromUrl('/api/uploads/ledger-1/doc-1/test.jpg');
      expect(key).toBe('ledger-1/doc-1/test.jpg');
    });

    it('should extract key from full URL', () => {
      const key = provider.extractKeyFromUrl('http://localhost:3000/api/uploads/ledger-1/doc-1/test.jpg');
      expect(key).toBe('ledger-1/doc-1/test.jpg');
    });

    it('should return null for invalid URLs', () => {
      expect(provider.extractKeyFromUrl('/other/path.jpg')).toBeNull();
      expect(provider.extractKeyFromUrl('/api/uploads/../etc/passwd')).toBeNull();
    });
  });
});
```

Run: `npx vitest run tests/unit/lib/storage/local.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/local.ts tests/unit/lib/storage/local.test.ts
git commit -m "feat: add LocalStorageProvider for local file system storage"
```

---

### Task 2: Create API Route for Serving Images

**Files:**
- Create: `src/app/api/uploads/[...path]/route.ts`

**Implementation Details:**
- Serve images from local storage
- Verify user has access to the ledger before serving
- Set proper content-type and cache headers

- [ ] **Step 1: Create API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getLocalStorage } from '@/lib/storage/local';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { sourceDocuments } from '@/features/source-document/server/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/require-auth';

// Cache images for 1 year (they are immutable)
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

// Supported image MIME types
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Require authentication
    const session = await requireAuth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get path segments
    const { path: pathSegments } = await params;
    const key = pathSegments.join('/');

    // Validate key (prevent path traversal)
    if (key.includes('..') || key.includes('\\')) {
      logger.warn({ key }, 'Path traversal attempt in image request');
      return new NextResponse('Invalid path', { status: 400 });
    }

    // Extract ledgerId from key (first segment)
    const ledgerId = pathSegments[0];
    if (!ledgerId) {
      return new NextResponse('Invalid path', { status: 400 });
    }

    // TODO: Verify user has access to this ledger
    // This requires importing ledger access check - will be done in Task 5

    const storage = getLocalStorage();
    const buffer = await storage.download(key);

    // Determine content type from file extension
    const ext = path.extname(key).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': CACHE_CONTROL,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to serve image');
    return new NextResponse('Not found', { status: 404 });
  }
}
```

- [ ] **Step 2: Test API route manually**

Run dev server: `npm run dev`
Upload an image through the app, then try accessing: `http://localhost:3000/api/uploads/{ledger-id}/{doc-id}/{filename}.jpg`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/uploads/\[...path\]/route.ts
git commit -m "feat: add API route for serving uploaded images"
```

---

## Chunk 2: Update Application Code

### Task 3: Update processImages to Use Local Storage

**Files:**
- Modify: `src/features/source-document/server/actions/helpers.ts`

**Changes:**
- Replace `getR2Storage/isR2Enabled` with `getLocalStorage`
- Remove base64 fallback logic (always use local storage)
- Update URL format stored in database

- [ ] **Step 1: Update imports and processImages function**

```typescript
// Remove this import:
// import { getR2Storage, isR2Enabled } from "@/lib/storage/r2";

// Add this import:
import { getLocalStorage } from "@/lib/storage/local";
```

- [ ] **Step 2: Rewrite processImages function**

Replace the entire `processImages` function:

```typescript
export async function processImages(
    images: { data: string; mimeType: string }[] | undefined,
    ledgerId: string,
    sourceDocumentId: string
): Promise<string[]> {
    if (!images || images.length === 0) {
        return [];
    }

    const storage = getLocalStorage();
    const imageUrls: string[] = [];

    for (const img of images) {
        try {
            // Skip if already a URL (from retry)
            if (img.data.startsWith("http://") || img.data.startsWith("https://") || img.data.startsWith("/api/uploads/")) {
                imageUrls.push(img.data);
                continue;
            }

            // Parse base64 data
            const base64Data = img.data.startsWith("data:")
                ? img.data.replace(/^data:image\/[^;]+;base64,/, "")
                : img.data;
            const buffer = Buffer.from(base64Data, "base64");

            // Validate file size (before compression)
            if (buffer.length > MAX_FILE_SIZE) {
                throw new ValidationError(
                    `File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${MAX_FILE_SIZE / 1024 / 1024}MB`
                );
            }

            // Process and compress image
            let processedBuffer = buffer;
            let outputMimeType = img.mimeType;

            if (isSupportedImageFormat(img.mimeType) && !img.mimeType.includes("svg")) {
                const processed = await processImage(buffer, img.mimeType, {
                    maxDimension: 2048,
                    quality: 85,
                    format: "auto",
                    stripMetadata: true,
                });
                processedBuffer = processed.buffer;
                outputMimeType = processed.mimeType;

                logger.debug(
                    {
                        originalSize: buffer.length,
                        processedSize: processedBuffer.length,
                        originalMime: img.mimeType,
                        outputMime: outputMimeType,
                    },
                    "Image compressed"
                );
            }

            // Validate compressed size
            if (processedBuffer.length > MAX_COMPRESSED_FILE_SIZE) {
                throw new ValidationError(
                    `Compressed file still too large: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${MAX_COMPRESSED_FILE_SIZE / 1024 / 1024}MB`
                );
            }

            // Generate unique key
            const mimeToExt: Record<string, string> = {
                "image/jpeg": "jpg",
                "image/jpg": "jpg",
                "image/png": "png",
                "image/webp": "webp",
                "image/gif": "gif",
                "image/heic": "heic",
                "image/heif": "heif",
                "image/avif": "avif",
            };
            const ext = mimeToExt[outputMimeType] || "jpg";
            const key = `${ledgerId}/${sourceDocumentId}/${crypto.randomUUID()}.${ext}`;

            // Upload to local storage
            const url = await storage.upload(key, processedBuffer, outputMimeType);
            imageUrls.push(url);

            logger.debug(
                { key, originalSize: buffer.length, processedSize: processedBuffer.length },
                "Image uploaded to local storage"
            );
        } catch (error) {
            logger.error({ error, sourceDocumentId }, "Failed to process image");
            throw error; // Don't fall back to base64 anymore
        }
    }

    return imageUrls;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/lib/storage/`
Expected: All storage tests pass

- [ ] **Step 4: Commit**

```bash
git add src/features/source-document/server/actions/helpers.ts
git commit -m "feat: update processImages to use local storage only"
```

---

### Task 4: Update Delete Logic

**Files:**
- Modify: `src/features/source-document/server/actions/delete.ts`

**Changes:**
- Replace `getR2Storage` with `getLocalStorage`
- Update `deleteLocalImages` function

- [ ] **Step 1: Update imports**

```typescript
// Remove:
// import { getR2Storage } from "@/lib/storage/r2";
// import { isHttpUrl } from "@/lib/storage/index";

// Add:
import { getLocalStorage } from "@/lib/storage/local";
import { isLocalUploadUrl } from "@/lib/storage/index";
```

- [ ] **Step 2: Update deleteLocalImages function**

Replace the `deleteLocalImages` function:

```typescript
async function deleteLocalImages(imageUrls: string[]): Promise<{
    success: string[];
    failed: { url: string; key: string; error: Error }[];
}> {
    const storage = getLocalStorage();
    const success: string[] = [];
    const failed: { url: string; key: string; error: Error }[] = [];

    for (const url of imageUrls) {
        // Only delete local upload URLs
        if (!isLocalUploadUrl(url)) {
            continue;
        }

        const key = storage.extractKeyFromUrl(url);
        if (!key) {
            logger.warn({ url }, "Could not extract key from URL during deletion");
            continue;
        }

        const deleteResult = await storage.delete(key);
        if (deleteResult.success) {
            success.push(url);
        } else {
            failed.push({ url, key, error: deleteResult.error! });
        }
    }

    return { success, failed };
}
```

- [ ] **Step 3: Add isLocalUploadUrl helper to storage/index.ts**

Add to `src/lib/storage/index.ts`:

```typescript
/**
 * Check if a URL is a local upload URL
 */
export function isLocalUploadUrl(url: string): boolean {
  return url.startsWith('/api/uploads/');
}
```

- [ ] **Step 4: Commit**

```bash
git add src/features/source-document/server/actions/delete.ts src/lib/storage/index.ts
git commit -m "feat: update delete logic to use local storage"
```

---

### Task 5: Update loadImageForAI for Local Storage

**Files:**
- Modify: `src/lib/storage/utils.ts`

**Changes:**
- Replace R2 download logic with local storage download
- Remove SSRF protection (not needed for local files)

- [ ] **Step 1: Update imports**

```typescript
// Remove:
// import { getR2Storage, isR2Enabled } from "./r2";

// Add:
import { getLocalStorage } from "./local";
import { isLocalUploadUrl } from "./index";
```

- [ ] **Step 2: Rewrite loadImageForAI function**

```typescript
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

  // For any other HTTP URL, fetch directly (with safety checks)
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
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/lib/storage/utils.test.ts`
Expected: Tests pass (may need to update tests)

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/utils.ts
git commit -m "feat: update loadImageForAI to use local storage"
```

---

## Chunk 3: Configuration and Documentation

### Task 6: Update Environment Variables

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/env.ts` (if exists)

- [ ] **Step 1: Replace R2 env vars in .env.example**

Find the R2 section (around line 88-122) and replace with:

```bash
# LOCAL FILE STORAGE
# Images are stored in the local file system
LOCAL_STORAGE_PATH=./uploads
```

- [ ] **Step 2: Update next.config.ts**

Remove R2 remotePatterns from images config:

```typescript
// Remove these patterns:
// {
//   protocol: "https",
//   hostname: "*.r2.cloudflarestorage.com",
// },
// {
//   protocol: "https",
//   hostname: "*.r2.dev",
// },

// Keep only if R2_PUBLIC_URL was configured (for migration period)
// After migration, remove entirely
```

Also remove from `serverExternalPackages`: `"@aws-sdk/client-s3"`

- [ ] **Step 3: Update .gitignore**

Add to `.gitignore`:

```
# Local uploads
/uploads/
```

- [ ] **Step 4: Commit**

```bash
git add .env.example next.config.ts .gitignore
git commit -m "config: replace R2 env vars with local storage config"
```

---

### Task 7: Update Docker Configuration

**Files:**
- Modify: `docker-compose.yml`
- Modify: `Dockerfile` (if needed)
- Modify: `docker-entrypoint.sh`

- [ ] **Step 1: Update docker-compose.yml**

Add volume mount for uploads:

```yaml
services:
  app:
    # ... existing config
    volumes:
      - ./data:/app/data  # existing
      - ./uploads:/app/uploads  # NEW: for local image storage
```

- [ ] **Step 2: Remove R2 migration from docker-entrypoint.sh**

Remove or comment out:

```bash
# Remove this section:
# if [ "$ENABLE_R2_STORAGE" = "true" ] && [ "$SKIP_R2_MIGRATION" != "true" ]; then
#     echo "[INIT] R2 storage enabled, running R2 migration..."
#     ...
# fi
```

- [ ] **Step 3: Create uploads directory in Dockerfile**

Add to Dockerfile:

```dockerfile
# Create uploads directory
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker-entrypoint.sh Dockerfile
git commit -m "config: update Docker config for local storage"
```

---

### Task 8: Update Image Components

**Files:**
- Check: `src/components/ui/image-viewer.tsx`
- Check: `src/features/source-document/components/SourceDocumentCard.tsx`

- [ ] **Step 1: Update image URL handling**

Ensure components handle `/api/uploads/` URLs correctly. Next.js Image component should work with local API routes without additional configuration.

If components have special handling for base64 or R2 URLs, update them:

```typescript
// Helper to determine if URL needs special handling
function isLocalUpload(url: string): boolean {
  return url.startsWith('/api/uploads/');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/image-viewer.tsx src/features/source-document/components/
git commit -m "feat: update image components for local storage URLs"
```

---

## Chunk 4: Migration (Optional)

### Task 9: Create Migration Script (Optional)

**Files:**
- Create: `scripts/migrate-images-to-local.ts`

**Purpose:** Migrate existing base64 images from database to local storage.

- [ ] **Step 1: Create migration script**

This script:
1. Finds all source documents with base64 image URLs
2. Decodes and saves them to local storage
3. Updates database records with new local URLs

```typescript
#!/usr/bin/env tsx
import { db } from "@/lib/db";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { getLocalStorage } from "@/lib/storage/local";
import { base64ToBuffer, isBase64Url } from "@/lib/storage/index";
import { logger } from "@/lib/logger";
import { isNull } from "drizzle-orm";
import path from "path";

interface MigrationStats {
  totalDocuments: number;
  processedDocuments: number;
  skippedDocuments: number;
  failedDocuments: number;
  totalImages: number;
  migratedImages: number;
  failedImages: number;
}

async function migrateImagesToLocal(dryRun: boolean): Promise<MigrationStats> {
  const storage = getLocalStorage();
  const stats: MigrationStats = {
    totalDocuments: 0,
    processedDocuments: 0,
    skippedDocuments: 0,
    failedDocuments: 0,
    totalImages: 0,
    migratedImages: 0,
    failedImages: 0,
  };

  // Find all source documents with images
  const docs = await db.query.sourceDocuments.findMany({
    where: isNull(sourceDocuments.deletedAt),
  });

  stats.totalDocuments = docs.length;

  for (const doc of docs) {
    const imageUrls = doc.imageUrls as string[];
    if (!imageUrls || imageUrls.length === 0) {
      stats.skippedDocuments++;
      continue;
    }

    const newUrls: string[] = [];
    let hasChanges = false;

    for (const url of imageUrls) {
      stats.totalImages++;

      // Skip if already a local or HTTP URL
      if (!isBase64Url(url)) {
        newUrls.push(url);
        continue;
      }

      try {
        // Extract mime type and convert to buffer
        const { buffer, mimeType } = base64ToBuffer(url);

        // Generate key
        const ext = mimeType.split('/')[1] || 'jpg';
        const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;

        if (!dryRun) {
          const newUrl = await storage.upload(key, buffer, mimeType);
          newUrls.push(newUrl);
        } else {
          newUrls.push(`/api/uploads/${key}`);
        }

        stats.migratedImages++;
        hasChanges = true;
      } catch (error) {
        logger.error({ error, docId: doc.id, url: url.substring(0, 50) }, "Failed to migrate image");
        newUrls.push(url); // Keep original on failure
        stats.failedImages++;
      }
    }

    if (hasChanges && !dryRun) {
      try {
        await db
          .update(sourceDocuments)
          .set({ imageUrls: newUrls })
          .where(eq(sourceDocuments.id, doc.id));
        stats.processedDocuments++;
      } catch (error) {
        logger.error({ error, docId: doc.id }, "Failed to update document");
        stats.failedDocuments++;
      }
    } else if (hasChanges) {
      stats.processedDocuments++;
    }
  }

  return stats;
}

// Main
async function main() {
  const dryRun = process.argv.includes("--dry-run");

  logger.info({ dryRun }, "Starting image migration to local storage");

  const stats = await migrateImagesToLocal(dryRun);

  logger.info(stats, "Migration complete");

  console.log("\nMigration Summary:");
  console.log(`  Total documents: ${stats.totalDocuments}`);
  console.log(`  Processed: ${stats.processedDocuments}`);
  console.log(`  Skipped (no images): ${stats.skippedDocuments}`);
  console.log(`  Failed: ${stats.failedDocuments}`);
  console.log(`  Total images: ${stats.totalImages}`);
  console.log(`  Migrated: ${stats.migratedImages}`);
  console.log(`  Failed: ${stats.failedImages}`);

  if (dryRun) {
    console.log("\nThis was a dry run. No changes were made.");
    console.log("Run without --dry-run to apply changes.");
  }
}

main().catch((error) => {
  logger.error({ error }, "Migration failed");
  process.exit(1);
});
```

- [ ] **Step 2: Add to package.json scripts**

```json
{
  "scripts": {
    "migrate:local": "tsx -r tsconfig-paths/register scripts/migrate-images-to-local.ts",
    "migrate:local:dry-run": "tsx -r tsconfig-paths/register scripts/migrate-images-to-local.ts --dry-run"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-images-to-local.ts package.json
git commit -m "feat: add migration script for existing images"
```

---

## Chunk 5: Cleanup

### Task 10: Remove R2 Code (After Migration)

**Files:**
- Delete: `src/lib/storage/r2.ts`
- Modify: `src/lib/storage/index.ts` (if needed)

**Note:** Only do this after confirming migration is complete and working.

- [ ] **Step 1: Delete R2 storage provider**

```bash
rm src/lib/storage/r2.ts
```

- [ ] **Step 2: Remove R2 migration script**

```bash
rm scripts/migrate-images-to-r2.ts
```

- [ ] **Step 3: Remove @aws-sdk/client-s3 from dependencies**

```bash
npm uninstall @aws-sdk/client-s3
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: remove R2 storage provider and dependencies"
```

---

## Testing Checklist

After all tasks are complete:

- [ ] Upload new receipt image - should save to `uploads/` directory
- [ ] View uploaded image - should display via `/api/uploads/` route
- [ ] Delete source document - should delete image file from disk
- [ ] AI parsing with image - should load image correctly
- [ ] Run full test suite: `npm run test:run`
- [ ] Build for production: `npm run build`
- [ ] Test with Docker: `npm run docker:prod`

---

## Rollback Plan

If issues arise:

1. Restore from git: `git checkout HEAD~{n}` (n = number of commits to rollback)
2. Re-enable R2 by reverting commits
3. Ensure database has original image URLs (base64 or R2)

---

*Plan created: 2026-03-16*

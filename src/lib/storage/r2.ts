import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageProvider } from "./index";
import { logger } from "@/lib/logger";

/**
 * Result of a delete operation
 */
export interface DeleteResult {
  success: boolean;
  key: string;
  error?: Error;
}

/**
 * Cloudflare R2 Storage Provider
 *
 * R2 is S3-compatible, so we use AWS SDK with custom endpoint
 */
export class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;
  private endpoint: string;

  constructor() {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        "R2 configuration missing. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME"
      );
    }

    this.endpoint = endpoint;
    this.bucket = bucket;
    this.publicUrl = publicUrl || endpoint.replace(/\.r2\.cloudflarestorage\.com$/, ".r2.dev");

    this.client = new S3Client({
      region: "auto", // R2 uses 'auto' region
      endpoint: this.endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    logger.info({ bucket, endpoint: this.endpoint }, "R2 storage initialized");
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        })
      );

      const url = this.getPublicUrl(key);
      logger.debug({ key, size: data.length, contentType }, "File uploaded to R2");
      return url;
    } catch (error) {
      logger.error({ error, key }, "Failed to upload file to R2");
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!response.Body) {
        throw new Error("Empty response body");
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      logger.debug({ key, size: buffer.length }, "File downloaded from R2");
      return buffer;
    } catch (error) {
      logger.error({ error, key }, "Failed to download file from R2");
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async delete(key: string): Promise<DeleteResult> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      logger.debug({ key }, "File deleted from R2");
      return { success: true, key };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ error: err, key }, "Failed to delete file from R2");
      // Return failure instead of throwing to allow caller to handle
      return { success: false, key, error: err };
    }
  }

  getPublicUrl(key: string): string {
    // Remove leading slash if present
    const cleanKey = key.startsWith("/") ? key.slice(1) : key;
    return `${this.publicUrl}/${cleanKey}`;
  }

  extractKeyFromUrl(url: string): string | null {
    if (!url.startsWith(this.publicUrl)) {
      return null;
    }
    return url.slice(this.publicUrl.length + 1); // +1 for the trailing slash
  }
}

/**
 * Singleton instance of R2 storage provider
 */
let r2Instance: R2StorageProvider | null = null;

export function getR2Storage(): R2StorageProvider {
  if (!r2Instance) {
    r2Instance = new R2StorageProvider();
  }
  return r2Instance;
}

/**
 * Check if R2 storage is configured and enabled
 *
 * Note: Using const env reference ensures runtime evaluation,
 * preventing Next.js build-time tree-shaking of R2 code.
 */
export function isR2Enabled(): boolean {
  // Runtime environment check to prevent build-time tree-shaking
  const env = process.env;
  return (
    env.ENABLE_R2_STORAGE === "true" &&
    !!env.R2_ENDPOINT &&
    !!env.R2_ACCESS_KEY_ID &&
    !!env.R2_SECRET_ACCESS_KEY &&
    !!env.R2_BUCKET_NAME
  );
}

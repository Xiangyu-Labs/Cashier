import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { AppError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { assertSafeStorageKey, type StorageProvider } from "./index";

type R2Client = Pick<S3Client, "send">;

function isNotFound(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    value.name === "NoSuchKey" ||
    value.name === "NotFound" ||
    value.$metadata?.httpStatusCode === 404
  );
}

function storageError(message: string, code: string, key: string, cause?: unknown): AppError {
  logger.error(
    { provider: "r2", key, errorName: cause instanceof Error ? cause.name : "UnknownError" },
    message
  );
  return new AppError(message, code, code === "FILE_NOT_FOUND" ? 404 : 503, {
    provider: "r2",
    key,
  });
}

export function createR2ClientConfig(): S3ClientConfig {
  return {
    region: "auto",
    endpoint: `https://${runtimeEnv.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: runtimeEnv.r2AccessKeyId,
      secretAccessKey: runtimeEnv.r2SecretAccessKey,
    },
  };
}

export class R2StorageProvider implements StorageProvider {
  private client: R2Client | null;

  constructor(
    client?: R2Client,
    private readonly configuredBucket?: string
  ) {
    this.client = client ?? null;
  }

  private getClient(): R2Client {
    this.client ??= new S3Client(createR2ClientConfig());
    return this.client;
  }

  private getBucket(): string {
    return this.configuredBucket ?? runtimeEnv.r2BucketName;
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<void> {
    assertSafeStorageKey(key);
    try {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.getBucket(),
          Key: key,
          Body: data,
          ContentType: contentType,
        })
      );
    } catch (error) {
      throw storageError("Failed to upload file to R2", "R2_UPLOAD_FAILED", key, error);
    }
  }

  async download(key: string): Promise<Buffer> {
    assertSafeStorageKey(key);
    try {
      const response = await this.getClient().send(
        new GetObjectCommand({ Bucket: this.getBucket(), Key: key })
      );
      if (response.Body == null) throw storageError("File not found in R2", "FILE_NOT_FOUND", key);
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFound(error)) {
        throw storageError("File not found in R2", "FILE_NOT_FOUND", key, error);
      }
      throw storageError("Failed to download file from R2", "R2_DOWNLOAD_FAILED", key, error);
    }
  }

  async delete(key: string): Promise<{ success: boolean; key: string; error?: Error }> {
    assertSafeStorageKey(key);
    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: this.getBucket(), Key: key })
      );
      return { success: true, key };
    } catch (error) {
      const mapped = storageError("Failed to delete file from R2", "R2_DELETE_FAILED", key, error);
      return { success: false, key, error: mapped };
    }
  }
}

let instance: R2StorageProvider | null = null;

export function getR2Storage(): R2StorageProvider {
  instance ??= new R2StorageProvider();
  return instance;
}

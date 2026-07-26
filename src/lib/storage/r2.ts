import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { assertSafeStorageKey, type StorageProvider } from "./index";

type R2Client = Pick<S3Client, "send">;

export interface R2ObjectMetadata {
  byteSize: number;
  contentType: string;
  metadata: Readonly<Record<string, string>>;
}

type Presign = typeof getSignedUrl;

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
    private readonly configuredBucket?: string,
    private readonly presign: Presign = getSignedUrl
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

  async presignUpload(
    key: string,
    contentType: string,
    sha256: string,
    expiresInSeconds: number
  ): Promise<{ url: string; requiredHeaders: Readonly<Record<string, string>> }> {
    assertSafeStorageKey(key);
    try {
      const requiredHeaders = {
        "Content-Type": contentType,
        "x-amz-meta-sha256": sha256,
      } as const;
      const url = await this.presign(
        this.getClient() as S3Client,
        new PutObjectCommand({
          Bucket: this.getBucket(),
          Key: key,
          ContentType: contentType,
          Metadata: { sha256 },
        }),
        {
          expiresIn: expiresInSeconds,
          signableHeaders: new Set(["content-type"]),
          unhoistableHeaders: new Set(["x-amz-meta-sha256"]),
        }
      );
      return { url, requiredHeaders };
    } catch (error) {
      throw storageError("Failed to sign R2 upload", "R2_PRESIGN_FAILED", key, error);
    }
  }

  async head(key: string): Promise<R2ObjectMetadata> {
    assertSafeStorageKey(key);
    try {
      const response = await this.getClient().send(
        new HeadObjectCommand({ Bucket: this.getBucket(), Key: key })
      );
      if (response.ContentLength == null || response.ContentType == null) {
        throw storageError("R2 object metadata is incomplete", "R2_HEAD_FAILED", key);
      }
      return {
        byteSize: response.ContentLength,
        contentType: response.ContentType,
        metadata: response.Metadata ?? {},
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFound(error)) {
        throw storageError("File not found in R2", "FILE_NOT_FOUND", key, error);
      }
      throw storageError("Failed to inspect R2 object", "R2_HEAD_FAILED", key, error);
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    assertSafeStorageKey(sourceKey);
    assertSafeStorageKey(destinationKey);
    const copySource = `${this.getBucket()}/${sourceKey
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    try {
      await this.getClient().send(
        new CopyObjectCommand({
          Bucket: this.getBucket(),
          Key: destinationKey,
          CopySource: copySource,
          MetadataDirective: "COPY",
        })
      );
    } catch (error) {
      throw storageError("Failed to promote R2 object", "R2_COPY_FAILED", destinationKey, error);
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
      await this.getClient().send(new DeleteObjectCommand({ Bucket: this.getBucket(), Key: key }));
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

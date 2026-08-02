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

type ObjectClient = Pick<S3Client, "send">;
type Presign = typeof getSignedUrl;

export interface S3ObjectMetadata {
  byteSize: number;
  contentType: string;
  metadata: Readonly<Record<string, string>>;
}

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
    { provider: "s3", key, errorName: cause instanceof Error ? cause.name : "UnknownError" },
    message
  );
  return new AppError(message, code, code === "FILE_NOT_FOUND" ? 404 : 503, {
    provider: "s3",
    key,
  });
}

export function createS3ClientConfig(): S3ClientConfig {
  return {
    region: runtimeEnv.s3Region,
    endpoint: runtimeEnv.s3Endpoint,
    forcePathStyle: runtimeEnv.s3ForcePathStyle,
    credentials: {
      accessKeyId: runtimeEnv.s3AccessKeyId,
      secretAccessKey: runtimeEnv.s3SecretAccessKey,
    },
  };
}

export class S3StorageProvider implements StorageProvider {
  private client: ObjectClient | null;
  private presignClient: S3Client | null = null;

  constructor(
    client?: ObjectClient,
    private readonly configuredBucket?: string,
    private readonly presign: Presign = getSignedUrl
  ) {
    this.client = client ?? null;
    this.presignClient = client == null ? null : (client as S3Client);
  }

  private getClient(): ObjectClient {
    this.client ??= new S3Client(createS3ClientConfig());
    return this.client;
  }

  private getBucket(): string {
    return this.configuredBucket ?? runtimeEnv.s3Bucket;
  }

  private getPresignClient(): S3Client {
    this.presignClient ??= new S3Client({
      ...createS3ClientConfig(),
      endpoint: runtimeEnv.s3PublicEndpoint ?? runtimeEnv.s3Endpoint,
    });
    return this.presignClient;
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
      throw storageError("Failed to upload file to S3", "S3_UPLOAD_FAILED", key, error);
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
        this.getPresignClient(),
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
      throw storageError("Failed to sign S3 upload", "S3_PRESIGN_FAILED", key, error);
    }
  }

  async head(key: string): Promise<S3ObjectMetadata> {
    assertSafeStorageKey(key);
    try {
      const response = await this.getClient().send(
        new HeadObjectCommand({ Bucket: this.getBucket(), Key: key })
      );
      if (response.ContentLength == null || response.ContentType == null) {
        throw storageError("S3 object metadata is incomplete", "S3_HEAD_FAILED", key);
      }
      return {
        byteSize: response.ContentLength,
        contentType: response.ContentType,
        metadata: response.Metadata ?? {},
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFound(error)) {
        throw storageError("File not found in S3", "FILE_NOT_FOUND", key, error);
      }
      throw storageError("Failed to inspect S3 object", "S3_HEAD_FAILED", key, error);
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
      throw storageError("Failed to copy S3 object", "S3_COPY_FAILED", destinationKey, error);
    }
  }

  async download(key: string): Promise<Buffer> {
    assertSafeStorageKey(key);
    try {
      const response = await this.getClient().send(
        new GetObjectCommand({ Bucket: this.getBucket(), Key: key })
      );
      if (response.Body == null) throw storageError("File not found in S3", "FILE_NOT_FOUND", key);
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFound(error)) {
        throw storageError("File not found in S3", "FILE_NOT_FOUND", key, error);
      }
      throw storageError("Failed to download file from S3", "S3_DOWNLOAD_FAILED", key, error);
    }
  }

  async stream(key: string): Promise<ReadableStream<Uint8Array>> {
    assertSafeStorageKey(key);
    try {
      const response = await this.getClient().send(
        new GetObjectCommand({ Bucket: this.getBucket(), Key: key })
      );
      if (response.Body == null) throw storageError("File not found in S3", "FILE_NOT_FOUND", key);
      return response.Body.transformToWebStream();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFound(error)) {
        throw storageError("File not found in S3", "FILE_NOT_FOUND", key, error);
      }
      throw storageError("Failed to stream file from S3", "S3_DOWNLOAD_FAILED", key, error);
    }
  }

  async delete(key: string): Promise<{ success: boolean; key: string; error?: Error }> {
    assertSafeStorageKey(key);
    try {
      await this.getClient().send(new DeleteObjectCommand({ Bucket: this.getBucket(), Key: key }));
      return { success: true, key };
    } catch (error) {
      const mapped = storageError("Failed to delete file from S3", "S3_DELETE_FAILED", key, error);
      return { success: false, key, error: mapped };
    }
  }
}

let instance: S3StorageProvider | null = null;

export function getS3Storage(): S3StorageProvider {
  instance ??= new S3StorageProvider();
  return instance;
}

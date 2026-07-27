// Compatibility exports for internal consumers that have not migrated names yet.
export {
  S3StorageProvider as R2StorageProvider,
  createS3ClientConfig as createR2ClientConfig,
  getS3Storage as getR2Storage,
} from "./s3";
export type { S3ObjectMetadata as R2ObjectMetadata } from "./s3";

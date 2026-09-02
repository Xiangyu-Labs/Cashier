import type { LedgerId, StoredFileId, UploadSessionId } from "./source-documents";

interface TrustedFileMetadata {
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
  checksum: string | null;
}

export interface StoredFileContract {
  id: StoredFileId;
  ownerLedgerId: LedgerId;
  metadata: TrustedFileMetadata;
  createdAt: string;
}

interface UploadTargetContract {
  id: string;
  method: "PUT" | "POST";
  url: string;
  requiredHeaders: Readonly<Record<string, string>>;
}

export interface UploadFileRequestContract {
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
  checksum?: string | null;
}

export interface UploadPlanContract {
  id: UploadSessionId;
  expiresAt: string;
  targets: readonly UploadTargetContract[];
  finalizationToken: string;
  maxFiles: number;
  maxBytesPerFile: number;
}

export interface UploadFinalizationContract {
  uploadSessionId: UploadSessionId;
  finalizationToken: string;
  targetIds: readonly string[];
  ownerLedgerId?: LedgerId;
}

export interface AuthorizedFileReadContract {
  file: StoredFileContract;
  body: Uint8Array;
}

interface UploadPlanningPort {
  createUploadPlan(
    ledgerId: LedgerId,
    files?: readonly UploadFileRequestContract[]
  ): Promise<UploadPlanContract>;
}

interface UploadFinalizationPort {
  finalizeUpload(input: UploadFinalizationContract): Promise<readonly StoredFileContract[]>;
}

interface AuthorizedStoredFilePort {
  readAuthorized(
    ledgerId: LedgerId,
    fileId: StoredFileId
  ): Promise<AuthorizedFileReadContract | null>;
}

export interface StoredFilePort
  extends UploadPlanningPort, UploadFinalizationPort, AuthorizedStoredFilePort {}

export interface DirectStoredFilePort extends StoredFilePort {
  createDirectUploadPlan(
    ledgerId: LedgerId,
    files: readonly UploadFileRequestContract[]
  ): Promise<UploadPlanContract>;
  finalizeDirectUpload(input: UploadFinalizationContract): Promise<readonly StoredFileContract[]>;
  abandonUploadSession(ledgerId: LedgerId, uploadSessionId: string): Promise<void>;
}

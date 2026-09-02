import type {
  AuthorizedFileReadContract,
  LedgerId,
  StoredFileContract,
  StoredFileId,
} from "@/application/contracts";
import { AppError } from "@/lib/errors";
import { mapStoredFile } from "./shared";
import { StoredFileUploadFinalizationAdapter } from "./upload-finalization";

export class StoredFileAuthorizedReadAdapter extends StoredFileUploadFinalizationAdapter {
  async readAuthorized(
    ledgerId: LedgerId,
    fileId: StoredFileId
  ): Promise<AuthorizedFileReadContract | null> {
    const row = await this.authorizedFiles.findForLedger(ledgerId, fileId);
    if (row == null) return null;
    if (row.storageProvider !== "s3") {
      throw new AppError(
        `Unsupported stored file provider: ${row.storageProvider}`,
        "UNSUPPORTED_STORAGE_PROVIDER",
        500,
        { provider: row.storageProvider, fileId: row.id }
      );
    }
    const body = await this.storage.download(row.storageKey);
    return { file: mapStoredFile(row), body: new Uint8Array(body) };
  }

  async readAuthorizedForUser(
    userId: string,
    fileId: string
  ): Promise<AuthorizedFileReadContract | null> {
    const row = await this.authorizedFiles.findForUser(userId, fileId);
    if (row == null) return null;
    if (row.storageProvider !== "s3") {
      throw new AppError(
        `Unsupported stored file provider: ${row.storageProvider}`,
        "UNSUPPORTED_STORAGE_PROVIDER",
        500,
        { provider: row.storageProvider, fileId: row.id }
      );
    }
    const body = await this.storage.download(row.storageKey);
    return { file: mapStoredFile(row), body: new Uint8Array(body) };
  }

  async readAuthorizedStreamForUser(
    userId: string,
    fileId: string
  ): Promise<{
    file: StoredFileContract;
    body: ReadableStream<Uint8Array>;
  } | null> {
    if (this.storage.stream == null) {
      const read = await this.readAuthorizedForUser(userId, fileId);
      if (read == null) return null;
      return {
        file: read.file,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(read.body);
            controller.close();
          },
        }),
      };
    }
    const row = await this.authorizedFiles.findForUser(userId, fileId);
    if (row == null) return null;
    if (row.storageProvider !== "s3") {
      throw new AppError(
        `Unsupported stored file provider: ${row.storageProvider}`,
        "UNSUPPORTED_STORAGE_PROVIDER",
        500,
        { provider: row.storageProvider, fileId: row.id }
      );
    }
    return { file: mapStoredFile(row), body: await this.storage.stream(row.storageKey) };
  }
}

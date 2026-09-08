import type { CreatedRecordResult } from "@/modules/source-document/contracts";

interface SourceDocumentInputBaseProps {
  ledgerId: string;
  onSuccess?: (result: CreatedRecordResult) => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  timeZone?: string;
  initialData?: {
    text?: string;
    images?: Array<{ data: string; mimeType: string; storedFileId?: string }>;
    entryDate?: string;
  };
}

export type SourceDocumentInputProps = SourceDocumentInputBaseProps &
  (
    | { mode?: "create"; sourceDocumentId?: never; sourceDocumentVersion?: never }
    | {
        mode: "retry";
        sourceDocumentId: string;
        sourceDocumentVersion: number;
        initialData: NonNullable<SourceDocumentInputBaseProps["initialData"]>;
      }
  );

export interface SourceDocumentInputProps {
  ledgerId: string;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  timeZone?: string;
  mode?: "create" | "retry";
  sourceDocumentId?: string;
  initialData?: {
    text?: string;
    images?: Array<{ data: string; mimeType: string; storedFileId?: string }>;
    entryDate?: string;
  };
}

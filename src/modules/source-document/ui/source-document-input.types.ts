export interface SourceDocumentInputProps {
  ledgerId: string;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: "create" | "retry";
  sourceDocumentId?: string;
  initialData?: {
    text?: string;
    images?: Array<{ data: string; mimeType: string; storedFileId?: string }>;
    entryDate?: string;
  };
}

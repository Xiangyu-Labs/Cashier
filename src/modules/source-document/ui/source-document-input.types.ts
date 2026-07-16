export interface SourceDocumentInputProps {
  ledgerId: string;
  onSuccess?: () => void;
  mode?: "create" | "retry";
  sourceDocumentId?: string;
  initialData?: {
    text?: string;
    images?: Array<{ data: string; mimeType: string; storedFileId?: string }>;
    entryDate?: string;
  };
}

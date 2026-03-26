import type { z } from "zod";
import type {
  listAdminEntriesInputSchema,
  listAdminEntriesValidatedInputSchema,
  listAdminSourceDocumentsInputSchema,
  listAdminSourceDocumentsValidatedInputSchema,
  listAdminTasksInputSchema,
  listAdminTasksValidatedInputSchema,
} from "./contract-schemas";
import type { UserRoleValue } from "./types";
import type {
  SourceDocMetadata,
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
} from "@/modules/source-document/types";

export type AdminTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type AdminTaskRange = "24h" | "7d" | "30d" | "all";

export type AdminSourceDocumentStatus = SourceDocumentStatusType;
export type AdminSourceDocumentType = SourceDocumentTypeValue;
export type AdminSourceDocumentRange = AdminTaskRange;
export type AdminSourceDocumentResult = "all" | "withEntries" | "withoutEntries";

export type AdminEntryRange = AdminTaskRange;
export type AdminEntrySourceLink = "all" | "linked" | "unlinked";

export interface AdminTaskListItem {
  id: string;
  status: AdminTaskStatus;
  type: string;
  title: string;
  progress: string | null;
  error: string | null;
  scopeId: string | null;
  scopeUserEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface AdminTaskDetail {
  id: string;
  status: AdminTaskStatus;
  type: string;
  title: string;
  input: unknown;
  deduplicationKey: string | null;
  scopeId: string | null;
  scopeUserEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  error: string | null;
  progress: string | null;
  tokenUsage: unknown;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  deletedAt: Date | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Date | null;
  image: string | null;
  role: UserRoleValue;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AdminSourceDocumentListItem {
  id: string;
  ledgerId: string;
  userEmail: string | null;
  title: string | null;
  status: AdminSourceDocumentStatus;
  type: AdminSourceDocumentType;
  entryDate: string | null;
  entryCount: number;
  anomalyReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminSourceDocumentDetail {
  id: string;
  ledgerId: string;
  userEmail: string | null;
  title: string | null;
  text: string | null;
  imageUrls: string[];
  status: AdminSourceDocumentStatus;
  type: AdminSourceDocumentType;
  anomalyReason: string | null;
  entryDate: string | null;
  metadata: SourceDocMetadata;
  entryCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AdminEntryCategoryOption {
  id: string;
  name: string;
}

export interface AdminEntryListItem {
  id: string;
  ledgerId: string;
  userEmail: string | null;
  categoryId: string | null;
  categoryName: string | null;
  sourceDocumentId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  createdAt: Date;
}

export interface AdminEntryDetail {
  id: string;
  ledgerId: string;
  userEmail: string | null;
  categoryId: string | null;
  categoryName: string | null;
  sourceDocumentId: string | null;
  sourceDocumentTitle?: string | null;
  sourceDocumentStatus?: AdminSourceDocumentStatus | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  convertedAmount: string | null;
  exchangeRate: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ListAdminTasksResult {
  items: AdminTaskListItem[];
  nextCursor: string | null;
  availableTypes: string[];
  hasAnyTasks: boolean;
}

export interface ListAdminSourceDocumentsResult {
  items: AdminSourceDocumentListItem[];
  nextCursor: string | null;
  availableTypes: AdminSourceDocumentType[];
  hasAnySourceDocuments: boolean;
}

export interface ListAdminEntriesResult {
  items: AdminEntryListItem[];
  nextCursor: string | null;
  availableCurrencies: string[];
  availableCategories: AdminEntryCategoryOption[];
  hasAnyEntries: boolean;
}

export type ListAdminTasksInput = z.input<typeof listAdminTasksInputSchema>;
export type ListAdminTasksValidatedInput = z.infer<typeof listAdminTasksValidatedInputSchema>;
export type ListAdminSourceDocumentsInput = z.input<typeof listAdminSourceDocumentsInputSchema>;
export type ListAdminSourceDocumentsValidatedInput = z.infer<
  typeof listAdminSourceDocumentsValidatedInputSchema
>;
export type ListAdminEntriesInput = z.input<typeof listAdminEntriesInputSchema>;
export type ListAdminEntriesValidatedInput = z.infer<typeof listAdminEntriesValidatedInputSchema>;

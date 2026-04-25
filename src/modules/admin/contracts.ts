import type { z } from "zod";
import type {
  listAdminAccountsInputSchema,
  listAdminAccountsValidatedInputSchema,
  listAdminCategoriesInputSchema,
  listAdminCategoriesValidatedInputSchema,
  listAdminCurrencyRatesInputSchema,
  listAdminCurrencyRatesValidatedInputSchema,
  listAdminEntriesInputSchema,
  listAdminEntriesValidatedInputSchema,
  listAdminLedgersInputSchema,
  listAdminLedgersValidatedInputSchema,
  listAdminOTPTokensInputSchema,
  listAdminOTPTokensValidatedInputSchema,
  listAdminServiceCredentialsInputSchema,
  listAdminServiceCredentialsValidatedInputSchema,
  listAdminSourceDocumentsInputSchema,
  listAdminSourceDocumentsValidatedInputSchema,
  listAdminTasksInputSchema,
  listAdminTasksValidatedInputSchema,
} from "./contract-schemas";
import type { UserRoleValue } from "./types";
import type {
  ActiveSourceDocumentStatusType,
  SourceDocMetadata,
  SourceDocumentTypeValue,
} from "@/modules/source-document/types";

export type AdminTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type AdminTaskRange = "24h" | "7d" | "30d" | "all";

export type AdminSourceDocumentStatus = ActiveSourceDocumentStatusType;
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

export type AdminSystemConfigTier = "system" | "runtime";

export type AdminSystemConfigSource = "environment" | "default" | "missing";

export interface AdminSystemConfigItem {
  name: string;
  tier: AdminSystemConfigTier;
  required: boolean;
  description: string;
  value: string | null;
  source: AdminSystemConfigSource;
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

export interface AdminLedgerListItem {
  id: string;
  userId: string;
  userEmail: string | null;
  mainCurrency: string | null;
  createdAt: Date;
}

export interface AdminLedgerDetail {
  id: string;
  userId: string;
  userEmail: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AdminCategoryListItem {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isEditable: boolean;
  createdAt: Date;
}

export interface AdminCategoryDetail {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isEditable: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AdminAccountListItem {
  userId: string;
  userEmail: string | null;
  provider: string;
  providerAccountId: string;
  type: string;
}

export interface AdminAccountDetail {
  userId: string;
  userEmail: string | null;
  provider: string;
  providerAccountId: string;
  type: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
  idToken: string | null;
  sessionState: string | null;
}

export interface AdminServiceCredentialListItem {
  id: string;
  key: string;
  name: string;
  ledgerId: string;
  userEmail: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface AdminServiceCredentialDetail {
  id: string;
  key: string;
  name: string;
  ledgerId: string;
  userEmail: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  deletedAt: Date | null;
}

export interface AdminCurrencyRateListItem {
  date: string;
  base: string;
  rateCount: number;
  updatedAt: Date;
}

export interface AdminCurrencyRateDetail {
  date: string;
  base: string;
  rates: Record<string, number>;
  updatedAt: Date;
}

export interface AdminOTPTokenListItem {
  id: string;
  email: string;
  expires: Date;
  attempts: number;
  isVerified: boolean;
  ipAddress: string | null;
  createdAt: Date;
}

export interface AdminOTPTokenDetail {
  id: string;
  email: string;
  tokenHash: string;
  expires: Date;
  attempts: number;
  lockedUntil: Date | null;
  ipAddress: string | null;
  createdAt: Date;
  lastAttemptAt: Date | null;
  verifiedAt: Date | null;
}

export interface AdminOverviewStats {
  totalUsers: number;
  totalLedgers: number;
  totalEntries: number;
  totalSourceDocuments: number;
  totalTasks: number;
  totalCategories: number;
  totalServiceCredentials: number;
  totalAccounts: number;
  totalCurrencyRates: number;
  totalOTPTokens: number;
}

export type AdminLedgerRange = "24h" | "7d" | "30d" | "all";

export interface ListAdminLedgersResult {
  items: AdminLedgerListItem[];
  nextCursor: string | null;
  hasAnyLedgers: boolean;
}

export interface ListAdminCategoriesResult {
  items: AdminCategoryListItem[];
  hasAnyCategories: boolean;
}

export interface ListAdminAccountsResult {
  items: AdminAccountListItem[];
  availableProviders: string[];
  hasAnyAccounts: boolean;
}

export interface ListAdminServiceCredentialsResult {
  items: AdminServiceCredentialListItem[];
  nextCursor: string | null;
  hasAnyServiceCredentials: boolean;
}

export interface ListAdminCurrencyRatesResult {
  items: AdminCurrencyRateListItem[];
  nextCursor: string | null;
  hasAnyCurrencyRates: boolean;
}

export interface ListAdminOTPTokensResult {
  items: AdminOTPTokenListItem[];
  nextCursor: string | null;
  hasAnyOTPTokens: boolean;
}

export type ListAdminLedgersInput = z.input<typeof listAdminLedgersValidatedInputSchema>;
export type ListAdminLedgersValidatedInput = z.infer<typeof listAdminLedgersValidatedInputSchema>;
export type ListAdminCategoriesInput = z.input<typeof listAdminCategoriesValidatedInputSchema>;
export type ListAdminCategoriesValidatedInput = z.infer<typeof listAdminCategoriesValidatedInputSchema>;
export type ListAdminAccountsInput = z.input<typeof listAdminAccountsValidatedInputSchema>;
export type ListAdminAccountsValidatedInput = z.infer<typeof listAdminAccountsValidatedInputSchema>;
export type ListAdminServiceCredentialsInput = z.input<typeof listAdminServiceCredentialsValidatedInputSchema>;
export type ListAdminServiceCredentialsValidatedInput = z.infer<typeof listAdminServiceCredentialsValidatedInputSchema>;
export type ListAdminCurrencyRatesInput = z.input<typeof listAdminCurrencyRatesValidatedInputSchema>;
export type ListAdminCurrencyRatesValidatedInput = z.infer<typeof listAdminCurrencyRatesValidatedInputSchema>;
export type ListAdminOTPTokensInput = z.input<typeof listAdminOTPTokensValidatedInputSchema>;
export type ListAdminOTPTokensValidatedInput = z.infer<typeof listAdminOTPTokensValidatedInputSchema>;

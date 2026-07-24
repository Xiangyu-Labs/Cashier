"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  invalidateSourceDocumentCounts,
} from "@/lib/query-keys";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
} from "@/modules/source-document/actions";
import {
  getLedgerTransactionManager,
} from "@/lib/mutations/cache-transaction";
import type {
  CreateSourceDocumentResponseDto,
  SourceDocumentListItemDto,
  MutationReconciliation,
} from "@/modules/source-document/contracts";
import type {
  SourceDocumentInputControllerMessages,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";
import {
  SourceDocumentSubmissionUploadError,
  uploadSourceDocumentSubmissionImages,
} from "./source-document-submission-upload";
import { notifyNewSubmission } from "./revision-state-refresh";
import {
  applyOptimisticUpsert,
  applyOptimisticDelete,
  getStreamQueryMatches,
} from "./source-document-optimistic-cache";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateVariables {
  payload: SourceDocumentSubmitPayload;
  operationId: string;
  clientSubmissionId: string;
}

interface RetryVariables {
  payload: SourceDocumentSubmitPayload;
  operationId: string;
}

interface UseSourceDocumentSubmitMutationsOptions {
  ledgerId: string;
  mode: "create" | "retry";
  sourceDocumentId?: string;
  messages: SourceDocumentInputControllerMessages;
  onSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// Placeholder builder
// ---------------------------------------------------------------------------

function buildPlaceholder(
  ledgerId: string,
  clientSubmissionId: string,
  payload: SourceDocumentSubmitPayload
): SourceDocumentListItemDto {
  const now = new Date().toISOString();
  const entity = {
    id: clientSubmissionId,
    ledgerId,
    title: null,
    text: null,
    files: [],
    status: "queued",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: payload.entryDate ?? null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    hasImages: (payload.images?.length ?? 0) > 0 || (payload.storedFileIds?.length ?? 0) > 0,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
  };
  return entity as unknown as SourceDocumentListItemDto;
}

/**
 * Capture the current entity from the stream cache for a given source document ID.
 * Returns the entity or null if not found.
 */
function captureCurrentEntity(
  queryClient: QueryClient,
  ledgerId: string,
  sourceDocumentId: string
): SourceDocumentListItemDto | null {
  const matches = getStreamQueryMatches(queryClient, ledgerId);
  for (const [, data] of matches) {
    if (!data) continue;
    for (const page of data.pages) {
      const found = page.items.find((item) => item.id === sourceDocumentId);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSourceDocumentSubmitMutations({
  ledgerId,
  mode,
  sourceDocumentId,
  messages,
  onSuccess,
}: UseSourceDocumentSubmitMutationsOptions) {
  const queryClient = useQueryClient();
  // Use module-level singleton to survive remounts (I4)
  const manager = getLedgerTransactionManager(ledgerId);

  const handleSubmitError = (error: Error, fallbackMessage: string) => {
    console.error("Source document submission failed:", error);
    if (error instanceof SourceDocumentSubmissionUploadError) {
      toast.error(error.stage === "prepare" ? messages.imageReadError : messages.imageUploadError);
      return;
    }
    toast.error(fallbackMessage);
  };

  // -----------------------------------------------------------------------
  // Create mutation
  // -----------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: async (variables: CreateVariables) => {
      const { payload, clientSubmissionId } = variables;
      const uploadedPayload = await uploadSourceDocumentSubmissionImages(ledgerId, payload);
      return createSourceDocumentAction(
        ledgerId,
        uploadedPayload,
        variables.operationId,
        clientSubmissionId
      );
    },
    onMutate: async (variables: CreateVariables) => {
      const { payload, operationId, clientSubmissionId } = variables;

      // Start transaction operation with the pre-generated operationId
      const op = manager.startOperation(ledgerId);

      // Build a queued placeholder entity
      const placeholder = buildPlaceholder(ledgerId, clientSubmissionId, payload);

      // Record the patch for rollback — entity is new so prevEntity is null
      op.patches.push({
        type: "upsert",
        entityId: clientSubmissionId,
        entity: placeholder,
        prevEntity: null, // Entity is new
      });
      op.clientSubmissionId = clientSubmissionId;

      // Apply optimistic upsert to stream cache
      applyOptimisticUpsert(queryClient, ledgerId, placeholder);

      return { clientSubmissionId: variables.clientSubmissionId, operationId };
    },
    onSuccess: (data, variables) => {
      const opId = variables.operationId;

      if (data != null) {
        const response = data as CreateSourceDocumentResponseDto &
          Partial<{
            reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
          }>;

        if (response.reconciliation?.entity != null) {
          // C4: Replace placeholder with canonical entity using clientSubmissionId for dedup
          const reconciliation = response.reconciliation!;
          if (reconciliation.clientSubmissionId) {
            manager.replacePlaceholder(
              reconciliation.clientSubmissionId!,
              reconciliation.entity!,
              queryClient
            );
          }

          // Commit the operation — apply canonical data
          manager.commitOperation(opId, reconciliation.entity, queryClient);

          // I3: Apply countPatch if present
          if (reconciliation.countPatch) {
            // counts are handled by onSettled invalidation
          }
        } else {
          manager.commitOperation(opId, null, queryClient);
        }
      } else {
        manager.commitOperation(opId, null, queryClient);
      }

      toast.success(messages.uploadSuccess);
      notifyNewSubmission();
      onSuccess?.();
    },
    onError: (error, variables) => {
      // Roll back the operation
      manager.rollbackOperation(variables.operationId, queryClient);
      handleSubmitError(error, messages.uploadError);
    },
    onSettled: () => {
      // Minimal invalidation for counts only (stream cache is patched)
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  // -----------------------------------------------------------------------
  // Retry mutation
  // -----------------------------------------------------------------------

  const retryMutation = useMutation({
    mutationFn: async (variables: RetryVariables) => {
      if (sourceDocumentId == null) throw new Error("No source document ID for retry");
      const { payload } = variables;
      const uploadedPayload = await uploadSourceDocumentSubmissionImages(ledgerId, payload);
      return editRetrySourceDocumentAction(
        ledgerId,
        sourceDocumentId,
        uploadedPayload,
        variables.operationId
      );
    },
    onMutate: async (variables: RetryVariables) => {
      const { operationId } = variables;

      // Start transaction operation with the pre-generated operationId
      const op = manager.startOperation(ledgerId);

      // C3: Capture current entity from stream cache for rollback
      const prevEntity = sourceDocumentId != null
        ? captureCurrentEntity(queryClient, ledgerId, sourceDocumentId)
        : null;

      const placeholder: SourceDocumentListItemDto = {
        id: sourceDocumentId ?? "",
        ledgerId,
        title: prevEntity?.title ?? null,
        text: null,
        files: [],
        status: "queued",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: prevEntity?.entryDate ?? null,
        metadata: {},
        createdAt: prevEntity?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        hasImages: prevEntity?.hasImages ?? false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: prevEntity?.ledgerEntries ?? [],
      };

      op.patches.push({
        type: "upsert",
        entityId: sourceDocumentId ?? "",
        entity: placeholder,
        prevEntity, // C3: store actual previous entity
      });

      // Apply optimistic update to stream cache
      if (sourceDocumentId != null) {
        applyOptimisticUpsert(queryClient, ledgerId, placeholder);
      }

      return { operationId };
    },
    onSuccess: (data, variables) => {
      const opId = variables.operationId;

      if (data != null) {
        const response = data as Partial<{
          reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
        }>;

        if (response.reconciliation?.entity != null) {
          // I3: Pass real reconciliation entity
          manager.commitOperation(opId, response.reconciliation.entity, queryClient);
        } else {
          manager.commitOperation(opId, null, queryClient);
        }
      } else {
        manager.commitOperation(opId, null, queryClient);
      }

      toast.success(messages.retrySuccess);
      notifyNewSubmission();
      onSuccess?.();
    },
    onError: (error, variables) => {
      manager.rollbackOperation(variables.operationId, queryClient);
      handleSubmitError(error, messages.retryError);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const activeMutation = mode === "retry" ? retryMutation : createMutation;

  const submit = (payload: SourceDocumentSubmitPayload) => {
    if (mode === "retry") {
      if (sourceDocumentId == null) return false;
      // C1: Generate a single operationId used for both the server action and the transaction
      const operationId = crypto.randomUUID();
      retryMutation.mutate({ payload, operationId });
      return true;
    }

    // C1: Generate a single operationId
    const operationId = crypto.randomUUID();
    const clientSubmissionId = crypto.randomUUID();
    createMutation.mutate({ payload, operationId, clientSubmissionId });
    return true;
  };

  return {
    isPending: activeMutation.isPending,
    submit,
  };
}

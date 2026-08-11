"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSourceDocumentInputController } from "../hooks/useSourceDocumentInputController";
import type { SourceDocumentInputProps } from "./source-document-input.types";
import { SourceDocumentInputView } from "./SourceDocumentInputView";

export function SourceDocumentInput({
  ledgerId,
  onSuccess,
  onPendingChange,
  onDirtyChange,
  mode = "create",
  sourceDocumentId,
  initialData,
  timeZone,
}: SourceDocumentInputProps) {
  const t = useTranslations("SourceDocumentInput");
  const tCommon = useTranslations("Common");
  const controller = useSourceDocumentInputController({
    ledgerId,
    mode,
    ...(onSuccess !== undefined ? { onSuccess } : {}),
    ...(sourceDocumentId !== undefined ? { sourceDocumentId } : {}),
    ...(initialData !== undefined ? { initialData } : {}),
    ...(timeZone !== undefined ? { timeZone } : {}),
    messages: {
      uploadError: t("uploadError"),
      retrySuccess: t("retrySuccess"),
      retryError: t("retryError"),
      imageTooLarge: (fileName: string) => t("imageTooLarge", { fileName }),
      imageUnsupported: (fileName: string) => t("imageUnsupported", { fileName }),
      imageReadError: t("imageReadError"),
      imageUploadError: t("imageUploadError"),
      tooManyImages: t("tooManyImages"),
    },
  });

  useEffect(() => {
    onPendingChange?.(controller.isPending);
    return () => onPendingChange?.(false);
  }, [controller.isPending, onPendingChange]);

  useEffect(() => {
    onDirtyChange?.(controller.canSubmit);
    return () => onDirtyChange?.(false);
  }, [controller.canSubmit, onDirtyChange]);

  return (
    <SourceDocumentInputView
      mode={controller.mode}
      text={controller.text}
      entryDate={controller.entryDate}
      images={controller.images}
      selectedImageIndex={controller.selectedImageIndex}
      fileInputRef={controller.fileInputRef}
      isPending={controller.isPending}
      progress={controller.progress}
      canSubmit={controller.canSubmit}
      messages={{
        placeholder: t("placeholder"),
        image: t("image"),
        send: t("send"),
        retry: tCommon("retry"),
        delete: tCommon("delete"),
        sendingStatus: tCommon("sending_status"),
        entryDate: t("entryDate"),
        preparing: t("preparing"),
        uploading: t("uploading"),
        finalizing: t("finalizing"),
        submitting: t("submitting"),
        cancelling: t("cancelling"),
        cancelUpload: t("cancelUpload"),
        uploadedImage: (index: number) => t("uploadedImage", { index }),
      }}
      onEntryDateChange={controller.setEntryDate}
      onTextChange={controller.setText}
      onTextareaPaste={controller.handleTextareaPaste}
      onFileInputChange={controller.handleFileInputChange}
      onSelectImages={controller.triggerFileDialog}
      onSubmit={controller.handleSubmit}
      canCancelUpload={controller.canCancelUpload}
      onCancelUpload={controller.cancelUpload}
      onRemoveImage={controller.removeImage}
      onImageOpen={controller.openImage}
      onImageClose={controller.closeImage}
    />
  );
}

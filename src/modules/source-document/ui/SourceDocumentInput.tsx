"use client";

import { useTranslations } from "next-intl";
import {
  useSourceDocumentInputController,
} from "../hooks/useSourceDocumentInputController";
import type { SourceDocumentInputProps } from "./source-document-input.types";
import { SourceDocumentInputView } from "./SourceDocumentInputView";

export function SourceDocumentInput({
  ledgerId,
  onSuccess,
  mode = "create",
  sourceDocumentId,
  initialData,
}: SourceDocumentInputProps) {
  const t = useTranslations("SourceDocumentInput");
  const tCommon = useTranslations("Common");
  const controller = useSourceDocumentInputController({
    ledgerId,
    mode,
    ...(onSuccess !== undefined ? { onSuccess } : {}),
    ...(sourceDocumentId !== undefined ? { sourceDocumentId } : {}),
    ...(initialData !== undefined ? { initialData } : {}),
    messages: {
      uploadSuccess: t("uploadSuccess"),
      uploadError: t("uploadError"),
      retrySuccess: t("retrySuccess"),
      retryError: t("retryError"),
      imageTooLarge: (fileName: string) => t("imageTooLarge", { fileName }),
    },
  });

  return (
    <SourceDocumentInputView
      mode={controller.mode}
      text={controller.text}
      images={controller.images}
      selectedImageIndex={controller.selectedImageIndex}
      fileInputRef={controller.fileInputRef}
      isPending={controller.isPending}
      canSubmit={controller.canSubmit}
      messages={{
        placeholder: t("placeholder"),
        image: t("image"),
        send: t("send"),
        retry: tCommon("retry"),
        delete: tCommon("delete"),
        sendingStatus: tCommon("sending_status"),
      }}
      onTextChange={controller.setText}
      onTextareaPaste={controller.handleTextareaPaste}
      onFileInputChange={controller.handleFileInputChange}
      onSelectImages={controller.triggerFileDialog}
      onSubmit={controller.handleSubmit}
      onRemoveImage={controller.removeImage}
      onImageOpen={controller.openImage}
      onImageClose={controller.closeImage}
      onImageModalSave={controller.handleModalSave}
    />
  );
}

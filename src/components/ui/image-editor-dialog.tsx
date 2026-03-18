"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageEditor, type ImageEditorHandle } from "./image-editor";

interface ImageEditorDialogProps {
  image: string; // base64 data URL
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (editedImage: { data: string; mimeType: string }) => void;
}

export function ImageEditorDialog({
  image,
  open,
  onOpenChange,
  onSave,
}: ImageEditorDialogProps) {
  const t = useTranslations("ImageEditor");
  const [editedImage, setEditedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const editorRef = useRef<ImageEditorHandle>(null);

  const closeDialog = (finalImage?: { data: string; mimeType: string } | null) => {
    const nextImage = finalImage ?? editedImage ?? editorRef.current?.getConfirmedImage();

    if (nextImage != null && nextImage.data !== image) {
      onSave(nextImage);
    }

    onOpenChange(false);
  };

  const handleAttemptClose = () => {
    if (editorRef.current?.hasPendingToolChanges()) {
      setCloseConfirmOpen(true);
      return;
    }

    closeDialog();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenChange(true);
          }
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 [&>button]:hidden"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
            <DialogTitle>{t("title")}</DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleAttemptClose}
              aria-label={t("closeEditor")}
              title={t("closeEditor")}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            <ImageEditor
              ref={editorRef}
              key={image}
              image={image}
              onChange={setEditedImage}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title={t("pendingChangesTitle")}
        description={t("pendingChangesCloseDescription")}
        cancelLabel={t("continueEditing")}
        onConfirm={() => {}}
        onSave={() => {
          const nextImage = editorRef.current?.commitCurrentTool() ?? editorRef.current?.getConfirmedImage();
          closeDialog(nextImage);
        }}
        onDiscard={() => {
          editorRef.current?.discardCurrentTool();
          closeDialog(editorRef.current?.getConfirmedImage());
        }}
      />
    </>
  );
}

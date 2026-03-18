"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageEditor } from "./image-editor";

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
  const hasEdits = editedImage !== null && editedImage.data !== image;

  const handleSave = () => {
    if (editedImage && hasEdits) {
      onSave(editedImage);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0"
      >
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ImageEditor
            key={image}
            image={image}
            onChange={setEditedImage}
          />
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!hasEdits}>
            {t("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

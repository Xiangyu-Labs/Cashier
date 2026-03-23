"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageEditor, type ImageEditorHandle } from "@/components/ui/image-editor";
import { cn } from "@/lib/utils";

export interface SourceDocumentModalImage {
  data: string;
  mimeType: string;
}

interface SourceDocumentImageModalProps {
  images: SourceDocumentModalImage[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editable?: boolean;
  onSave?: (images: SourceDocumentModalImage[]) => Promise<void> | void;
}

type PendingAction = "close" | "leave-editor" | null;

function areImagesEqual(left: SourceDocumentModalImage[], right: SourceDocumentModalImage[]) {
  return (
    left.length === right.length &&
    left.every(
      (image, index) =>
        image.data === right[index]?.data && image.mimeType === right[index]?.mimeType
    )
  );
}

export function SourceDocumentImageModal({
  images,
  initialIndex = 0,
  open,
  onOpenChange,
  editable = false,
  onSave,
}: SourceDocumentImageModalProps) {
  const t = useTranslations("SourceDocumentImageModal");
  const [workingImages, setWorkingImages] = useState(images);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<ImageEditorHandle>(null);

  const hasImages = workingImages.length > 0;
  const currentImage = hasImages ? workingImages[currentIndex] : null;
  const hasChanges = !areImagesEqual(workingImages, images);

  useEffect(() => {
    if (!open) return;

    setWorkingImages(images);
    setCurrentIndex(Math.min(initialIndex, Math.max(0, images.length - 1)));
    setIsEditing(false);
    setPendingAction(null);
    setIsSaving(false);
  }, [images, initialIndex, open]);

  const closeModal = useCallback(async () => {
    if (hasChanges && onSave != null) {
      setIsSaving(true);
      try {
        await onSave(workingImages);
      } finally {
        setIsSaving(false);
      }
    }

    onOpenChange(false);
  }, [hasChanges, onOpenChange, onSave, workingImages]);

  const handleAttemptClose = useCallback(async () => {
    if (editorRef.current?.hasPendingToolChanges()) {
      setPendingAction("close");
      return;
    }

    await closeModal();
  }, [closeModal]);

  const handleCurrentImageChange = useCallback(
    (nextImage: SourceDocumentModalImage) => {
      setWorkingImages((prev) =>
        prev.map((image, index) => (index === currentIndex ? nextImage : image))
      );
    },
    [currentIndex]
  );

  const handleAttemptLeaveEditor = useCallback(() => {
    if (editorRef.current?.hasPendingToolChanges()) {
      setPendingAction("leave-editor");
      return;
    }

    setIsEditing(false);
  }, []);

  const resolvePendingAction = useCallback(
    async (shouldSave: boolean) => {
      const action = pendingAction;
      if (action == null) return;

      if (shouldSave) {
        editorRef.current?.commitCurrentTool();
      } else {
        editorRef.current?.discardCurrentTool();
      }

      setPendingAction(null);

      if (action === "leave-editor") {
        setIsEditing(false);
        return;
      }

      await closeModal();
    },
    [closeModal, pendingAction]
  );

  const title = useMemo(() => {
    if (!hasImages) return t("title");
    return t("titleWithIndex", { current: currentIndex + 1, total: workingImages.length });
  }, [currentIndex, hasImages, t, workingImages.length]);

  if (!hasImages) return null;

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
          className="flex h-[90vh] w-[95vw] max-w-5xl flex-col p-0 [&>button]:hidden"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
            <DialogTitle>{title}</DialogTitle>
            <div className="flex items-center gap-2">
              {editable && !isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  disabled={isSaving}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  {t("edit")}
                </Button>
              )}
              {editable && isEditing && (
                <Button variant="outline" size="sm" onClick={handleAttemptLeaveEditor}>
                  {t("backToPreview")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void handleAttemptClose()}
                aria-label={t("close")}
                title={t("close")}
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col bg-muted/40">
            {isEditing && currentImage != null ? (
              <ImageEditor
                ref={editorRef}
                key={`${currentIndex}-${currentImage.data}`}
                image={currentImage.data}
                onChange={handleCurrentImageChange}
              />
            ) : (
              <>
                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
                  {workingImages.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-3 top-1/2 z-10 -translate-y-1/2"
                      onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  )}

                  <div className="relative h-full w-full">
                    <Image
                      src={currentImage?.data ?? ""}
                      alt={t("imageAlt", { index: currentIndex + 1 })}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  </div>

                  {workingImages.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-3 top-1/2 z-10 -translate-y-1/2"
                      onClick={() =>
                        setCurrentIndex((prev) => Math.min(workingImages.length - 1, prev + 1))
                      }
                      disabled={currentIndex === workingImages.length - 1}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  )}
                </div>

                {workingImages.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto border-t px-4 py-3">
                    {workingImages.map((image, index) => (
                      <button
                        key={`${image.data}-${index}`}
                        type="button"
                        onClick={() => setCurrentIndex(index)}
                        className={cn(
                          "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-surface",
                          currentIndex === index ? "border-primary" : "border-transparent"
                        )}
                      >
                        <Image
                          src={image.data}
                          alt={t("imageAlt", { index: index + 1 })}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingAction(null);
          }
        }}
        title={t("pendingChangesTitle")}
        description={
          pendingAction === "close"
            ? t("pendingChangesCloseDescription")
            : t("pendingChangesLeaveDescription")
        }
        cancelLabel={t("continueEditing")}
        onConfirm={() => {}}
        onSave={() => {
          resolvePendingAction(true).catch(() => {});
        }}
        onDiscard={() => {
          resolvePendingAction(false).catch(() => {});
        }}
      />
    </>
  );
}

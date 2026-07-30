"use client";
import { useRef, useState, type SetStateAction } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { storedFileReadUrl } from "../stored-file-read";

export interface SourceDocumentModalImage {
  data: string;
  mimeType: string;
  storedFileId?: string;
}

function imageSource(image: SourceDocumentModalImage): string {
  return image.storedFileId == null ? image.data : storedFileReadUrl(image.storedFileId);
}

interface SourceDocumentImageModalProps {
  images: SourceDocumentModalImage[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourceDocumentImageModal({
  images,
  initialIndex = 0,
  open,
  onOpenChange,
}: SourceDocumentImageModalProps) {
  const t = useTranslations("SourceDocumentImageModal");
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const hasImages = images.length > 0;
  const resetKey = `${open}:${initialIndex}:${images.length}`;
  const [navigation, setNavigation] = useState({ resetKey, index: initialIndex });
  const requestedIndex = navigation.resetKey === resetKey ? navigation.index : initialIndex;
  const currentIndex = Math.min(requestedIndex, Math.max(0, images.length - 1));
  const setCurrentIndex = (update: SetStateAction<number>) => {
    setNavigation({
      resetKey,
      index: typeof update === "function" ? update(currentIndex) : update,
    });
  };
  const currentImage = hasImages ? images[currentIndex] : null;

  const title = !hasImages
    ? ""
    : images.length === 1
      ? t("title")
      : t("titleWithIndex", { current: currentIndex + 1, total: images.length });

  if (!hasImages) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
        } else {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent
        variant="viewer"
        aria-describedby={undefined}
        className="flex flex-col gap-0 overflow-hidden border-0 p-0 shadow-none [&>button]:hidden sm:border sm:shadow-modal"
        onOpenAutoFocus={() => {
          restoreFocusRef.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocusRef.current?.focus();
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            setCurrentIndex((previous) => Math.max(0, previous - 1));
          }
          if (event.key === "ArrowRight") {
            setCurrentIndex((previous) => Math.min(images.length - 1, previous + 1));
          }
        }}
      >
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-11 w-11 sm:h-9 sm:w-9"
              onClick={() => onOpenChange(false)}
              aria-label={t("close")}
              title={t("close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col bg-muted/40">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden sm:p-4">
            {images.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                aria-label={t("previous")}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}

            <div className="relative h-full w-full">
              <Image
                src={currentImage == null ? "" : imageSource(currentImage)}
                alt={t("imageAlt", { index: currentIndex + 1 })}
                fill
                unoptimized
                className="object-contain"
              />
            </div>

            {images.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2"
                onClick={() => setCurrentIndex((prev) => Math.min(images.length - 1, prev + 1))}
                disabled={currentIndex === images.length - 1}
                aria-label={t("next")}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:py-3">
              {images.map((image, index) => (
                <button
                  key={`${image.storedFileId ?? image.data}-${index}`}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    currentIndex === index ? "border-primary" : "border-transparent"
                  )}
                  aria-label={t("imageAlt", { index: index + 1 })}
                  aria-current={currentIndex === index ? "true" : undefined}
                >
                  <Image
                    src={imageSource(image)}
                    alt={t("imageAlt", { index: index + 1 })}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

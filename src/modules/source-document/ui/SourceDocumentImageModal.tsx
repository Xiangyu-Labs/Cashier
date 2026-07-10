"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
}

export function SourceDocumentImageModal({
  images,
  initialIndex = 0,
  open,
  onOpenChange,
}: SourceDocumentImageModalProps) {
  const t = useTranslations("SourceDocumentImageModal");
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const hasImages = images.length > 0;
  const currentImage = hasImages ? images[currentIndex] : null;

  useEffect(() => {
    if (!open) return;
    setCurrentIndex(Math.min(initialIndex, Math.max(0, images.length - 1)));
  }, [images, initialIndex, open]);

  if (!hasImages) return null;

  const title = useMemo(() => {
    if (images.length === 1) return t("title");
    return t("titleWithIndex", { current: currentIndex + 1, total: images.length });
  }, [currentIndex, images.length, t]);

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
        aria-describedby={undefined}
        className="flex h-[90vh] w-[95vw] max-w-5xl flex-col p-0 [&>button]:hidden"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label={t("close")}
              title={t("close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col bg-muted/40">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            {images.length > 1 && (
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

            {images.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2"
                onClick={() =>
                  setCurrentIndex((prev) => Math.min(images.length - 1, prev + 1))
                }
                disabled={currentIndex === images.length - 1}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-t px-4 py-3">
              {images.map((image, index) => (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import Image from "next/image";
import { ImageViewer } from "@/components/ui/image-viewer";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface SourceDocumentOriginalContentProps {
  text?: string | null;
  images?: string[];
  className?: string;
}

export function SourceDocumentOriginalContent({
  text,
  images = [],
  className,
}: SourceDocumentOriginalContentProps) {
  const t = useTranslations("Common");
  const tViewer = useTranslations("ImageViewer");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const hasImages = images && images.length > 0;

  if (!text && !hasImages) {
    return (
      <p
        className={cn(
          "text-muted-foreground text-sm border border-dashed border-border p-4 rounded-xl m-4",
          className
        )}
      >
        {t("noContent")}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Image Content - Maximized for Vertical Fill */}
      {hasImages && (
        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="relative flex-1 w-full overflow-hidden cursor-pointer hover:opacity-[0.98] transition-opacity group flex items-center justify-center p-2"
            onClick={() => setIsViewerOpen(true)}
          >
            <div className="relative w-full h-full">
              <Image
                src={images[previewIndex] || images[0]}
                alt={tViewer("imageAlt", { index: previewIndex + 1 })}
                fill
                className="object-contain drop-shadow-2xl"
                priority
              />
            </div>
            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span className="bg-black/40 text-white px-4 py-2 rounded-full text-xs font-bold backdrop-blur-md translate-y-2 group-hover:translate-y-0 transition-all">
                {tViewer("clickToZoom") || tViewer("clickToZoom")}
              </span>
            </div>
          </div>

          {/* Thumbnail Strip (if more than 1 image) */}
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto p-4 pt-0 shrink-0 scrollbar-none items-center justify-center sm:justify-start">
              {images.map((imgSrc, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "relative h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-xl border-2 overflow-hidden cursor-pointer hover:border-primary/50 transition-all bg-surface shadow-md",
                    idx === previewIndex
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent"
                  )}
                  onClick={() => setPreviewIndex(idx)}
                >
                  <Image
                    src={imgSrc}
                    alt={tViewer("imageAlt", { index: idx + 1 })}
                    fill
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <ImageViewer
            images={images}
            initialIndex={previewIndex}
            open={isViewerOpen}
            onOpenChange={setIsViewerOpen}
          />
        </div>
      )}

      {/* Text Content - Elegant overlay or section */}
      {text && (
        <div
          className={cn(
            "shrink-0 p-4 pt-0 border-t border-border/40 bg-surface/50 backdrop-blur-sm",
            !hasImages && "flex-1 overflow-y-auto"
          )}
        >
          <div className="bg-surface2/40 p-3 rounded-xl border border-border/60">
            <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 opacity-60 flex items-center gap-2">
              {t("rawContent") || "RAW CONTENT"}
            </h5>
            <p className="text-xs text-text/90 whitespace-pre-wrap font-mono leading-relaxed">
              {text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

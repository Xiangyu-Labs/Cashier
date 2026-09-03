"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { FileText, ImagePlay, Maximize2 } from "lucide-react";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { cn } from "@/lib/utils";
import { storedFileReadUrl } from "../../../stored-file-read";
import { SourceDocumentImageModal } from "../../SourceDocumentImageModal";

interface SourceDocumentRawEvidenceProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  isLoadingImages: boolean;
}

export function SourceDocumentRawEvidence({
  sourceDocument,
  isLoadingImages,
}: SourceDocumentRawEvidenceProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCard = useTranslations("SourceDocumentCard");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const files = sourceDocument.files;
  const hasImages = files.length > 0;
  const hasRawText = sourceDocument.text != null && sourceDocument.text.trim().length > 0;
  const selectedImageIndex = Math.min(activeImageIndex, Math.max(files.length - 1, 0));

  return (
    <>
      {(hasImages || hasRawText) && (
        <section className="shrink-0 overflow-hidden rounded-lg border border-border/60 bg-surface2/20">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <FileText className="h-3 w-3 text-primary/70" />
              {t("rawEvidence")}
              {(hasImages || hasRawText) && (
                <span className="text-xs font-normal text-muted-foreground/60">
                  (
                  {[hasImages && `${files.length} ${tCard("image")}`, hasRawText && t("rawContent")]
                    .filter(Boolean)
                    .join(", ")}
                  )
                </span>
              )}
            </div>
          </header>

          <div className="space-y-4 px-3 pb-3 pt-3">
            {(hasImages || isLoadingImages) && (
              <div>
                <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60">
                  <ImagePlay className="h-3 w-3 text-primary/60" />
                  {tCard("image")}
                </h5>
                {isLoadingImages ? (
                  <div
                    data-testid="source-document-image-stage-loading"
                    className="aspect-[4/3] w-full animate-pulse rounded-md border border-border/50 bg-border/40 sm:max-h-[52dvh]"
                  />
                ) : files[selectedImageIndex] == null ? null : (
                  <>
                    <button
                      type="button"
                      data-testid="source-document-image-stage"
                      className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-surface2/70 transition-[border-color,background-color] duration-[var(--motion-feedback)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-h-[52dvh]"
                      onClick={() => setViewerIndex(selectedImageIndex)}
                      aria-label={tCard("imageAlt", { index: selectedImageIndex + 1 })}
                    >
                      <Image
                        src={storedFileReadUrl(files[selectedImageIndex].id)}
                        alt={tCard("imageAlt", { index: selectedImageIndex + 1 })}
                        fill
                        className="object-contain p-2"
                      />
                      <span className="fine-pointer-reveal absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-md bg-text/70 text-bg opacity-0 transition-opacity duration-[var(--motion-feedback)] group-focus-visible:opacity-100 group-active:opacity-100">
                        <Maximize2 className="h-4 w-4" />
                      </span>
                    </button>
                    {files.length > 1 ? (
                      <div
                        className="mt-2 flex gap-2 overflow-x-auto pb-1"
                        aria-label={tCard("image")}
                      >
                        {files.map((file, index) => {
                          return (
                            <button
                              key={file.id}
                              type="button"
                              className={cn(
                                "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-surface2 transition-[border-color,opacity] duration-[var(--motion-feedback)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selectedImageIndex === index
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border opacity-75"
                              )}
                              onClick={() => setActiveImageIndex(index)}
                              aria-label={tCard("imageAlt", { index: index + 1 })}
                              aria-current={selectedImageIndex === index ? "true" : undefined}
                            >
                              <Image
                                src={storedFileReadUrl(file.id)}
                                alt=""
                                fill
                                className="object-cover"
                              />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}

            {hasRawText && (
              <div>
                <h5 className="mb-2 text-xs font-medium text-muted-foreground/60">
                  {t("rawContent")}
                </h5>
                <div className="whitespace-pre-wrap break-words rounded-lg border border-border/40 bg-surface/50 p-3 text-sm leading-relaxed text-text/70">
                  {sourceDocument.text}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <SourceDocumentImageModal
        images={files.map((file) => ({
          data: "",
          mimeType: file.contentType,
          storedFileId: file.id,
        }))}
        initialIndex={viewerIndex ?? 0}
        open={viewerIndex !== null}
        onOpenChange={(open: boolean) => !open && setViewerIndex(null)}
      />
    </>
  );
}

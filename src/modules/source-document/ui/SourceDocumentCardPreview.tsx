import Image from "next/image";
import { memo } from "react";
import { useTranslations } from "next-intl";
import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";
import { storedFileReadUrl } from "../stored-file-read";

interface SourceDocumentCardPreviewProps {
  text: string;
  images: SourceDocumentStoredFileDto[];
  onViewDetails?: () => void;
  cachedImageUrls?: ReadonlyMap<string, string>;
  readOnly?: boolean;
}

export const SourceDocumentCardPreview = memo(function SourceDocumentCardPreview({
  text,
  images,
  onViewDetails,
  cachedImageUrls,
  readOnly = false,
}: SourceDocumentCardPreviewProps) {
  const t = useTranslations("SourceDocumentCard");
  return (
    <div className="border-t border-border bg-surface p-3 sm:p-4">
      {images.length > 0 ? (
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {images.map((image, index) => {
            const cachedUrl = cachedImageUrls?.get(image.id);
            const src = cachedUrl ?? (!readOnly ? storedFileReadUrl(image.id) : null);
            return src == null ? null : (
              <button
                key={image.id}
                type="button"
                className="relative aspect-square overflow-hidden rounded-md border border-border bg-surface2 transition-[border-color,opacity] duration-[var(--motion-feedback)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onViewDetails}
                aria-label={t("imageAlt", { index: index + 1 })}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  unoptimized={cachedUrl != null}
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : null}
      {text !== "" ? (
        <div className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface2/40 p-3 text-sm leading-relaxed text-text">
          {text}
        </div>
      ) : null}
    </div>
  );
});

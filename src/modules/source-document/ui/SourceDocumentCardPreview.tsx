import { memo } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";
import { storedFileReadUrl } from "../stored-file-read";

interface SourceDocumentCardPreviewProps {
  text: string;
  images: SourceDocumentStoredFileDto[];
  onViewDetails?: (() => void) | undefined;
}

export const SourceDocumentCardPreview = memo(function SourceDocumentCardPreview({
  text,
  images,
  onViewDetails,
}: SourceDocumentCardPreviewProps) {
  const t = useTranslations("SourceDocumentCard");

  return (
    <div className="bg-surface2/30 border-b border-border">
      <div className="p-4 space-y-3">
        {images.length > 0 && (
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                className="relative aspect-square rounded-lg overflow-hidden border border-border bg-surface2 cursor-pointer hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => onViewDetails?.()}
                aria-label={t("imageAlt", { index: index + 1 })}
              >
                <Image
                  src={storedFileReadUrl(image.id)}
                  alt={t("imageAlt", { index: index + 1 })}
                  fill
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {text !== "" && (
          <div className="text-text bg-surface2/30 p-3 rounded-md text-sm whitespace-pre-wrap leading-relaxed">
            {text}
          </div>
        )}
      </div>
    </div>
  );
});

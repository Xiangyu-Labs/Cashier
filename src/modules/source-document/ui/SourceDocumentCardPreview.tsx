import { memo } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { getSafeImageSrc } from "./source-document-card.utils";

interface SourceDocumentCardPreviewProps {
  text: string;
  images: string[];
  onViewDetails?: () => void;
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
              <div
                key={index}
                className="relative aspect-square rounded-lg overflow-hidden border border-border bg-surface2 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => onViewDetails?.()}
              >
                <Image
                  src={getSafeImageSrc(image)}
                  alt={t("imageAlt", { index: index + 1 })}
                  fill
                  className="object-cover"
                />
              </div>
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

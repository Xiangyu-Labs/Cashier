import { useState } from "react";
import Image from "next/image";
import { ImageViewer } from "@/components/ui/image-viewer";

interface SourceDocumentOriginalContentProps {
    text?: string | null;
    images?: string[];
}

import { useTranslations } from "next-intl";

export function SourceDocumentOriginalContent({
    text,
    images = [],
}: SourceDocumentOriginalContentProps) {
    const t = useTranslations("Common");
    const tViewer = useTranslations("ImageViewer");
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const hasImages = images && images.length > 0;

    if (!text && !hasImages) {
        return <p className="text-muted-foreground text-sm border border-dashed border-border p-2 rounded">{t("noContent")}</p>;
    }

    return (
        <div className="space-y-4">
            {/* Image Content */}
            {hasImages && (
                <div className="space-y-2">
                    <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
                        {images.map((imgSrc, idx) => (
                            <div
                                key={idx}
                                className="relative aspect-square rounded-lg border border-border overflow-hidden cursor-pointer hover:opacity-90 bg-surface2"
                                onClick={() => setSelectedImageIndex(idx)}
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
                    <ImageViewer
                        images={images}
                        initialIndex={selectedImageIndex ?? 0}
                        open={selectedImageIndex !== null}
                        onOpenChange={(open) => !open && setSelectedImageIndex(null)}
                    />
                </div>
            )}

            {/* Text Content */}
            {text && (
                <div className="flex items-start gap-2">
                    <p className="text-sm text-text whitespace-pre-wrap">{text}</p>
                </div>
            )}
        </div>
    );
}

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
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const hasImages = images && images.length > 0;

    if (!text && !hasImages) {
        return <p className={cn("text-muted-foreground text-sm border border-dashed border-border p-2 rounded", className)}>{t("noContent")}</p>;
    }

    return (
        <div className={cn("space-y-4", className)}>
            {/* Image Content */}
            {hasImages && (
                <div className="space-y-2 h-full flex flex-col">
                    {/* Main Image Preview (First Image) */}
                    <div
                        className="relative flex-1 min-h-[200px] w-full rounded-lg border border-border overflow-hidden cursor-pointer hover:opacity-95 bg-surface2 group"
                        onClick={() => setSelectedImageIndex(0)}
                    >
                        <Image
                            src={images[0]}
                            alt={tViewer("imageAlt", { index: 1 })}
                            fill
                            className="object-contain"
                        />
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="bg-black/50 text-white px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm">
                                {tViewer("clickToZoom")}
                            </span>
                        </div>
                    </div>

                    {/* Thumbnail Strip (if more than 1 image) */}
                    {images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 shrink-0">
                            {images.map((imgSrc, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "relative h-16 w-16 shrink-0 rounded-md border overflow-hidden cursor-pointer hover:opacity-90 bg-surface2",
                                        idx === 0 ? "border-primary ring-1 ring-primary" : "border-border"
                                    )}
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
                    )}

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
                <div className="flex items-start gap-2 bg-surface2/30 p-3 rounded-lg border border-border/50">
                    <p className="text-sm text-text whitespace-pre-wrap font-mono text-xs leading-relaxed">{text}</p>
                </div>
            )}
        </div>
    );
}

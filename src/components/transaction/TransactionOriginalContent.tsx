import { FileText, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import { ImageViewer } from "@/components/ui/image-viewer";

interface TransactionOriginalContentProps {
    text?: string | null;
    images?: string[];
}

export function TransactionOriginalContent({
    text,
    images = [],
}: TransactionOriginalContentProps) {
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const hasImages = images && images.length > 0;

    if (!text && !hasImages) {
        return <p className="text-muted text-sm border border-dashed border-border p-2 rounded">无原始内容</p>;
    }

    return (
        <div className="space-y-4">
            {/* Text Content */}
            {text && (
                <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-muted mt-1 shrink-0" />
                    <p className="text-sm text-text whitespace-pre-wrap">{text}</p>
                </div>
            )}

            {/* Image Content */}
            {hasImages && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted">
                        <ImageIcon className="h-4 w-4" />
                        <span>图片记录 ({images.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {images.map((imgSrc, idx) => (
                            <div
                                key={idx}
                                className="relative h-24 w-24 rounded-lg border border-border overflow-hidden cursor-pointer hover:opacity-90 bg-surface2"
                                onClick={() => setSelectedImageIndex(idx)}
                            >
                                <Image
                                    src={imgSrc}
                                    alt={`原始图片 ${idx + 1}`}
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
        </div>
    );
}

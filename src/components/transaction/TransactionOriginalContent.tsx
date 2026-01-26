import { FileText, Image as ImageIcon, Mic } from "lucide-react";

interface TransactionOriginalContentProps {
    content: string;
    contentType: "text" | "image" | "audio";
}

export function TransactionOriginalContent({
    content,
    contentType,
}: TransactionOriginalContentProps) {
    switch (contentType) {
        case "text":
            return (
                <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-muted mt-1 shrink-0" />
                    <p className="text-sm text-text whitespace-pre-wrap">{content}</p>
                </div>
            );
        case "image": {
            // Check if content is JSON array (multiple images) or single data URL
            let images: string[];
            try {
                const parsed = JSON.parse(content);
                images = Array.isArray(parsed) ? parsed : [content];
            } catch {
                // Not JSON, treat as single image data URL
                images = [content];
            }
            return (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted">
                        <ImageIcon className="h-4 w-4" />
                        <span>图片记录</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {images.map((imgSrc, idx) => (
                            <img
                                key={idx}
                                src={imgSrc}
                                alt={`原始图片 ${idx + 1}`}
                                className="max-w-full max-h-48 rounded-lg border border-border object-contain"
                            />
                        ))}
                    </div>
                </div>
            );
        }
        case "audio":
            return (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted">
                        <Mic className="h-4 w-4" />
                        <span>语音记录</span>
                    </div>
                    <audio controls className="w-full">
                        <source src={content} type="audio/webm" />
                        您的浏览器不支持音频播放
                    </audio>
                </div>
            );
        default:
            return <p className="text-muted text-sm">未知类型</p>;
    }
}

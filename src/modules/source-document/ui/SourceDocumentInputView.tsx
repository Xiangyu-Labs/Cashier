"use client";
import Image from "next/image";
import type { ChangeEvent, ClipboardEvent, RefObject } from "react";
import { Camera, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateFilter } from "@/components/ui/date-filter";
import { Textarea } from "@/components/ui/textarea";
import {
  SourceDocumentImageModal,
  type SourceDocumentModalImage,
} from "./SourceDocumentImageModal";

const imageActionButtonClassName =
  "absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-white transition-opacity opacity-100 [@media(any-hover:hover)]:opacity-0 [@media(any-hover:hover)]:group-hover:opacity-100";

export interface SourceDocumentInputViewMessages {
  placeholder: string;
  image: string;
  send: string;
  retry: string;
  delete: string;
  sendingStatus: string;
  entryDate: string;
}

export interface SourceDocumentInputViewProps {
  mode: "create" | "retry";
  text: string;
  entryDate: Date;
  images: SourceDocumentModalImage[];
  selectedImageIndex: number | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  isPending: boolean;
  canSubmit: boolean;
  messages: SourceDocumentInputViewMessages;
  onEntryDateChange: (date: Date) => void;
  onTextChange: (value: string) => void;
  onTextareaPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectImages: () => void;
  onSubmit: () => void;
  onRemoveImage: (index: number) => void;
  onImageOpen: (index: number) => void;
  onImageClose: () => void;
}

export function SourceDocumentInputView({
  mode,
  text,
  entryDate,
  images,
  selectedImageIndex,
  fileInputRef,
  isPending,
  canSubmit,
  messages,
  onEntryDateChange,
  onTextChange,
  onTextareaPaste,
  onFileInputChange,
  onSelectImages,
  onSubmit,
  onRemoveImage,
  onImageOpen,
  onImageClose,
}: SourceDocumentInputViewProps) {
  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image, index) => (
            <div key={`${image.data}-${index}`} className="group relative">
              <div
                className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-md border border-border transition-opacity hover:opacity-90"
                onClick={() => onImageOpen(index)}
              >
                <Image
                  src={image.data}
                  alt={`Uploaded ${index + 1}`}
                  fill
                  className="object-cover"
                />
              </div>

              <button
                onClick={() => onRemoveImage(index)}
                type="button"
                aria-label={messages.delete}
                title={messages.delete}
                className={`${imageActionButtonClassName} right-1 top-1 bg-danger text-xs`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <Textarea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onPaste={onTextareaPaste}
        placeholder={messages.placeholder}
        className="resize-none"
        rows={5}
        autoFocus
      />

      <DateFilter
        value={entryDate}
        onChange={(date) => onEntryDateChange(date ?? new Date())}
        placeholder={messages.entryDate}
        size="sm"
        className="w-full"
      />

      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileInputChange}
          accept="image/*"
          multiple
          className="hidden"
        />
        <Button type="button" variant="outline" size="sm" onClick={onSelectImages}>
          <Camera className="mr-2 h-4 w-4" />
          {messages.image}
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isPending || !canSubmit}
          className="flex-1 sm:flex-initial"
        >
          {isPending ? (
            messages.sendingStatus
          ) : mode === "retry" ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              {messages.retry}
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              {messages.send}
            </>
          )}
        </Button>
      </div>

      <SourceDocumentImageModal
        images={images}
        initialIndex={selectedImageIndex ?? 0}
        open={selectedImageIndex !== null}
        onOpenChange={(open) => {
          if (!open) {
            onImageClose();
          }
        }}
      />
    </div>
  );
}

"use client"
import Image from "next/image"
import { useTranslations } from "next-intl"

import * as React from "react"
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface ImageViewerProps {
    images: string[]
    initialIndex?: number
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ImageViewer({
    images,
    initialIndex = 0,
    open,
    onOpenChange,
}: ImageViewerProps) {
    const t = useTranslations("ImageViewer");
    const [index, setIndex] = React.useState(initialIndex)
    const [scale, setScale] = React.useState(1)
    const [rotation, setRotation] = React.useState(0)
    const [position, setPosition] = React.useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = React.useState(false)
    const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 })

    const resetView = () => {
        setScale(1)
        setRotation(0)
        setPosition({ x: 0, y: 0 })
    }

    React.useEffect(() => {
        if (open) {
            setIndex(initialIndex)
            resetView()
        }
    }, [open, initialIndex])

    const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 4))
    const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 1))

    const handleRotate = () => setRotation((r) => r + 90)

    const handleNext = React.useCallback(() => {
        if (index < images.length - 1) {
            setIndex(index + 1)
            resetView()
        }
    }, [index, images.length])

    const handlePrev = React.useCallback(() => {
        if (index > 0) {
            setIndex(index - 1)
            resetView()
        }
    }, [index])

    // Keyboard support
    React.useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") handleNext()
            if (e.key === "ArrowLeft") handlePrev()
            if (e.key === "Escape") onOpenChange(false)
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [open, handleNext, handlePrev, onOpenChange])

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const delta = e.deltaY > 0 ? -0.1 : 0.1
            setScale((s) => Math.min(Math.max(s + delta, 0.5), 5))
        }
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true)
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
        }
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && scale > 1) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            })
        }
    }

    const handleMouseUp = () => setIsDragging(false)

    if (!images.length) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 border-none bg-black/60 backdrop-blur-md shadow-none flex flex-col items-center justify-center overflow-hidden z-[500]"
                style={{ borderRadius: 0 }}
                onPointerDownOutside={() => onOpenChange(false)}
            >
                <DialogTitle className="sr-only">{t("imageAlt", { index: index + 1 })}</DialogTitle>
                <DialogDescription className="sr-only">Image Viewer</DialogDescription>

                {/* Toolbar */}
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2 pointer-events-auto">
                    <div className="flex bg-black/50 rounded-lg p-1 mr-2 sm:mr-4 backdrop-blur-sm border border-white/10 hidden sm:flex">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={handleZoomOut} disabled={scale <= 0.5} title={t("zoomOut")}>
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="flex items-center justify-center text-white text-xs w-10">
                            {Math.round(scale * 100)}%
                        </span>
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={handleZoomIn} disabled={scale >= 5} title={t("zoomIn")}>
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-6 bg-white/20 mx-1" />
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={handleRotate} title={t("rotate")}>
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-6 bg-white/20 mx-1" />
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={resetView}>
                            <span className="text-xs">{t("reset")}</span>
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-white/70 hover:text-white hover:bg-white/20 rounded-full h-10 w-10 bg-black/20 backdrop-blur-sm"
                        onClick={() => onOpenChange(false)}
                        title={t("close")}
                    >
                        <X className="h-6 w-6" />
                    </Button>
                </div>

                {/* Main Image Area */}
                <div
                    className={cn("flex-1 w-full h-full flex items-center justify-center overflow-hidden",
                        scale <= 1 ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                    )}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) onOpenChange(false)
                    }}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            drag={scale > 1 ? false : "x"}
                            dragConstraints={{ left: 0, right: 0 }}
                            onDragEnd={(e, info) => {
                                if (scale > 1) return
                                const threshold = 50
                                if (info.offset.x < -threshold) handleNext()
                                else if (info.offset.x > threshold) handlePrev()
                            }}
                            className="relative w-full h-full pointer-events-none"
                        >
                            <Image
                                src={images[index]}
                                alt={`Image ${index + 1}`}
                                fill
                                className="object-contain transition-transform duration-100 ease-out pointer-events-auto"
                                style={{
                                    transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})`,
                                }}
                            />
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Navigation */}
                {images.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-16 w-16 hidden sm:flex z-50"
                            onClick={handlePrev}
                            disabled={index === 0}
                        >
                            <ChevronLeft className="h-10 w-10" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-16 w-16 hidden sm:flex z-50"
                            onClick={handleNext}
                            disabled={index === images.length - 1}
                        >
                            <ChevronRight className="h-10 w-10" />
                        </Button>

                        {/* Thumbnails indicator */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] p-2 bg-black/50 backdrop-blur-sm rounded-full z-10 pointer-events-auto">
                            {images.map((img, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setIndex(i); resetView(); }}
                                    className={cn(
                                        "relative w-10 h-10 sm:w-12 sm:h-12 rounded-md overflow-hidden border-2 transition-all shrink-0",
                                        i === index ? "border-primary scale-110" : "border-transparent opacity-50 hover:opacity-80"
                                    )}
                                >
                                    <Image src={img} alt={`Thumbnail ${i + 1}`} fill className="object-cover" />
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

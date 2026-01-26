"use client"

import * as React from "react"
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
    const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 1)) // Min scale 1 to avoid disappearing

    const handleRotate = () => setRotation((r) => r + 90)

    const handleNext = () => {
        if (index < images.length - 1) {
            setIndex(index + 1)
            resetView()
        }
    }

    const handlePrev = () => {
        if (index > 0) {
            setIndex(index - 1)
            resetView()
        }
    }

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            // Zoom
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
                className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 border-none bg-black/95 shadow-none flex flex-col items-center justify-center overflow-hidden z-[9999]"
                // Override default dialog styles that might interfere
                style={{ borderRadius: 0 }}
            >
                <DialogTitle className="sr-only">图片查看</DialogTitle>
                <DialogDescription className="sr-only">Image Viewer</DialogDescription>

                {/* Toolbar */}
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                    <div className="flex bg-black/50 rounded-lg p-1 mr-4 backdrop-blur-sm border border-white/10">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={handleZoomOut} disabled={scale <= 0.5}>
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="flex items-center justify-center text-white text-xs w-10">
                            {Math.round(scale * 100)}%
                        </span>
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={handleZoomIn} disabled={scale >= 5}>
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-6 bg-white/20 mx-1" />
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={handleRotate}>
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-6 bg-white/20 mx-1" />
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={resetView}>
                            <span className="text-xs">Reset</span>
                        </Button>

                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-white/70 hover:text-white hover:bg-white/20 rounded-full h-10 w-10 bg-black/20 backdrop-blur-sm"
                        onClick={() => onOpenChange(false)}
                    >
                        <X className="h-6 w-6" />
                    </Button>
                </div>

                {/* Main Image Area */}
                <div
                    className={cn("flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-move",
                        scale <= 1 ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                    )}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <img
                        src={images[index]}
                        alt={`Image ${index + 1}`}
                        className="max-w-full max-h-full object-contain transition-transform duration-100 ease-out"
                        style={{
                            transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})`,
                            maxWidth: scale > 1 ? 'none' : '100%',
                            maxHeight: scale > 1 ? 'none' : '100%',
                        }}
                        draggable={false}
                    />
                </div>

                {/* Navigation */}
                {images.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-16 w-16"
                            onClick={handlePrev}
                            disabled={index === 0}
                        >
                            <ChevronLeft className="h-10 w-10" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-16 w-16"
                            onClick={handleNext}
                            disabled={index === images.length - 1}
                        >
                            <ChevronRight className="h-10 w-10" />
                        </Button>

                        {/* Thumbnails indicator */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] p-2 bg-black/50 backdrop-blur-sm rounded-full">
                            {images.map((img, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setIndex(i); resetView(); }}
                                    className={cn(
                                        "w-12 h-12 rounded-md overflow-hidden border-2 transition-all",
                                        i === index ? "border-primary scale-110" : "border-transparent opacity-50 hover:opacity-80"
                                    )}
                                >
                                    <img src={img} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    </>
                )}

            </DialogContent>
        </Dialog>
    )
}

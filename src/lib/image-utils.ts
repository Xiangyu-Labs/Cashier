/**
 * Compresses an image file on the client side.
 * @param file The image file to compress
 * @param maxWidth The maximum width of the resulting image
 * @param maxHeight The maximum height of the resulting image
 * @param quality The quality of the JPEG compression (0.0 to 1.0)
 * @returns A promise that resolves to the compressed base64 string and mime type
 */
export async function compressImage(
    file: File,
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.8
): Promise<{ data: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                // Calculate aspect ratio
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Failed to get canvas context"));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Convert to base64 with jpeg format and quality
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                resolve({ data: dataUrl, mimeType: "image/jpeg" });
            };
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}
